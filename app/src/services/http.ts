import { asWorkspaceError, WorkspaceError, type WorkspaceService } from "./workspace";

export class HttpWorkspaceService implements WorkspaceService {
  async call<T>(method: string, payload: unknown = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/rpc/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (reason) {
      throw asWorkspaceError(reason);
    }
    const body = await response.text();
    if (!response.ok) {
      try {
        const error = JSON.parse(body) as { code: string; message: string };
        throw new WorkspaceError(error.code, error.message);
      } catch (reason) {
        if (reason instanceof WorkspaceError) throw reason;
        throw new WorkspaceError("NETWORK", `HTTP ${response.status}`);
      }
    }
    return (body ? JSON.parse(body) : null) as T;
  }
}
