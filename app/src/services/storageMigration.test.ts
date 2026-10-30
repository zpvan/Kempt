import { beforeEach, describe, expect, it } from "vitest";
import { initialLanguage, migrateKemptStorage } from "./storageMigration";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

let storage: MemoryStorage;
beforeEach(() => { storage = new MemoryStorage(); });

describe("Kempt storage migration", () => {
  it("migrates preferences without overwriting new values", () => {
    storage.setItem("kempt.language", "zh");
    storage.setItem("kempt.language", "en");
    migrateKemptStorage(storage);
    expect(storage.getItem("kempt.language")).toBe("en");
  });

  it("copies old keys once and preserves old values", () => {
    storage.setItem("kempt.assistant.width", "500");
    migrateKemptStorage(storage);
    expect(storage.getItem("kempt.assistant.width")).toBe("500");
    expect(storage.getItem("kempt.assistant.width")).toBe("500");
  });

  it("defaults a fresh install to English", () => {
    expect(initialLanguage(storage)).toBe("en");
  });

  it("preserves an explicit Chinese preference", () => {
    storage.setItem("kempt.language", "zh");
    migrateKemptStorage(storage);
    expect(initialLanguage(storage)).toBe("zh");
  });
});
