# Verification record

Date: 2026-10-31
Platform for local artifacts: macOS arm64

## Passed locally

- TypeScript `tsc -b`.
- Vitest: 3 files, 6 tests.
- Playwright: 2 browser workflows against a real Rust server, covering task persistence and workspace creation/switching.
- Rust workspace: 53 tests across Core, Storage, Server, and Tauri adapter suites.
- `cargo clippy --workspace --all-targets -- -D warnings`: no issues.
- ESLint: no errors; 9 warnings remain in existing hook patterns.
- Vite production build.
- Rust server CLI smoke test: `GET /api/health` returned `{"ok":true}`.
- Tauri release build produced a macOS `.app`.

## Measured artifacts

| Artifact | Size |
|---|---:|
| `kempt-server` | 7.29 MiB |
| `kempt` | 10.16 MiB |
| `Kempt.app` | approximately 11 MiB |

These are local single-architecture release measurements, not estimates for Windows, Linux, or a macOS universal build.

## Not yet verified

- Windows and Linux builds and native desktop behavior have not run locally.
- The GitHub Actions workflow has not been triggered, so hosted Artifacts and Releases have not been verified.
- Native desktop checklist items in `app/e2e/desktop-smoke.md` remain unchecked.
- Cold start with 1,000 tasks and idle memory have not been measured.
- A full DMG build failed locally because Finder AppleEvent timed out (`Finder -1712`). The `.app` bundle itself succeeded.
- `actionlint` was unavailable; installation failed because the network timed out. YAML syntax and job structure were checked with a YAML parser instead.
- `rust-cache` and `tauri-action` are pinned to commit SHAs. Other Actions still use major/stable tags because their SHAs could not be resolved over the network.

## Dependency audit

After removing the legacy backend dependencies, `npm ci` reports 15 vulnerabilities: 1 low, 3 moderate, and 11 high. No automatic `npm audit fix` has been applied, so these findings remain open rather than silently resolved.
