import type { FilePort, JsonFile } from "./files";
import { WorkspaceError } from "./workspace";

export class TauriFilePort implements FilePort {
  async saveJson(fileName: string, contents: string) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("write_backup", { path, contents });
  }

  async readJson(): Promise<JsonFile | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    const { invoke } = await import("@tauri-apps/api/core");
    const contents = await invoke<string>("read_backup", { path });
    if (new Blob([contents]).size > 50 * 1024 * 1024) {
      throw new WorkspaceError("VALIDATION", "Backup file exceeds 50 MiB");
    }
    return { fileName: path.split(/[\\/]/).pop() ?? "backup.json", contents };
  }
}
