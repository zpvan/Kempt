CREATE TABLE app_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 100),
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE work_tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    project TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('todo','doing','done')),
    priority TEXT NOT NULL CHECK(priority IN ('low','medium','high')),
    start_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
    position INTEGER NOT NULL DEFAULT 0,
    parent_id TEXT,
    source_url TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at TEXT
);
CREATE INDEX work_tasks_user_idx ON work_tasks(user_id);
CREATE INDEX work_tasks_list_idx ON work_tasks(user_id, deleted_at, position, created_at);
CREATE INDEX work_tasks_parent_idx ON work_tasks(parent_id);

CREATE TABLE task_work_logs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    content TEXT NOT NULL,
    progress INTEGER NOT NULL CHECK(progress BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK(status IN ('todo','doing','done')),
    created_at INTEGER NOT NULL
);
CREATE INDEX task_work_logs_task_idx ON task_work_logs(task_id);

CREATE TABLE task_checklist_items (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES work_tasks(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    completed INTEGER NOT NULL CHECK(completed IN (0,1)),
    position INTEGER NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX task_checklist_items_task_idx ON task_checklist_items(task_id);

CREATE TABLE assistant_models (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL CHECK(provider IN ('kimi','minimax')),
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    secret_ref TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE TABLE assistant_messages (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    model_id TEXT REFERENCES assistant_models(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
CREATE INDEX assistant_messages_workspace_idx ON assistant_messages(workspace_id, created_at);

CREATE TABLE assistant_actions (
    id TEXT PRIMARY KEY,
    message_id TEXT REFERENCES assistant_messages(id) ON DELETE SET NULL,
    workspace_id TEXT NOT NULL,
    action TEXT NOT NULL,
    payload TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending','executed','rejected')),
    created_at INTEGER NOT NULL,
    decided_at INTEGER
);
CREATE INDEX assistant_actions_workspace_idx ON assistant_actions(workspace_id, status);

INSERT INTO app_users (id, name, is_default, created_at)
VALUES ('admin', 'admin', 1, 0);
