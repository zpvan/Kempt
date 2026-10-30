import type { FilePort, JsonFile } from "./files";
import { WorkspaceError } from "./workspace";

export class TauriFilePort implements FilePort {
  async saveJson(fileName: string, contents: string) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const path = await save({ defaultPath: fileName, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path) return;
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    await writeTextFile(path, contents);
  }

  async readJson(): Promise<JsonFile | null> {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (!path || Array.isArray(path)) return null;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const contents = await readTextFile(path);
    if (new Blob([contents]).size > 50 * 1024 * 1024) {
      throw new WorkspaceError("VALIDATION", "Backup file exceeds 50 MiB");
    }
    return { fileName: path.split(/[\\/]/).pop() ?? "backup.json", contents };
  }
}
