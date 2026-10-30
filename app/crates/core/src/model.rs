use crate::error::AppError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../contracts/generated/")]
pub enum Status {
    Todo,
    Doing,
    Done,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(export, export_to = "../../../contracts/generated/")]
pub enum Priority {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct WorkLog {
    pub id: String,
    pub date: String,
    pub content: String,
    pub progress: u8,
    pub status: Status,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: String,
    pub content: String,
    pub completed: bool,
    pub position: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub project: String,
    pub status: Status,
    pub priority: Priority,
    pub start_date: String,
    pub due_date: String,
    pub progress: u8,
    pub position: i64,
    pub parent_id: Option<String>,
    pub source_url: Option<String>,
    pub created_at: i64,
    pub deleted_at: Option<String>,
    pub logs: Vec<WorkLog>,
    pub checklist: Vec<ChecklistItem>,
}

impl Task {
    pub fn new(id: &str, title: &str) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            description: String::new(),
            project: String::new(),
            status: Status::Todo,
            priority: Priority::Medium,
            start_date: "1970-01-01".into(),
            due_date: "1970-01-01".into(),
            progress: 0,
            position: 0,
            parent_id: None,
            source_url: None,
            created_at: 0,
            deleted_at: None,
            logs: vec![],
            checklist: vec![],
        }
    }

    pub fn validate(&self) -> Result<(), AppError> {
        fn valid_date(value: &str) -> bool {
            value.len() == 10
                && value.as_bytes()[4] == b'-'
                && value.as_bytes()[7] == b'-'
                && value
                    .chars()
                    .enumerate()
                    .all(|(i, c)| matches!(i, 4 | 7) || c.is_ascii_digit())
        }
        if self.id.is_empty()
            || self.id.len() > 191
            || self.title.is_empty()
            || self.title.len() > 500
        {
            return Err(AppError::Validation("Invalid task id or title".into()));
        }
        if self.project.is_empty()
            || self.project.len() > 255
            || !valid_date(&self.start_date)
            || !valid_date(&self.due_date)
        {
            return Err(AppError::Validation(
                "Invalid project or task dates".into(),
            ));
        }
        if self.progress > 100 || self.position < 0 || self.checklist.len() > 200 {
            return Err(AppError::Validation(
                "Invalid progress, position, or checklist".into(),
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_progress_outside_zero_to_one_hundred() {
        let mut task = Task::new("task-1", "Write spec");
        task.progress = 101;
        let error = task.validate().unwrap_err();
        assert_eq!(error.code(), "VALIDATION");
    }

    #[test]
    fn exports_camel_case_dto() {
        let task = Task::new("task-1", "Write spec");
        let value = serde_json::to_value(task).unwrap();
        assert_eq!(value["createdAt"], 0);
        assert!(value.get("created_at").is_none());
    }
}
