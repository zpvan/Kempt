export const BRAND = {
  name: "Kempt",
  nameZh: "企理",
  serverBinary: "kempt-server",
  backupFile: (date: string) => `Kempt-${date}.json`,
  storagePrefix: "kempt.",
} as const;
