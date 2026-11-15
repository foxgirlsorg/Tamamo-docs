---
title: Back up, upgrade and move Tamamo
description: "Back up the Tamamo data folder, pin and upgrade the image, roll back, and move to a new server."
---

# Back up, upgrade and move Tamamo

Your settings and your visitors' passes live in the data folder, not in the container, so back up that folder before every upgrade. For what each file holds, see [the data folder](/reference/files).

::: info
If you started Tamamo with `docker-compose.webui.yml`, add `-f docker-compose.webui.yml` after `docker compose` in every command on this page.
:::

::: danger Treat secret.key like a password
Anyone with `secret.key` can make valid passes for your sites. Keep backups private. If the key leaks, run `docker compose exec tamamo tamamo -rotate-secret` and restart Tamamo. That signs every visitor out.
:::

## Back up

Stop Tamamo before you copy the folder, so the statistics database is consistent. Visitors can't reach your site while it is stopped, so pick a quiet time.

```bash
docker compose stop tamamo
sudo tar -czf "tamamo-backup-$(date +%F).tar.gz" -C ./data .
docker compose start tamamo
```

`sudo` is needed because the container writes the files as user ID 65532.

## Restore

1. Stop Tamamo: `docker compose stop tamamo`.
2. Move the current data folder aside and make an empty one: `sudo mv data data.old && mkdir data`.
3. Unpack the archive into the data folder: `sudo tar -xzf tamamo-backup-2026-11-01.tar.gz -C ./data`.
4. Give the files back to the container user: `sudo chown -R 65532:65532 ./data`.
5. Start Tamamo: `docker compose start tamamo`. Then run `docker compose exec tamamo tamamo -check`.

## Pin the version

The compose files use `:latest`, so `docker compose pull` can jump to a new major version. To choose when you upgrade, pin a version in `.env`:

```text [.env]
TAMAMO_VERSION=1.0.0
```

Then point the image at it:

```yaml [docker-compose.yml]
services:
  tamamo:
    image: ghcr.io/foxgirlsorg/tamamo:${TAMAMO_VERSION:-latest}
```

Check the running version with `docker compose exec tamamo tamamo -version`. The web UI image, `ghcr.io/foxgirlsorg/tamamo-webui`, uses the same kind of tag.

## Upgrade

1. **Back up** the data folder, as above.
2. **Pull the new image and recreate the containers.** Change `TAMAMO_VERSION` first if you pin a version.

   ```bash
   docker compose pull && docker compose up -d
   ```

3. **Check the logs.** The log should contain `tamamo is protecting your site`.

   ```bash
   docker compose logs --tail=50 tamamo
   docker compose exec tamamo tamamo -check
   ```

If you use the web UI, the same command pulls its image too.

Older files are converted on the first start, and the originals keep a `.old` or `.migrated` name. See [legacy migration](/reference/files#legacy-migration). Settings you don't write keep their defaults, so new settings need nothing from you.

### What a restart resets

A restart keeps your settings, `secret.key` and every visitor's pass. It resets:

- the web UI sign-in sessions, so you sign in again;
- the list of challenges already used;
- the counters of failed checks per IP address, and the counters of the rate limit;
- anything a module keeps only in memory.

Edits to `tamamo.yaml` don't need a restart. Changes to listen addresses do.

## Roll back

A newer version can write settings that an older one doesn't know, and an older version refuses a `tamamo.yaml` with unknown keys.

1. Stop Tamamo: `docker compose stop tamamo`.
2. If the newer version wrote the file, restore the backup you took before the upgrade, as described in [Restore](#restore).
3. Set `TAMAMO_VERSION` to the old version, and run `docker compose up -d`.

If you changed nothing since the upgrade, setting the old version is enough.

## Move to another server

1. On the old server, stop Tamamo and archive `./data`, as in the backup step.
2. On the new server, install Docker, put the compose files in place, unpack the archive into `./data`, and run `sudo chown -R 65532:65532 ./data`.
3. Set again any environment variables you use, such as `TAMAMO_TARGET`, `TAMAMO_IP_SOURCE` or `TAMAMO_ADMIN_DOMAIN`. They are not stored in `tamamo.yaml`. See [environment variables](/reference/environment).
4. Start Tamamo, and point your DNS records at the new server.

Passes keep working, because `secret.key` moves with the folder.

::: danger Never run two instances on one data folder
Two instances writing to one folder conflict over `tamamo.db`, and each rewrites `tamamo.yaml` when you save from the web UI. Stop the old server before the new one starts.
:::

## Common problems

- **The container keeps restarting after an upgrade.** Read `docker compose logs --tail=100 tamamo`. The log gives the line of the setting the new version doesn't accept. Fix it, or roll back.
- **`permission denied` on `tamamo.yaml` or `tamamo.db`.** The files aren't owned by user 65532. Run `sudo chown -R 65532:65532 ./data`. See [permissions](/reference/files#permissions).
- **You can't sign in to the web UI after a restore.** Set the login again with `TAMAMO_ADMIN_USERNAME` and `TAMAMO_ADMIN_PASSWORD`, or run `docker compose exec tamamo tamamo -set-login <username>`. See [command-line flags](/reference/cli#set-login).

## Related

- [Behind a reverse proxy](/guides/reverse-proxy): the proxy settings to keep when you move servers.
- [Server settings](/config/server)
- [The data folder](/reference/files)
