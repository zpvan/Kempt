# Kempt data and backups

Kempt uses a single local data path. The Chinese interface name is 企理. New installations default to English, and switching to Chinese preserves that preference.

## Local data

- Database: `kempt.db` in the Kempt OS application data directory.
- Bundle and credential identifier: `com.kempt.workflow`.
- Browser and desktop preferences: `kempt.*` localStorage keys.
- Default language: English when `kempt.language` is absent; an explicit Chinese preference is preserved.

A custom `--data-dir` creates an isolated Kempt database. Server and Tauri use the same SQLite schema and business core.

## Backups

Kempt accepts and exports only `kempt-full-backup` version 3 with `app: "Kempt"`. Export filenames use `Kempt-YYYY-MM-DD.json`.

Before replacement, Kempt creates a SQLite `VACUUM INTO` backup in the application `backups` directory and retains the newest ten automatic backups. Validation or restore failure leaves the current database unchanged. Workspace, task, log, checklist, and recycle-bin IDs are preserved.

AI models, messages, actions, and credentials are not part of the task backup.

## Credentials

Persistent Assistant credentials use macOS Keychain or Windows Credential Manager under `com.kempt.workflow`. API Keys are never written to SQLite or diagnostic logs.

The explicit `--session-secrets` server option or `HEA_SESSION_SECRETS=1` desktop setting uses process-only secrets. These values disappear on process exit and are not written to SQLite by the application.
