use crate::{
    assistant::{AssistantModelDraft, AvailableModelsRequest},
    backup::{BackupRepository, FullBackup},
    chat::{ActionResult, ChatRepository, ChatRequest},
    error::AppError,
    model::{Status, Task, WorkLog},
    service::AppService,
};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::Value;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UserId {
    user_id: String,
}

#[derive(Deserialize)]
struct Name {
    name: String,
}

#[derive(Deserialize)]
struct Id {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskId {
    user_id: String,
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpsertTask {
    user_id: String,
    task: Task,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reorder {
    user_id: String,
    ordered_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetStatus {
    user_id: String,
    id: String,
    status: Status,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddLog {
    user_id: String,
    task_id: String,
    log: WorkLog,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLog {
    user_id: String,
    log: WorkLog,
}

#[derive(Deserialize)]
struct BackupRequest {
    backup: FullBackup,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveModelRequest {
    #[serde(flatten)]
    model: AssistantModelDraft,
    api_key: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceRequest {
    workspace_id: String,
}

pub async fn dispatch<R>(service: &AppService<R>, method: &str, payload: Value) -> Result<Value, AppError>
where
    R: ChatRepository + BackupRepository,
{
    match method {
        "user.list" => output(service.list_users()?),
        "user.create" => output(service.create_user(&parse::<Name>(payload)?.name)?),
        "user.delete" => output(service.delete_user(&parse::<Id>(payload)?.id)?),
        "task.list" => {
            let input = parse::<UserId>(payload)?;
            output(service.list_tasks(&input.user_id)?)
        }
        "task.trash" => {
            let input = parse::<UserId>(payload)?;
            output(service.trash(&input.user_id)?)
        }
        "task.upsert" => {
            let input = parse::<UpsertTask>(payload)?;
            output(service.upsert_task(&input.user_id, input.task)?)
        }
        "task.delete" => {
            let input = parse::<TaskId>(payload)?;
            output(service.set_deleted(&input.user_id, &input.id, true)?)
        }
        "task.restore" => {
            let input = parse::<TaskId>(payload)?;
            output(service.set_deleted(&input.user_id, &input.id, false)?)
        }
        "task.purge" => {
            let input = parse::<TaskId>(payload)?;
            output(service.purge_task(&input.user_id, &input.id)?)
        }
        "task.reorder" => {
            let input = parse::<Reorder>(payload)?;
            output(service.reorder(&input.user_id, &input.ordered_ids)?)
        }
        "task.setStatus" => {
            let input = parse::<SetStatus>(payload)?;
            output(service.set_status(&input.user_id, &input.id, input.status)?)
        }
        "task.addLog" => {
            let input = parse::<AddLog>(payload)?;
            output(service.add_log(&input.user_id, &input.task_id, &input.log)?)
        }
        "task.updateLog" => {
            let input = parse::<UpdateLog>(payload)?;
            output(service.update_log(&input.user_id, &input.log)?)
        }
        "task.deleteLog" => {
            let input = parse::<TaskId>(payload)?;
            output(service.delete_log(&input.user_id, &input.id)?)
        }
        "backup.export" => output(service.export_backup()?),
        "backup.restore" => output(service.import_backup(parse::<BackupRequest>(payload)?.backup)?),
        "legacy.importLocal" => output(service.import_local(parse::<BackupRequest>(payload)?.backup)?),
        "assistant.models.list" => output(service.list_models()?),
        "assistant.models.save" => {
            let input = parse::<SaveModelRequest>(payload)?;
            output(service.save_model(input.model, input.api_key).await?)
        }
        "assistant.models.delete" => output(service.delete_model(&parse::<Id>(payload)?.id)?),
        "assistant.models.setDefault" => output(service.set_default_model(&parse::<Id>(payload)?.id)?),
        "assistant.models.available" => output(service.available_models(parse::<AvailableModelsRequest>(payload)?).await?),
        "assistant.chat.history" => output(service.list_messages(&parse::<WorkspaceRequest>(payload)?.workspace_id)?),
        "assistant.chat.actions" => output(service.list_actions(&parse::<WorkspaceRequest>(payload)?.workspace_id)?),
        "assistant.chat.chat" => output(service.chat(parse::<ChatRequest>(payload)?).await?),
        "assistant.chat.clear" => output(service.clear_messages(&parse::<WorkspaceRequest>(payload)?.workspace_id)?),
        "assistant.chat.executeAction" => {
            let tasks = service.execute_action(&parse::<Id>(payload)?.id)?;
            output(ActionResult { success: true, tasks })
        }
        "assistant.chat.rejectAction" => output(service.reject_action(&parse::<Id>(payload)?.id)?),
        _ => Err(AppError::NotFound(format!("Unknown RPC method: {method}"))),
    }
}

fn parse<T: DeserializeOwned>(payload: Value) -> Result<T, AppError> {
    serde_json::from_value(payload).map_err(|e| AppError::Validation(e.to_string()))
}

fn output<T: serde::Serialize>(value: T) -> Result<Value, AppError> {
    serde_json::to_value(value).map_err(|e| AppError::Storage(e.to_string()))
}
