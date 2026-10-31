# Building and downloading releases

## GitHub Actions

`.github/workflows/release.yml` supports two entry points:

- **Actions → release → Run workflow**: builds macOS and Windows packages and uploads them as workflow Artifacts. No GitHub Release is created.
- **Push a `v*` tag**: runs the same checks and, only after both platforms succeed, creates a GitHub Release containing the artifacts and platform-specific SHA-256 files.

Each build runs TypeScript checks, Vitest, ESLint, the Rust workspace tests, and Playwright against a real Rust server. The release job alone has `contents: write` permission.

Expected assets:

- macOS: `.dmg`, `kempt-macos-app.tar.gz`, and `kempt-server-macos`.
- Windows: `.msi`/`.exe` installers and `kempt-server-windows-x86_64.exe`.
- Each platform has a distinct `SHA256SUMS-<platform>` file.

The macOS architecture follows the GitHub runner. The first workflow does not produce a universal binary. Current local builds are unsigned; signing and notarization require separately configured certificates and must not be inferred from a successful build.

## Running the local browser server

```bash
./kempt-server serve --host 127.0.0.1 --port 3000
```

On Windows, use the `.exe` filename. Add `--data-dir <path>` to override the OS application data directory. Open `http://127.0.0.1:3000` in a browser. The server intentionally rejects non-loopback addresses because this first release has no remote authentication.

## Desktop requirements

- macOS: system WebKit, included with the OS.
- Windows: Microsoft Edge WebView2 runtime.

## Verifying downloads

On macOS:

```bash
shasum -a 256 <downloaded-file>
```

On Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 <downloaded-file>
```

Compare the output with the corresponding line in `SHA256SUMS-<platform>`.

## Local macOS build

```bash
cd app
npm ci
npm run build:ui
cargo build --release -p kempt-server
npm run tauri build -- --bundles app
./scripts/measure-release.sh
```

The full `tauri build` also creates a DMG. If Finder automation is unavailable, `.app` can still be built with `--bundles app`; a failed DMG step must not be reported as a successful DMG release.
