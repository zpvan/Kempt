import { beforeEach, describe, expect, it, vi } from "vitest";
import { legacyLocalMigration, LOCAL_TASKS_KEY, LOCAL_TRASH_KEY, MIGRATION_MARKER } from "./legacyLocal";
import { WorkspaceError, type WorkspaceService } from "./workspace";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let storage: MemoryStorage;

function storageWithLegacyTasks() {
  storage.setItem(LOCAL_TASKS_KEY, JSON.stringify([{
    id: "legacy-1", title: "Legacy", description: "", project: "Personal",
    status: "todo", priority: "medium", startDate: "2026-01-01", dueDate: "2026-01-02",
    progress: 0, position: 0, createdAt: 1, logs: [], checklist: [],
  }]));
  storage.setItem(LOCAL_TRASH_KEY, "[]");
  return storage;
}

describe("legacy local migration", () => {
  beforeEach(() => { storage = new MemoryStorage(); });

  it("does not mark migration complete after a conflict", async () => {
    const service = { call: vi.fn().mockRejectedValue(new WorkspaceError("CONFLICT", "not empty")) } as unknown as WorkspaceService;
    await expect(legacyLocalMigration(service, storageWithLegacyTasks())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(storage.getItem(MIGRATION_MARKER)).toBeNull();
    expect(storage.getItem(LOCAL_TASKS_KEY)).not.toBeNull();
  });

  it("imports active tasks and trash then sets the marker", async () => {
    const call = vi.fn().mockResolvedValue({});
    const service = { call } as unknown as WorkspaceService;
    await legacyLocalMigration(service, storageWithLegacyTasks());
    expect(call).toHaveBeenCalledWith("legacy.importLocal", expect.objectContaining({ backup: expect.objectContaining({ version: 2 }) }));
    expect(storage.getItem(MIGRATION_MARKER)).toBe("1");
  });

  it("does nothing when legacy keys are absent", async () => {
    const call = vi.fn();
    await legacyLocalMigration({ call } as unknown as WorkspaceService, storage);
    expect(call).not.toHaveBeenCalled();
  });
});
