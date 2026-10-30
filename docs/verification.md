# Kempt verification record

Date: 2026-10-31
Platform for local artifacts: macOS arm64

## Passed locally

- TypeScript `tsc -b`.
- Vitest: 5 files, 10 tests, including brand and Kempt v3 backup validation.
- Playwright: 3 browser workflows against a real Kempt server:
  - default English `Kempt`, switching to Chinese `企理`, and preference persistence after reload;
  - task creation and persistence after reload;
  - workspace creation and switching.
- Rust workspace: 56 tests across Core, Storage, Server, and Tauri adapter suites.
- `cargo fmt --all --check` and `cargo clippy --workspace --all-targets -- -D warnings`: passed.
- ESLint: no errors; existing hook warnings remain.
- Vite production build.
- `scripts/check-brand.sh`: package, binary, and product names are Kempt.
- `docs/superpowers/` is ignored and untracked.

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
- No DMG was built in this worktree.
- Full `actionlint` was unavailable because installation failed due to network timeouts.
- `rust-cache` and `tauri-action` are pinned to commit SHAs. Other Actions still use major/stable tags because their SHAs could not be resolved over the network.

## Dependency audit

`npm ci` reports 15 vulnerabilities: 1 low, 3 moderate, and 11 high. No automatic `npm audit fix` has been applied, so these findings remain open rather than silently resolved.
