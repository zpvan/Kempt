import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname);
const dataDir = path.join(os.tmpdir(), `kempt-e2e-${process.pid}`);
fs.rmSync(dataDir, { recursive: true, force: true });

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", headless: true },
  webServer: {
    command: `npm run build:ui && cargo run -p kempt-server -- serve --port 3100 --data-dir "${dataDir}"`,
    cwd: root,
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
