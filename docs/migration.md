# Migrating to Kempt

Kempt is the new name for the application previously called Kempt / Kempt. The Chinese interface name is 企理. New installations default to English; switching to Chinese preserves that preference, and an existing explicit preference is migrated rather than reset.

## Before upgrading

You may export a `kempt-full-backup` version 2 JSON file from the old application as an additional recovery copy. Kempt imports both:

- `kempt-full-backup` version 2.
- `kempt-full-backup` version 3.

Every new export uses `kempt-full-backup` version 3 with `app: "Kempt"` and an English `Kempt-YYYY-MM-DD.json` filename. Both formats preserve workspace, task, log, checklist, and recycle-bin IDs. Before replacement, Kempt creates a SQLite `VACUUM INTO` backup in the application `backups` directory and retains the newest ten automatic backups. Validation or restore failure leaves the current database unchanged.

OAuth, password login, TOTP, remote account isolation, and the MySQL production backend are not part of the local single-user edition. Application workspaces/members remain available and are not login accounts.

## SQLite and data directory migration

The new application data directory uses the Kempt identifier and the new database is `kempt.db`.

On first startup, if `kempt.db` does not exist but the old `kempt.db` does, Server and Tauri call the same storage migration:

1. Open the old database read-only.
2. Write a consistent snapshot, including WAL content, to `kempt-migration.tmp.db` using SQLite `VACUUM INTO`.
3. Run `PRAGMA integrity_check` on the snapshot.
4. Atomically rename the valid snapshot to `kempt.db` and run migrations and automatic backup.

An existing `kempt.db` is never overwritten by the legacy file. A failed migration leaves the old database intact. Old files are retained as recovery sources rather than deleted automatically. A custom `--data-dir` uses an isolated Kempt database and skips legacy migration.

## Keychain migration

Persistent Assistant credentials move from `com.kempt.workflow` to `com.kempt.workflow` using each stored `secret_ref`. Kempt copies and verifies each value without logging it. Missing or invalid migration aborts startup rather than silently losing access. Old credentials are retained as recovery data.

The explicit `--session-secrets` server option or `HEA_SESSION_SECRETS=1` desktop setting uses process-only secrets and skips persistent Keychain migration. These values disappear on process exit and are not written to SQLite by the application.

The old application-secret/AES database credential format is not migrated; those credentials must be re-entered.

## localStorage and preferences

A one-time frontend migration copies old `kempt.` and `kempt.` keys to `kempt.*`, including drafts, theme, language, current workspace, notification history, Assistant width, and legacy local-task migration state. Existing Kempt values are never overwritten, and old keys remain available for recovery.

New code reads and writes only Kempt keys. A missing `kempt.language` defaults to English; a valid migrated `zh` preference continues to select Chinese.

Legacy local tasks are imported only into an empty SQLite database. Only a successful import sets `kempt.localTasksMigrated.v1`; a conflict leaves both data sources unchanged. AI models, messages, actions, and credentials are not part of the version 2 task backup.
