---
title: Data folder
description: The files in Tamamo's data folder, who writes each one, which ones are safe to delete, the permissions they need, and what happens to old or broken files.
---

# Data folder

Tamamo keeps its state in one folder. In Docker it is `/data` inside the container, usually mounted with `./data:/data`. On your host, that is the `data` folder next to your compose file. Stop Tamamo before you restore files or copy the ones marked "Only while stopped". To back it up, see [back up and upgrade](/guides/backup-and-upgrade).

| File or folder | Written by | Safe to delete? | Notes |
|---|---|---|---|
| `tamamo.yaml` | Tamamo, the web UI and the CLI | No | All settings, sites, and the login hash. Back it up first. |
| `secret.key` | Tamamo | No | The signing key. Deleting it signs every visitor out. |
| `tamamo.db` | Tamamo | Only while stopped | Statistics in SQLite, a small database kept in one file. Created on every start, even with statistics off. |
| `tamamo.db-wal`, `tamamo.db-shm` | SQLite | Only while stopped | Delete them with `tamamo.db`, or not at all. |
| `tamamo.db.corrupt` | Tamamo | Yes | An unreadable database, kept for inspection. |
| `uploads/` | The web UI | Yes, per file | Custom images: `checking`, `success`, `denied`, `background` and `favicon`, as `.png`, `.jpg`, `.gif` or `.webp`. A missing image falls back to the built-in one. |
| `modules/<name>/` | Modules | Depends on the module | Files a [module](/config/modules#files-a-module-keeps) keeps, one folder per entry. Created only by modules that store something. Removing an entry leaves its folder. |
| `stats.json.migrated` | Tamamo | Yes | The old statistics file, already imported. |
| `config.json.old`, `rules.yaml.old` | Tamamo | Yes, after you check `tamamo.yaml` | Settings files from an older version. |
| `*.tmp` | Tamamo | Yes, when stopped | Left behind only if Tamamo stopped during a save. |

## Permissions

The image runs as user ID `65532`. That user must be able to write to the folder. Tamamo writes `tamamo.yaml` with mode `0640` and `secret.key` with mode `0600`.

On Linux, Docker creates a missing bind-mounted folder as `root`. Create it yourself first:

```bash
mkdir data
sudo chown 65532:65532 data
```

Docker Desktop on Windows and macOS usually sets the owner for you. For `permission denied` errors, see [troubleshooting](/reference/troubleshooting#why-does-tamamo-report-permission-denied-on-data).

## Legacy migration

Tamamo reads the files of older versions only when there is no `tamamo.yaml` yet. It converts `config.json` and `rules.yaml` into `tamamo.yaml`, and renames the old files to `.old`. It imports `stats.json` into `tamamo.db` once, then renames it to `stats.json.migrated`. Stop Tamamo before you copy an old folder in.

## Broken files

- **`tamamo.yaml` with a syntax error at start-up:** Tamamo refuses to start and names the line.
- **`tamamo.yaml` broken while running:** Tamamo logs `could not reload the settings; keeping the running ones` and keeps the previous settings. Fix the file, and Tamamo reloads it within about 2 seconds.
- **`tamamo.yaml` deleted while stopped:** Tamamo creates a new file with defaults. Your sites, rules and login are gone.
- **`secret.key` empty at start-up:** Tamamo creates a new key, so every visitor signs out.
- **`tamamo.db` not a database:** Tamamo moves it and its `-wal` and `-shm` files to `.corrupt`, and starts with empty statistics. Settings are not affected.

## Related

- [Backup and upgrade](/guides/backup-and-upgrade)
- [Command-line flags](/reference/cli)
- [Environment variables](/reference/environment)
