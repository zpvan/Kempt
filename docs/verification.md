# Kempt verification record

Date: 2026-10-31
Platform for local artifacts: macOS arm64

## Passed locally

- TypeScript `tsc -b`.
- Vitest: 5 files, 12 tests, including brand and localStorage migration coverage.
- Playwright: 3 browser workflows against a real Kempt server:
  - default English `Kempt`, switching to Chinese `企理`, and preference persistence after reload;
  - task creation and persistence after reload;
  - workspace creation and switching.
- Rust workspace: 62 tests across Core, Storage, Server, and Tauri adapter suites, including SQLite snapshot migration, credential migration, and v2/v3 backup compatibility.
- `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- ESLint: no errors; 9 warnings remain in existing hook patterns.
- Vite production build.
- `scripts/check-brand.sh`: package, binary, and product names are Kempt.
- Release workflow YAML syntax and job structure checked with a YAML parser.
- Tauri release build produced `Kempt.app`; no Chinese `.app` was produced by this build.

## Measured artifacts

| Artifact | Size |
|---|---:|
| `kempt-server` | 7.29 MiB |
| `Kempt.app` | 10.22 MiB (approximately 11 MiB on disk) |

Paths:

- `app/target/release/kempt-server`
- `app/target/release/bundle/macos/Kempt.app`

These are local single-architecture release measurements, not estimates for Windows, Linux, or a macOS universal build.

## Not yet verified

- Windows and Linux builds and native desktop behavior have not run locally.
- The GitHub Actions workflow has not been triggered, so hosted Artifacts and Releases have not been verified.
- Native desktop checklist items in `app/e2e/desktop-smoke.md` remain unchecked.
- Cold start with 1,000 tasks and idle memory have not been measured.
- No DMG was built in this Kempt worktree. An earlier build of the old brand failed because Finder AppleEvent timed out (`Finder -1712`).
- Full `actionlint` was unavailable because installation failed due to network timeouts.
- `rust-cache` and `tauri-action` are pinned to commit SHAs. Other Actions still use major/stable tags because their SHAs could not be resolved over the network.
- Real OS Keychain migration is covered with in-memory contract tests, not by moving credentials between actual user Keychains in this environment.

## Dependency audit

`npm ci` reports 15 vulnerabilities: 1 low, 3 moderate, and 11 high. No automatic `npm audit fix` has been applied, so these findings remain open rather than silently resolved.
