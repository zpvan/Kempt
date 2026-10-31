# Kempt

Kempt is an open-source, local-first task and work-log application for macOS and Windows. It combines one React interface with one Rust business core, so the desktop app and local browser mode share the same behavior and data model.

The Chinese UI name is **企理**. New installations default to English and can be switched to Chinese.

## Why Kempt?

- **Local-first:** Your tasks, logs, projects, and settings stay on your device.
- **Offline by default:** Core workflows do not require an internet connection.
- **One business core:** Rust owns validation, task operations, backups, and AI action approval across both runtime modes.
- **Small native footprint:** The desktop app uses Tauri and the operating system's WebView instead of bundling a browser engine.
- **Optional AI assistance:** Connect an AI provider only when you want online planning or task assistance. Proposed changes require approval before they are applied.

## Features

- Kanban task board with priorities, deadlines, progress, and checklists
- Project organization and filtering
- Gantt and focus views
- Work logs and progress history
- Reminders and desktop notifications
- Recycle bin with restore and permanent deletion
- Full JSON backup and restore with automatic database backups
- Multiple local workspaces
- Dark mode and English/Chinese interface
- Optional online AI assistant with explicit action approval

## Runtime modes

### Desktop

The Tauri app runs on macOS and Windows. It calls the shared Rust dispatcher directly and does not need a local HTTP server.

### Local browser

The `kempt-server` binary embeds the production React build and serves it through Axum. It is designed for one user on the same machine, accepts loopback addresses only, and uses the same Rust core and SQLite storage as the desktop app.

Kempt does not provide remote authentication or cloud synchronization. Do not expose the server to a public or LAN interface.

## Architecture

| Path | Responsibility |
| --- | --- |
| `app/src/` | Shared React and TypeScript interface |
| `app/crates/core/` | Business rules, DTOs, AI workflows, and JSON-RPC dispatch |
| `app/crates/storage/` | SQLite repositories, migrations, backups, and credential storage |
| `app/crates/server/` | Loopback Axum server and embedded web assets |
| `app/src-tauri/` | Native desktop shell and Tauri commands |
| `app/contracts/generated/` | TypeScript contracts generated from Rust with ts-rs |

There is no production Node.js or MySQL runtime. Node.js is used for frontend development and builds only.

## Build from source

### Prerequisites

- Node.js 24 and npm
- A stable Rust toolchain with Cargo
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/zpvan/Kempt.git
cd Kempt/app
npm ci
```

### Run the desktop app in development

```bash
npm run dev:desktop
```

### Run local browser mode in development

Start the Rust API server in one terminal:

```bash
cargo run -p kempt-server -- serve --port 3100
```

Start Vite in another terminal from the same `app/` directory:

```bash
npm run dev
```

Open `http://localhost:3000`. Vite proxies API requests to the Rust server on port 3100.

### Build local browser mode

```bash
npm run build:ui
cargo build --release -p kempt-server
./target/release/kempt-server serve --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000`. On Windows, use the `.exe` binary and an equivalent command for your shell.

### Build the desktop app

```bash
npm run build:desktop
```

To build only a macOS `.app` bundle without DMG automation:

```bash
npm run tauri build -- --bundles app
```

## Development checks

Run these commands from `app/`:

```bash
npm run check
npm test
npm run lint
npm run test:e2e
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

Playwright tests start a real Rust server with a temporary SQLite database. See [the app developer guide](app/README.md) for more detail.

## Data and privacy

- Tasks and application data are stored in `kempt.db` in the Kempt operating-system application data directory.
- Migrations and restore operations create automatic SQLite backups.
- Full exports use the versioned `kempt-full-backup` v3 JSON format.
- AI provider credentials use the operating system keychain or credential manager by default.
- The server offers an explicit `--session-secrets` mode for process-only credentials; session-only keys disappear when the process exits.
- AI is the only optional online feature described above. The application never requires an account for its core workflows.

See [data documentation](docs/migration.md) for storage details.

## Install on macOS

Current releases are ad-hoc signed and are not notarized by Apple. Download Kempt only from the [official GitHub Releases page](https://github.com/zpvan/Kempt/releases).

1. Download `Kempt_<version>_aarch64.dmg` and `SHA256SUMS-macos` from the same release.
2. Verify the DMG checksum and compare it with the DMG entry in `SHA256SUMS-macos`:

   ```bash
   shasum -a 256 Kempt_<version>_aarch64.dmg
   ```

3. Open the DMG and drag `Kempt.app` to `/Applications`.
4. Try right-clicking `Kempt.app` and choosing **Open**.
5. If macOS reports that Kempt is damaged, remove the quarantine attribute from this verified download:

   ```bash
   xattr -dr com.apple.quarantine /Applications/Kempt.app
   ```

This command removes the quarantine attribute only from Kempt; it does not disable Gatekeeper globally. The warning is expected for the current unsigned release and does not by itself mean the download is corrupted. A future Developer ID signed and notarized release will not require this extra step.

## Releases

The GitHub Actions workflow can build desktop packages and `kempt-server` binaries for macOS and Windows. Manual workflow runs upload Artifacts; version tags can create GitHub Releases after both platform builds succeed.

See [release instructions](docs/release.md) for artifact names, checksums, and platform requirements. The availability of a specific installer depends on published releases or a local build. Current local verification results and unverified items are recorded in [docs/verification.md](docs/verification.md).

## Contributing

Issues and pull requests are welcome.

1. Keep business behavior in the shared Rust core rather than duplicating it in TypeScript.
2. Preserve local-first behavior and loopback-only server access.
3. Add or update tests for behavior changes.
4. Run the relevant development checks before submitting a pull request.
5. Do not commit local databases, credentials, build outputs, or AI process documents.

## License

Kempt is available under the [MIT License](LICENSE).
