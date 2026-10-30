import type { FullBackup } from "@contracts/types";

export function isKemptBackup(value: unknown): value is FullBackup {
  if (!value || typeof value !== "object") return false;
  const backup = value as Partial<FullBackup>;
  return backup.format === "kempt-full-backup" && backup.version === 3
    && Array.isArray(backup.users) && backup.users.length > 0 && Array.isArray(backup.tasks);
}
