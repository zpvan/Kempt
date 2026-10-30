import { createContext, useContext, type ReactNode } from "react";
import type { FilePort } from "./files";

const FileContext = createContext<FilePort | null>(null);

export function FileProvider({ files, children }: { files: FilePort; children: ReactNode }) {
  return <FileContext.Provider value={files}>{children}</FileContext.Provider>;
}

export function useFiles() {
  const files = useContext(FileContext);
  if (!files) throw new Error("FileProvider is missing");
  return files;
}
