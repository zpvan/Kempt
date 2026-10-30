import { asWorkspaceError, type WorkspaceService } from "./workspace";

export class TauriWorkspaceService implements WorkspaceService {
  async call<T>(method: string, payload: unknown = {}): Promise<T> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<T>("rpc", { method, payload });
    } catch (reason) {
      throw asWorkspaceError(reason);
    }
  }
}
