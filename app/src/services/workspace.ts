export interface WorkspaceService {
  call<T>(method: string, payload?: unknown): Promise<T>;
}

export class WorkspaceError extends Error {
  public code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}

export function asWorkspaceError(reason: unknown): WorkspaceError {
  if (reason instanceof WorkspaceError) return reason;
  if (typeof reason === "object" && reason !== null && "code" in reason && "message" in reason) {
    return new WorkspaceError(String(reason.code), String(reason.message));
  }
  return new WorkspaceError("NETWORK", reason instanceof Error ? reason.message : String(reason));
}
