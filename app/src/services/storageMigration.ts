export function migrateKemptStorage(storage: Storage) {
  if (storage.getItem("kempt.storageMigrated.v1") === "1") return;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || (!key.startsWith("kempt.") && !key.startsWith("kempt."))) continue;
    const nextKey = `kempt.${key.slice(key.indexOf(".") + 1)}`;
    if (storage.getItem(nextKey) === null) {
      storage.setItem(nextKey, storage.getItem(key) ?? "");
    }
  }
  storage.setItem("kempt.storageMigrated.v1", "1");
}

export function initialLanguage(storage: Storage): "en" | "zh" {
  return storage.getItem("kempt.language") === "zh" ? "zh" : "en";
}
