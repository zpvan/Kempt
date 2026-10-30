import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceService } from "./workspace";

const WorkspaceContext = createContext<WorkspaceService | null>(null);

export function WorkspaceProvider({ service, children }: { service: WorkspaceService; children: ReactNode }) {
  return <WorkspaceContext.Provider value={service}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceService() {
  const service = useContext(WorkspaceContext);
  if (!service) throw new Error("WorkspaceProvider is missing");
  return service;
}
