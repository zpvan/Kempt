import { parseTaskImport, type Task } from "@/lib/tasks";
import type { FullBackup } from "@contracts/types";
import type { WorkspaceService } from "./workspace";

export const LOCAL_TASKS_KEY = "kempt.local.tasks.v1";
export const LOCAL_TRASH_KEY = "kempt.local.trash.v1";
export const MIGRATION_MARKER = "kempt.localTasksMigrated.v1";

export async function legacyLocalMigration(service: WorkspaceService, storage: Storage = localStorage): Promise<boolean> {
  if (storage.getItem(MIGRATION_MARKER) === "1") return false;
  const activeRaw = storage.getItem(LOCAL_TASKS_KEY);
  const trashRaw = storage.getItem(LOCAL_TRASH_KEY);
  if (!activeRaw && !trashRaw) return false;
  const active = parseTasks(activeRaw);
  const trash = parseTasks(trashRaw);
  if (!active.length && !trash.length) {
    storage.setItem(MIGRATION_MARKER, "1");
    return false;
  }
  const backup: FullBackup = {
    app: "Kempt",
    format: "kempt-full-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    users: [{ id: "shella", name: "Shella", isDefault: true, createdAt: new Date(0).toISOString() }],
    tasks: [...active, ...trash].map((task) => ({
      ...task,
      userId: "shella",
      parentId: task.parentId ?? null,
      sourceUrl: task.sourceUrl ?? null,
      deletedAt: task.deletedAt ? new Date(task.deletedAt).toISOString() : null,
    })),
  };
  await service.call("legacy.importLocal", { backup });
  storage.setItem(MIGRATION_MARKER, "1");
  return true;
}

function parseTasks(raw: string | null): Task[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  return Array.isArray(parsed) && parsed.length === 0 ? [] : parseTaskImport(parsed);
}
