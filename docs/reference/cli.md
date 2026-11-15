---
title: Command-line flags
description: Every flag of the tamamo program, with examples for a binary and for docker compose exec, plus exit codes and login rules.
---

# Command-line flags

Use these flags for one-off jobs: validating `tamamo.yaml`, creating the admin login, or replacing the signing key. Run `tamamo` without flags to start the proxy. Flags run next to a running Tamamo, so you can use them while it serves visitors. `tamamo -help` prints the same list.

In Docker, run each flag through `docker compose exec tamamo tamamo`:

```bash
docker compose exec tamamo tamamo -check
docker compose exec tamamo tamamo -modules
docker compose exec -it tamamo tamamo -set-login admin
docker compose exec tamamo tamamo -rotate-secret
docker compose exec tamamo tamamo -healthcheck
docker compose exec tamamo tamamo -version
```

Each section below shows the flag on its own.

### -data

The data folder. Defaults to `$TAMAMO_DATA`, or `./data`. See [the data folder](/reference/files).

```bash
./tamamo -data /srv/tamamo -check
```

### -check

Validates `tamamo.yaml`, prints the path with `is valid`, and exits. It writes nothing.

```bash
docker compose exec tamamo tamamo -check
```

It prints the file path and `is valid`:

```text
/data/tamamo.yaml is valid
```

If the file has an error, it prints the first error with its line number instead.

### -modules

Lists the [modules](/config/modules) compiled into this build, with their settings, and exits. The standard build has none; see [Build Tamamo with modules](/modules/build).

```bash
docker compose exec tamamo tamamo -modules
```

### -set-login

Sets the web UI username. The password comes from `TAMAMO_ADMIN_PASSWORD`, or from the first line of standard input if that variable is unset.

```bash
printf '%s\n' 'a-long-passphrase' | docker compose exec -T tamamo tamamo -set-login admin
```

Without piped input, the command asks for the password and then prints:

```text
new admin password:
admin login saved for admin
```

`-T` stops Compose from allocating a terminal, which piped input needs. Passing the password with `-e` also works, but the value then stays in your shell history.

### -rotate-secret

Replaces `secret.key`, so every visitor passes the check again. Restart Tamamo afterward so the running process uses the new key. The rotate button in the web UI applies at once. See [web UI access](/config/admin).

```bash
docker compose exec tamamo tamamo -rotate-secret
```

### -healthcheck

Asks the running Tamamo for `/.tamamo/health` on its listen address. The image uses it for the container health check.

```bash
tamamo -healthcheck
```

### -version

Prints the version number and exits.

```bash
tamamo -version
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success. Also a valid `-check`, and a healthy `-healthcheck`. |
| `1` | An error: an invalid line in `tamamo.yaml`, a login that breaks the rules below, an unwritable data folder, a port in use, or a failed health check. |
| `2` | Wrong use of a flag, such as an unknown flag. |

Errors go to standard error with a `tamamo:` prefix. Settings errors name the file and the line.

## Login rules

These rules apply to `-set-login`, `TAMAMO_ADMIN_USERNAME` and the first-run form in the web UI.

| Field | Rule |
|---|---|
| Username | 3 to 64 characters. No space at the start or end. |
| Password | 8 characters or more, and at most 1024 bytes. |

Tamamo stores a salted hash of the password, never the password itself.

## Related

- [Environment variables](/reference/environment)
- [Data folder](/reference/files)
- [Troubleshooting](/reference/troubleshooting)
