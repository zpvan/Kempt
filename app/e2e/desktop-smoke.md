# Native desktop smoke checklist

Record OS, architecture, app version, and whether the artifact is signed before running these checks. A browser E2E pass is not a substitute for this checklist.

- [ ] **Offline launch**: Disable networking and launch the desktop app. Expected: the workspace opens without a login screen and existing tasks load.
- [ ] **Task lifecycle**: Create, edit, complete, delete, restore, and purge a task. Expected: every operation survives an app restart and matches the browser server view of the same database.
- [ ] **Backup save**: Export JSON to a user-selected directory. Expected: a `.json` file is written, contains version 2, and no other file type can be selected by the backup writer.
- [ ] **Backup restore**: Import the exported file and a file larger than 50 MiB. Expected: the valid backup restores atomically; the oversized file is rejected without changing tasks.
- [ ] **Notifications**: Trigger a due-task reminder. Expected: a native notification appears when permission is granted; denying permission does not block task operations.
- [ ] **AI offline behavior**: Disable networking and open Assistant. Expected: core tasks remain usable and the online failure is shown in the Assistant only.
- [ ] **Session-only secret fallback**: Where system credential storage is unavailable, enter an API key for the current process. Expected: the key is not written to SQLite or log files and is lost after restart.
- [ ] **Shared database**: Open the same SQLite file through the CLI server and desktop app. Expected: both show the same records after refocusing/reloading; simultaneous editing is not presented as real-time collaboration.
- [ ] **System WebView rendering**: Inspect all main views and dialogs at 100% and 125% scaling. Expected: no clipped controls, missing fonts, unreadable contrast, or unsupported CSS behavior.
- [ ] **Release identity**: Inspect the artifact signature. Expected: the release notes accurately say signed or unsigned; no unsigned build is described as notarized.
