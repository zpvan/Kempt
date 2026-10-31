# Kempt developer guide

This directory contains the shared React UI, Rust workspace, local browser server, and Tauri desktop shell. See the [root README](../README.md) for the project overview, features, source setup, and contribution guidance.

## Directory map

- `src/`: shared React/TypeScript UI.
- `crates/core/`: business rules, DTOs, AI workflows, and shared JSON-RPC dispatch.
- `crates/storage/`: SQLite repositories, migrations, backups, and OS credential storage.
- `crates/server/`: Axum loopback server with the React build embedded in one binary.
- `src-tauri/`: native desktop shell calling the same dispatcher without a localhost server.
- `contracts/generated/`: TypeScript types generated from Rust with ts-rs; do not edit manually.

There is no production Node.js or MySQL runtime. Node.js is used only for frontend development and builds.

## Development

Install dependencies:

```bash
npm ci
```

Run the browser development servers in two terminals:

```bash
cargo run -p kempt-server -- serve --port 3100
npm run dev
```

Open `http://localhost:3000`. Vite proxies `/api` to the Rust server on port 3100.

Run the desktop development app:

```bash
npm run dev:desktop
```

## Production builds

Build the local browser server:

```bash
npm run build:ui
cargo build --release -p kempt-server
./target/release/kempt-server serve --host 127.0.0.1 --port 3000
```

Build the desktop app:

```bash
npm run build:desktop
```

On macOS, build only `.app` when Finder/DMG automation is unavailable:

```bash
npm run tauri build -- --bundles app
```

## Tests and checks

```bash
npm run check
npm test
npm run lint
npm run test:e2e
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

The Playwright configuration starts a real Rust server with a temporary SQLite database. Native desktop checks are listed separately in `e2e/desktop-smoke.md`.

## Data and credentials

The default database is `kempt.db` in the Kempt OS application data directory. Migrations and restore operations create automatic SQLite backups. The server accepts loopback addresses only. New installations default to English; the interface can be switched to Chinese (企理) and preserves that preference.

AI is optional and online. Credentials use the OS keychain by default. For the server's explicit process-only fallback:

```bash
./target/release/kempt-server serve --session-secrets
```

Session-only keys disappear when the process exits and are never written to SQLite by the application.

See [data documentation](../docs/migration.md), [release instructions](../docs/release.md), and [verification results](../docs/verification.md) for storage, release, and current verification details.
