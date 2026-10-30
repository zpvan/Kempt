use crate::{
    error::AppError,
    model::{Status, Task, WorkLog},
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct AppUser {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export, export_to = "../../../contracts/generated/", rename_all = "camelCase")]
pub struct CreateUserResult {
    pub user: AppUser,
    pub users: Vec<AppUser>,
}

pub trait TaskRepository: Send + Sync + 'static {
    fn list_users(&self) -> Result<Vec<AppUser>, AppError>;
    fn create_user(&self, name: &str) -> Result<CreateUserResult, AppError>;
    fn delete_user(&self, id: &str) -> Result<Vec<AppUser>, AppError>;
    fn list_tasks(&self, user_id: &str, deleted: bool) -> Result<Vec<Task>, AppError>;
    fn get_task(&self, user_id: &str, id: &str) -> Result<Task, AppError>;
    fn upsert_task(&self, user_id: &str, task: &Task) -> Result<Vec<Task>, AppError>;
    fn set_deleted(&self, user_id: &str, id: &str, deleted: bool) -> Result<Vec<Task>, AppError>;
    fn purge_task(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError>;
    fn reorder(&self, user_id: &str, ordered_ids: &[String]) -> Result<Vec<Task>, AppError>;
    fn add_log(&self, user_id: &str, task: &Task, log: &WorkLog) -> Result<Vec<Task>, AppError>;
    fn update_log(&self, user_id: &str, log: &WorkLog) -> Result<Vec<Task>, AppError>;
    fn delete_log(&self, user_id: &str, id: &str) -> Result<Vec<Task>, AppError>;
}
