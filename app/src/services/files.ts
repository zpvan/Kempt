export interface JsonFile {
  fileName: string;
  contents: string;
}

export interface FilePort {
  saveJson(fileName: string, contents: string): Promise<void>;
  readJson(): Promise<JsonFile | null>;
}
