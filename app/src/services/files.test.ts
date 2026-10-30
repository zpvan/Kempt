import { describe, expect, it } from "vitest";
import { BrowserFilePort } from "./browserFiles";

describe("BrowserFilePort", () => {
  it("rejects oversized imports before reading", async () => {
    const files = new BrowserFilePort();
    const oversized = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "backup.json");
    await expect(files.readJsonFile(oversized)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
