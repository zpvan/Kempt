use crate::{
    assistant::{AssistantModel, AssistantModelRecord, AssistantRepository},
    error::AppError,
    model::{Status, Task, WorkLog},
    service::{
        normalize_task, task_with_log, task_with_status, validate_log, validate_task, AppService,
    },
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct AssistantMessage {
    pub id: String,
    pub workspace_id: String,
    pub model_id: Option<String>,
    pub role: String,
    pub content: String,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistantActionDraft {
    pub action: String,
    pub payload: Value,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct AssistantAction {
    pub id: String,
    pub message_id: Option<String>,
    pub workspace_id: String,
    pub action: String,
    #[ts(type = "Record<string, unknown>")]
    pub payload: Value,
    pub summary: String,
    pub status: String,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub decided_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct ChatContext {
    pub workspace_id: String,
    pub messages: Vec<AssistantMessage>,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone)]
pub struct ChatResult {
    pub text: String,
    pub actions: Vec<AssistantActionDraft>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct ChatRequest {
    pub workspace_id: String,
    pub model_id: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct ChatResponse {
    pub text: String,
    pub actions: Vec<AssistantAction>,
    pub model: AssistantModel,
    pub tasks: Vec<Task>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct SuccessResult {
    pub success: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(
    export,
    export_to = "../../../contracts/generated/",
    rename_all = "camelCase"
)]
pub struct ActionResult {
    pub success: bool,
    pub tasks: Vec<Task>,
}

pub enum ActionEffect {
    UpsertTask {
        workspace_id: String,
        task: Task,
    },
    AddLog {
        workspace_id: String,
        task: Task,
        log: WorkLog,
    },
    SetDeleted {
        workspace_id: String,
        task_id: String,
        deleted: bool,
    },
    Reorder {
        workspace_id: String,
        ordered_ids: Vec<String>,
    },
}

pub trait ChatRepository: AssistantRepository {
    fn resolve_model_record(&self, id: Option<&str>) -> Result<AssistantModelRecord, AppError>;
    fn insert_message(&self, message: &AssistantMessage) -> Result<(), AppError>;
    fn list_messages(&self, workspace_id: &str) -> Result<Vec<AssistantMessage>, AppError>;
    fn save_assistant_response(
        &self,
        message: &AssistantMessage,
        actions: &[AssistantActionDraft],
    ) -> Result<Vec<AssistantAction>, AppError>;
    fn list_actions(&self, workspace_id: &str) -> Result<Vec<AssistantAction>, AppError>;
    fn get_action(&self, id: &str) -> Result<AssistantAction, AppError>;
    fn reject_pending_action(&self, id: &str) -> Result<(), AppError>;
    fn execute_pending_action(&self, id: &str, effect: ActionEffect)
        -> Result<Vec<Task>, AppError>;
    fn clear_messages(&self, workspace_id: &str) -> Result<(), AppError>;
}

impl<R: ChatRepository> AppService<R> {
    pub fn list_messages(&self, workspace_id: &str) -> Result<Vec<AssistantMessage>, AppError> {
        self.validate_workspace(workspace_id)?;
        self.repository.list_messages(workspace_id)
    }

    pub fn list_actions(&self, workspace_id: &str) -> Result<Vec<AssistantAction>, AppError> {
        self.validate_workspace(workspace_id)?;
        self.repository.list_actions(workspace_id)
    }

    pub fn clear_messages(&self, workspace_id: &str) -> Result<SuccessResult, AppError> {
        self.validate_workspace(workspace_id)?;
        self.repository.clear_messages(workspace_id)?;
        Ok(SuccessResult { success: true })
    }

    pub async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AppError> {
        self.validate_workspace(&request.workspace_id)?;
        let text = request.message.trim();
        if text.is_empty() || text.len() > 4000 {
            return Err(AppError::Validation(
                "Chat message must contain 1 to 4000 characters".into(),
            ));
        }
        let record = self
            .repository
            .resolve_model_record(request.model_id.as_deref())?;
        let history = self.repository.list_messages(&request.workspace_id)?;
        let mut context = ChatContext {
            workspace_id: request.workspace_id.clone(),
            messages: history[history.len().saturating_sub(12)..].to_vec(),
            tasks: self
                .repository
                .list_tasks(&request.workspace_id, false)?
                .into_iter()
                .take(100)
                .collect(),
        };
        let api_key = self.resolve_api_key(Some(&record), None)?;
        let user_message = AssistantMessage {
            id: Uuid::new_v4().to_string(),
            workspace_id: request.workspace_id.clone(),
            model_id: Some(record.model.id.clone()),
            role: "user".into(),
            content: text.into(),
            created_at: Utc::now().timestamp_millis(),
        };
        self.repository.insert_message(&user_message)?;
        context.messages.push(user_message);
        let result = self
            .catalog()?
            .chat(&record.model, api_key.as_deref(), context)
            .await?;
        let assistant_message = AssistantMessage {
            id: Uuid::new_v4().to_string(),
            workspace_id: request.workspace_id.clone(),
            model_id: Some(record.model.id.clone()),
            role: "assistant".into(),
            content: result.text.clone(),
            created_at: Utc::now().timestamp_millis(),
        };
        let actions = self
            .repository
            .save_assistant_response(&assistant_message, &result.actions)?;
        Ok(ChatResponse {
            text: result.text,
            actions,
            model: record.model,
            tasks: self.repository.list_tasks(&request.workspace_id, false)?,
        })
    }

    pub fn reject_action(&self, id: &str) -> Result<SuccessResult, AppError> {
        self.repository.reject_pending_action(id)?;
        Ok(SuccessResult { success: true })
    }

    pub fn execute_action(&self, id: &str) -> Result<Vec<Task>, AppError> {
        let action = self.repository.get_action(id)?;
        if action.status != "pending" {
            return Err(AppError::Conflict(
                "Assistant action was already decided".into(),
            ));
        }
        let workspace_id = action
            .payload
            .get("workspaceId")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::Validation("Action has no workspaceId".into()))?;
        if workspace_id != action.workspace_id {
            return Err(AppError::Validation(
                "Action workspace does not match".into(),
            ));
        }
        self.validate_workspace(workspace_id)?;
        let effect = match action.action.as_str() {
            "create_task" => {
                let title = required_string(&action.payload, "title")?;
                let due_date = required_string(&action.payload, "dueDate")?;
                let mut task = Task::new(&Uuid::new_v4().to_string(), title);
                task.description =
                    optional_string(&action.payload, "description").unwrap_or_default();
                task.project = optional_string(&action.payload, "project")
                    .unwrap_or_else(|| "个人工作".into());
                task.start_date = optional_string(&action.payload, "startDate")
                    .unwrap_or_else(|| due_date.to_string());
                task.due_date = due_date.to_string();
                task.created_at = Utc::now().timestamp_millis();
                validate_task(&task)?;
                ActionEffect::UpsertTask {
                    workspace_id: workspace_id.into(),
                    task: normalize_task(task),
                }
            }
            "update_task_status" => {
                let task_id = required_string(&action.payload, "taskId")?;
                let status: Status = serde_json::from_value(
                    action.payload.get("status").cloned().unwrap_or(Value::Null),
                )
                .map_err(|_| AppError::Validation("Invalid action status".into()))?;
                let task = self.repository.get_task(workspace_id, task_id)?;
                ActionEffect::UpsertTask {
                    workspace_id: workspace_id.into(),
                    task: task_with_status(task, status),
                }
            }
            "add_progress_log" => {
                let task_id = required_string(&action.payload, "taskId")?;
                let task = self.repository.get_task(workspace_id, task_id)?;
                let progress = action
                    .payload
                    .get("progress")
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                if progress > 100 {
                    return Err(AppError::Validation("Invalid log progress".into()));
                }
                let mut log = WorkLog {
                    id: Uuid::new_v4().to_string(),
                    date: required_string(&action.payload, "date")?.into(),
                    content: required_string(&action.payload, "content")?.into(),
                    progress: progress as u8,
                    status: serde_json::from_value(
                        action
                            .payload
                            .get("status")
                            .cloned()
                            .unwrap_or(Value::String("doing".into())),
                    )
                    .map_err(|_| AppError::Validation("Invalid log status".into()))?,
                    created_at: Utc::now().timestamp_millis(),
                };
                validate_log(&log)?;
                let (task, normalized_log) = task_with_log(task, &log);
                log = normalized_log;
                ActionEffect::AddLog {
                    workspace_id: workspace_id.into(),
                    task,
                    log,
                }
            }
            "move_task_to_recycle_bin" => ActionEffect::SetDeleted {
                workspace_id: workspace_id.into(),
                task_id: required_string(&action.payload, "taskId")?.into(),
                deleted: true,
            },
            "reorder_tasks" => {
                let ordered_ids: Vec<String> = serde_json::from_value(
                    action
                        .payload
                        .get("orderedIds")
                        .cloned()
                        .unwrap_or(Value::Null),
                )
                .map_err(|_| AppError::Validation("Invalid orderedIds".into()))?;
                if ordered_ids.is_empty() || ordered_ids.len() > 5000 {
                    return Err(AppError::Validation("Invalid orderedIds count".into()));
                }
                ActionEffect::Reorder {
                    workspace_id: workspace_id.into(),
                    ordered_ids,
                }
            }
            _ => return Err(AppError::Validation("Unsupported assistant action".into())),
        };
        self.repository.execute_pending_action(id, effect)
    }

    fn validate_workspace(&self, id: &str) -> Result<(), AppError> {
        if self
            .repository
            .list_users()?
            .iter()
            .any(|user| user.id == id)
        {
            Ok(())
        } else {
            Err(AppError::NotFound("Workspace not found".into()))
        }
    }
}

fn required_string<'a>(payload: &'a Value, key: &str) -> Result<&'a str, AppError> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Validation(format!("Action requires {key}")))
}

fn optional_string(payload: &Value, key: &str) -> Option<String> {
    payload.get(key).and_then(Value::as_str).map(str::to_string)
}
