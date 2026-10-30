use crate::{
    branding::BACKUP_FORMAT_V3,
    error::AppError,
    model::Task,
    repository::{AppUser, TaskRepository},
    service::{validate_log, validate_task, AppService},
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct BackupUser {
    pub id: String,
    #[ts(optional)]
    pub owner_union_id: Option<String>,
    pub name: String,
    pub is_default: bool,
    #[ts(optional)]
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct BackupTask {
    #[serde(flatten)]
    #[ts(flatten)]
    pub task: Task,
    pub user_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct BackupPreferences {
    #[ts(optional)]
    pub theme: Option<String>,
    #[ts(optional)]
    pub language: Option<String>,
    #[ts(optional)]
    pub current_user: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct FullBackup {
    pub app: String,
    pub format: String,
    pub version: u8,
    pub exported_at: String,
    pub users: Vec<BackupUser>,
    pub tasks: Vec<BackupTask>,
    #[ts(optional)]
    pub preferences: Option<BackupPreferences>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct RestoreSummary {
    pub users: Vec<AppUser>,
    pub tasks: usize,
    pub logs: usize,
    pub checklist: usize,
    pub deleted_tasks: usize,
}

pub trait BackupRepository: TaskRepository {
    fn export_snapshot(&self) -> Result<FullBackup, AppError>;
    fn replace_snapshot(&self, backup: &FullBackup) -> Result<RestoreSummary, AppError>;
    fn has_tasks(&self) -> Result<bool, AppError>;
}

impl<R: BackupRepository> AppService<R> {
    pub fn export_backup(&self) -> Result<FullBackup, AppError> {
        self.repository.export_snapshot()
    }

    pub fn import_backup(&self, backup: FullBackup) -> Result<RestoreSummary, AppError> {
        validate_backup(&backup)?;
        self.repository.replace_snapshot(&backup)
    }

    pub fn import_local(&self, backup: FullBackup) -> Result<RestoreSummary, AppError> {
        if self.repository.has_tasks()? {
            return Err(AppError::Conflict(
                "Local legacy data can only be imported into an empty database".into(),
            ));
        }
        self.import_backup(backup)
    }
}

fn validate_backup(backup: &FullBackup) -> Result<(), AppError> {
    if backup.format != BACKUP_FORMAT_V3 || backup.version != 3 {
        return Err(AppError::Validation("Unsupported backup format".into()));
    }
    if backup.users.is_empty() || backup.users.len() > 1000 || backup.tasks.len() > 20_000 {
        return Err(AppError::Validation("Invalid backup item counts".into()));
    }
    let mut user_ids = HashSet::new();
    for user in &backup.users {
        if user.id.is_empty()
            || user.id.len() > 64
            || user.name.is_empty()
            || user.name.len() > 100
            || !user_ids.insert(&user.id)
        {
            return Err(AppError::Validation("Invalid backup workspace".into()));
        }
    }
    for backup_task in &backup.tasks {
        if !user_ids.contains(&backup_task.user_id) {
            return Err(AppError::Validation(
                "Backup contains a task with an unknown workspace".into(),
            ));
        }
        validate_task(&backup_task.task)?;
        for log in &backup_task.task.logs {
            validate_log(log)?;
        }
    }
    Ok(())
}
