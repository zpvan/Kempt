# Migration to the local Rust application

## Before upgrading

Export a `kempt-full-backup` version 2 JSON file from the existing application. The Rust application preserves workspace, task, log, checklist, and recycle-bin IDs during import.

OAuth, password login, TOTP, remote account isolation, and the MySQL production backend are removed in the local single-user edition. Application workspaces/members remain available and are not login accounts.

## Importing an existing backup

Open **Import/Export**, select the version 2 JSON file, review the counts, and confirm. Before replacement, the application creates a SQLite `VACUUM INTO` backup in the application `backups` directory. The newest ten automatic backups are retained.

Validation or restore failure leaves the current database unchanged. A pre-import backup is not deleted after a failed restore. Legacy `ownerUnionId` values are accepted for compatibility but are not used as remote permissions.

AI models, messages, actions, and credentials are not part of the version 2 task backup.

## Migrating old localStorage data

The browser and desktop UI check these legacy keys on startup:

- `kempt.local.tasks.v1`
- `kempt.local.trash.v1`

If either contains tasks, the UI creates a version 2 backup and calls `legacy.importLocal`. Import is allowed only when SQLite has no tasks; otherwise it returns `CONFLICT` and does not overwrite existing data.

Only a successful import sets `kempt.localTasksMigrated.v1`. The original localStorage keys are retained as recovery data. Drafts, theme, language, selected workspace, notification history, and Assistant panel width remain browser/WebView preferences rather than authoritative task storage.

## AI credentials

The old application-secret/AES database credential format is not migrated. Re-enter provider credentials after upgrading. The default destination is macOS Keychain, Windows Credential Manager, or Linux Secret Service.

An explicit session-only mode is available with `--session-secrets` for the server or `HEA_SESSION_SECRETS=1` for the desktop app. In this mode credentials disappear on process exit. The application does not silently fall back to plaintext persistence.
