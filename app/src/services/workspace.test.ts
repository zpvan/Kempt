import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpWorkspaceService } from "./http";

afterEach(() => vi.unstubAllGlobals());

describe("HttpWorkspaceService", () => {
  it("posts method payloads and decodes results", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: "task-1" }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new HttpWorkspaceService();
    await expect(client.call("task.list", { userId: "shella" })).resolves.toEqual([{ id: "task-1" }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/rpc/task.list", expect.objectContaining({ method: "POST" }));
  });

  it("maps an error body without parsing message text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "CONFLICT", message: "exists" }), { status: 409 })));
    const client = new HttpWorkspaceService();
    await expect(client.call("backup.restore", {})).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
