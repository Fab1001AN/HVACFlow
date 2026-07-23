# HVACFlow — Backups and Restore

Your data lives in a PostgreSQL database inside Docker. Docker keeps that data
between restarts, but **that is not a backup** — it does not protect you from a
failed disk, a deleted record, ransomware, or a bad upgrade. This document
covers taking real backups and getting your data back.

---

## Taking a backup

Double-click **`backup.bat`**.

It writes a timestamped file into the `backups\` folder, for example:

```
backups\hvacflow_2026-07-20_183000.sql
```

That single file contains the entire database — every customer, order, unit,
task, user and configuration setting.

Backups older than **14 days** are deleted automatically. To keep them longer,
open `backup.bat` in Notepad and change this line near the top:

```
set RETENTION_DAYS=14
```

Note: only the routine `hvacflow_*.sql` backups are rotated. The
`pre-restore_*.sql` safety snapshots that `restore.bat` takes are **never**
deleted automatically — they exist precisely because someone restored the
wrong thing, so they outlive normal rotation. Delete those by hand once you're
sure you no longer need them.

### Requirements

- Docker Desktop must be running.
- HVACFlow must have been started at least once (`start.bat`), so the database
  container and `.env` file exist.

---

## Automatic nightly backups (recommended)

Backups only help if they actually happen. Schedule them:

1. Press the Windows key, type **Task Scheduler**, open it.
2. Click **Create Basic Task** on the right.
3. Name it `HVACFlow Nightly Backup`. Click Next.
4. Choose **Daily**. Click Next.
5. Pick a time when the machine is on but nobody is working — e.g. `22:00`.
   Click Next.
6. Choose **Start a program**. Click Next.
7. **Program/script:** browse to `backup.bat` in your HVACFlow folder.
8. **Add arguments:** type `--quiet`
   (this stops it waiting for a keypress, which would hang a scheduled run).
9. **Start in:** the HVACFlow folder path, e.g. `K:\Projects\HVACFlow`
10. Click Next, then Finish.

To confirm it works, right-click the task and choose **Run** — a new file
should appear in `backups\`.

---

## Get the backups off this machine

**This is the step people skip, and it's the one that matters most.** A backup
sitting on the same disk as the database dies with that disk.

Pick whichever is easiest for you:

- **Cloud sync (simplest):** move the `backups\` folder into a OneDrive,
  Google Drive or Dropbox folder, and point `backup.bat` at it — or just set
  that cloud folder as the "Start in" location. Files then sync off-site
  automatically.
- **Network drive / NAS:** copy `backups\` there on a schedule.
- **External drive:** copy it manually each week. Better than nothing, but it
  depends on someone remembering.

Rule of thumb: **at least one copy somewhere that isn't this computer.**

---

## Restoring a backup

> **This replaces everything currently in the database.** Anything created
> since that backup was taken will be gone.

Double-click **`restore.bat`**. It will:

1. Show the available backups and ask which one to use.
2. Make you type `RESTORE` in capitals to confirm — no accidental clicks.
3. **Automatically take a safety backup of the current data first**, saved as
   `backups\pre-restore_<timestamp>.sql`. So even a mistaken restore is
   recoverable — just restore that file to get back.
4. Load the chosen backup.

Afterwards, run `stop.bat` then `start.bat` so the app reloads cleanly.

To restore a specific file directly:

```
restore.bat C:\path\to\hvacflow_2026-07-20_183000.sql
```

---

## Test your restore — at least once

An untested backup isn't a backup. Do this once, deliberately, before you rely
on it:

1. Run `backup.bat`.
2. Change something harmless in the app (rename a department, say).
3. Run `restore.bat` and restore the backup from step 1.
4. Confirm your change is gone — that proves the restore genuinely worked.

Do this now, while it doesn't matter. Not during an emergency.

---

## Clearing test data (not a backup feature)

If you just want a clean slate for testing rather than a restore:

```
npm.cmd run db:clear-units
```

This deletes all units, parts, tasks, shipments and rework, but **keeps** your
configuration (departments, processes, part types, roles, users, workflow
stages) and your customers, projects and orders.

---

## Quick reference

| I want to…                              | Do this                          |
| --------------------------------------- | -------------------------------- |
| Take a backup now                       | `backup.bat`                     |
| Back up automatically every night       | Task Scheduler (see above)       |
| Go back to an earlier state             | `restore.bat`                    |
| Undo a restore I shouldn't have done    | Restore the `pre-restore_*` file |
| Wipe test units but keep configuration  | `npm.cmd run db:clear-units`     |

---

## If something goes wrong

- **"Docker Desktop does not appear to be running"** — open Docker Desktop,
  wait for the whale icon to stop animating, try again.
- **"The database container is not running"** — run `start.bat` first.
- **"No .env file found"** — run `start.bat` once; it creates it.
- **Backup file is 0 bytes** — the script deletes it and reports an error
  rather than leaving you with a useless file that looks valid.
