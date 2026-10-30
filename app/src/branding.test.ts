import { describe, expect, it } from "vitest";
import { BRAND } from "./branding";

describe("BRAND", () => {
  it("uses English-only artifact names", () => {
    expect(BRAND.name).toBe("Kempt");
    expect(BRAND.serverBinary).toBe("kempt-server");
    expect(BRAND.backupFile("2026-10-31")).toBe("Kempt-2026-10-31.json");
  });
});
