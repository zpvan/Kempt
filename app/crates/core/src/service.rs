use crate::{
    error::AppError,
    model::{Status, Task, WorkLog},
    repository::{AppUser, CreateUserResult, TaskRepository},
};
use std::sync::Arc;

pub struct AppService<R> {
    pub(crate) repository: Arc<R>,
    pub(crate) secrets: Option<Arc<dyn crate::secrets::SecretStore>>,
    pub(crate) catalog: Option<Arc<dyn crate::assistant::ProviderCatalog>>,
}

impl<R: TaskRepository> AppService<R> {
    pub fn new(repository: R) -> Self {
        Self {
            repository: Arc::new(repository),
            secrets: None,
            catalog: None,
        }
    }

    pub fn with_assistant(
        repository: R,
        secrets: Arc<dyn crate::secrets::SecretStore>,
        catalog: Arc<dyn crate::assistant::ProviderCatalog>,
    ) -> Self {
        Self {
            repository: Arc::new(repository),
            secrets: Some(secrets),
            catalog: Some(catalog),
        }
    }

    pub fn list_users(&self) -> Result<Vec<AppUser>, AppError> {
        self.repository.list_users()
    }

    pub fn create_user(&self, name: &str) -> Result<CreateUserResult, AppError> {
        let name = name.trim();
        if name.is_empty() || name.len() > 40 {
            return Err(AppError::Validation(
                "Workspace name must contain 1 to 40 characters".into(),
            ));
        }
        if self.repository.list_users()?.iter().any(|user| user.name == name) {
            return Err(AppError::Conflict("Workspace name already exists".into()));
        }
        self.repository.create_user(name)
    }

    pub fn delete_user(&self, id: &str) -> Result<Vec<AppUser>, AppError> {
        let user = self
            .repository
            .list_users()?
            .into_iter()
            .find(|user| user.id == id)
            .ok_or_else(|| AppError::NotFound("Workspace not found".into()))?;
        if id == "shella" || user.is_default {
            return Err(AppError::Conflict(
                "The default workspace cannot be deleted".into(),
            ));
        }
        self.repository.delete_user(id)
    }

    pub fn list_tasks(&self, user_id: &str) -> Result<Vec<Task>, AppError> {
        self.repository.list_tasks(user_id, false)
    }

    pub fn trash(&self, user_id: &str) -> Result<Vec<Task>, AppError> {
        self.repository.list_tasks(user_id, true)
    }

    pub fn upsert_task(&self, user_id: &str, task: Task) -> Result<Vec<Task>, AppError> {
        validate_task(&task)?;
        self.repository.upsert_task(user_id, &normalize_task(task))
    }

    pub fn set_deleted(&self, user_id: &str, id: &str, deleted: bool) -> Result<Vec<Task>, AppError> {
        self.repository.set_deleted(user_id, id, deleted)
    }

    pub fn purge_task(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError> {
        self.repository.purge_task(user_id, id)
    }

    pub fn reorder(&self, user_id: &str, ordered_ids: &[String]) -> Result<Vec<Task>, AppError> {
        if ordered_ids.is_empty() || ordered_ids.len() > 5000 {
            return Err(AppError::Validation(
                "orderedIds must contain 1 to 5000 IDs".into(),
            ));
        }
        self.repository.reorder(user_id, ordered_ids)
    }

    pub fn set_status(&self, user_id: &str, id: &str, status: Status) -> Result<Vec<Task>, AppError> {
        let mut task = self.repository.get_task(user_id, id)?;
        task.status = status;
        task.position = 0;
        if status == Status::Done {
            task.progress = 100;
            for item in &mut task.checklist {
                item.completed = true;
            }
        }
        self.repository.upsert_task(user_id, &task)
    }

    pub fn add_log(&self, user_id: &str, task_id: &str, log: &WorkLog) -> Result<Vec<Task>, AppError> {
        validate_log(log)?;
        let mut task = self.repository.get_task(user_id, task_id)?;
        let mut log = log.clone();
        if log.status == Status::Done {
            for item in &mut task.checklist {
                item.completed = true;
            }
        }
        if !task.checklist.is_empty() && task.checklist.iter().all(|item| item.completed) {
            log.status = Status::Done;
        }
        let progress = if task.checklist.is_empty() {
            if log.status == Status::Done { 100 } else { log.progress }
        } else {
            checklist_progress(&task.checklist)
        };
        log.progress = progress;
        task.status = log.status;
        task.progress = progress;
        self.repository.add_log(user_id, &task, &log)
    }

    pub fn update_log(&self, user_id: &str, log: &WorkLog) -> Result<Vec<Task>, AppError> {
        validate_log(log)?;
        self.repository.update_log(user_id, log)
    }

    pub fn delete_log(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError> {
        self.repository.delete_log(user_id, id)
    }
}

pub fn normalize_task(mut task: Task) -> Task {
    for (position, item) in task.checklist.iter_mut().enumerate() {
        item.position = position as i64;
    }
    if task.status == Status::Done {
        for item in &mut task.checklist {
            item.completed = true;
        }
    }
    if !task.checklist.is_empty() && task.checklist.iter().all(|item| item.completed) {
        task.status = Status::Done;
    }
    task.progress = if task.checklist.is_empty() {
        if task.status == Status::Done { 100 } else { task.progress }
    } else {
        checklist_progress(&task.checklist)
    };
    task
}

fn checklist_progress(items: &[crate::model::ChecklistItem]) -> u8 {
    if items.iter().all(|item| item.completed) {
        return 100;
    }
    ((items.iter().filter(|item| item.completed).count() * 100) as f64 / items.len() as f64).round() as u8
}

pub(crate) fn validate_task(task: &Task) -> Result<(), AppError> {
    task.validate()?;
    if task.parent_id.as_ref().is_some_and(|id| id.len() > 191) {
        return Err(AppError::Validation("Invalid parent task ID".into()));
    }
    for item in &task.checklist {
        if item.id.is_empty()
            || item.id.len() > 191
            || item.content.trim().is_empty()
            || item.content.trim().len() > 500
            || item.position < 0
        {
            return Err(AppError::Validation("Invalid checklist item".into()));
        }
    }
    Ok(())
}

pub(crate) fn validate_log(log: &WorkLog) -> Result<(), AppError> {
    let valid_date = log.date.len() == 10
        && log.date.as_bytes()[4] == b'-'
        && log.date.as_bytes()[7] == b'-'
        && log.date.chars().enumerate().all(|(i, c)| matches!(i, 4 | 7) || c.is_ascii_digit());
    if log.id.is_empty()
        || log.id.len() > 191
        || log.content.is_empty()
        || log.progress > 100
        || !valid_date
    {
        return Err(AppError::Validation("Invalid work log".into()));
    }
    Ok(())
}
