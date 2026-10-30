import type { FilePort, JsonFile } from "./files";
import { WorkspaceError } from "./workspace";

const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export class BrowserFilePort implements FilePort {
  async saveJson(fileName: string, contents: string) {
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  readJson(): Promise<JsonFile | null> {
    return new Promise((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        this.readJsonFile(file).then(resolve).catch(reject);
      };
      input.click();
    });
  }

  async readJsonFile(file: File): Promise<JsonFile> {
    if (file.size > MAX_BACKUP_BYTES) {
      throw new WorkspaceError("VALIDATION", "Backup file exceeds 50 MiB");
    }
    return { fileName: file.name, contents: await file.text() };
  }
}
