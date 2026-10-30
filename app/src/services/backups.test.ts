import { describe, expect, it } from "vitest";
import { isKemptBackup } from "./backups";

describe("isKemptBackup", () => {
  it("rejects legacy v2 backups", () => {
    expect(isKemptBackup({ format: "invalid-full-backup", version: 2, users: [{}], tasks: [] })).toBe(false);
  });

  it("accepts Kempt v3 backups", () => {
    expect(isKemptBackup({ format: "kempt-full-backup", version: 3, users: [{}], tasks: [] })).toBe(true);
  });
});
