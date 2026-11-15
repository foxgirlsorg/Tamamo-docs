---
title: Troubleshooting
description: Fixes for common Tamamo problems, starting from what you see - 502 errors in the web UI, permission errors, checks that repeat, shared IP addresses, settings that do not apply, and more.
---

# Troubleshooting

Find the symptom, then follow the fix. Tamamo logs start-up, reloads and errors, but not individual visitors, so start with the logs:

```bash
docker compose logs --tail 50 tamamo
```

## Web UI

### Why does the web UI show 502 Bad Gateway?

The web UI can't reach the admin API on port 8081. Check these causes in order:

1. **The admin API is off.** Set `TAMAMO_ENABLE_API` to `"true"` on the `tamamo` service, then run `docker compose up -d`. A plain restart is not enough. The log says `admin API is off`. See [environment variables](/reference/environment#tamamo-enable-api).
2. **The backend has another name.** The web UI looks for a service named `tamamo`. Set [`TAMAMO_API`](/reference/environment#tamamo_api) on the `webui` service.
3. **The backend is not running.** Check `docker compose ps`.

To test the link, run `docker compose exec webui wget -qO- http://tamamo:8081/`. JSON with `"admin_api":true` means it works. `Connection refused` means the API is off. An empty `404` means the host name is not in [`admin.domains`](/config/admin).

### I forgot the admin password. How do I reset it?

Set a new password with `-set-login`:

```bash
printf '%s\n' 'a-new-long-passphrase' | docker compose exec -T tamamo tamamo -set-login admin
```

Replace `admin` with your username. If `TAMAMO_ADMIN_USERNAME` and `TAMAMO_ADMIN_PASSWORD` are set, change those instead. See [command-line flags](/reference/cli#set-login).

## Startup and files

### Why does Tamamo report "permission denied" on /data?

The container runs as user ID `65532`, which must own the data folder. Run `sudo chown 65532:65532 data`, then `docker compose up -d`. See [the data folder](/reference/files#permissions).

### Why does Tamamo stop at start-up with a line number?

The log names the bad line, for example `unknown setting "pass_hour" in protection (did you mean "pass_hours"?)`. Fix that line, then check the file:

```bash
docker compose run --rm tamamo -check
```

If the file is beyond repair, move it aside. Tamamo writes a new one with defaults, and you must set the login and sites again. See [broken files](/reference/files#broken-files).

### Why does Tamamo say "address already in use"?

Another program, or a second Tamamo, uses the port. Stop it, or change the host side of the port mapping:

```yaml [docker-compose.yml]
ports:
  - "9923:8923"
```

When you run the binary directly, set [`TAMAMO_LISTEN`](/reference/environment#tamamo_listen) to another address, such as `:9000`.

## Settings

### Why does my settings change have no effect?

Check these causes in order:

1. **The field is locked.** An environment variable overrides it. Remove the variable, or change its value. See [environment variables](/reference/environment).
2. **The setting needs a restart.** [`server.listen`](/config/server) and `admin.listen` are read only at start-up.
3. **The file has an error.** Tamamo logs `could not reload the settings; keeping the running ones`. Run `docker compose exec tamamo tamamo -check` to see the line.
4. **You edited a different file.** In Docker, Tamamo reads `/data/tamamo.yaml`, which is `./data/tamamo.yaml` on your host. See [the data folder](/reference/files).

### Why does my site not match?

Tamamo picks the site from the `Host` header, and uses the global settings when no site lists that name. A proxy that rewrites the host is the usual cause. In nginx, add `proxy_set_header Host $host;`. See [sites](/config/sites).

## Visitors

### Why does everyone have to pass the check again?

The signing key changed, so every pass is invalid. This happens after a rotation, or when `secret.key` is deleted or empty at start-up. If you did not rotate it on purpose, restore `secret.key` from your backup and restart Tamamo. See [the data folder](/reference/files).

### Why does the check loop forever?

The pass cookie (`tamamo-pass` by default) is not stored or not sent back. Check these causes in order:

1. **The cookie is not stored.** Set [`protection.cookie_domain`](/config/protection) to the host name, a parent domain, or empty.
2. **The cookie is `Secure` over HTTP.** The `Secure` mark means the browser sends the cookie only over HTTPS. Serve HTTPS, or have the proxy send `X-Forwarded-Proto: https`.
3. **The visitor's address or browser changes.** The pass is bound to the address and user agent. Fix the proxy, or turn off `bind_ip` or `bind_user_agent` in [protection](/config/protection).
4. **The verify request is blocked.** If the page shows `Something went wrong`, pass `/.tamamo/` through your proxy unchanged. See [behind a reverse proxy](/guides/reverse-proxy).

### Why do all visitors share one IP address?

Behind a proxy, Tamamo sees the proxy's address. Set [`server.ip_source`](/config/server) to the header your proxy sends, and list the proxy's address under `server.trusted_proxies`. An empty `trusted_proxies` lets anyone who can reach Tamamo fake an address. The valid `ip_source` values are `remote`, `x-forwarded-for`, `x-real-ip` and `cf-connecting-ip`. See [Tell Tamamo to trust the proxy](/guides/reverse-proxy#_3-tell-tamamo-to-trust-the-proxy).

### Why are search engines blocked?

Pages drop out of search results, or results show `Just a moment…`. Check these causes in order:

1. **A rule above `allow-search-engines` matches first.** Rules run top to bottom. Test a Googlebot user agent in the rule tester. See [rules](/config/rules).
2. **The default rules changed.** Restore them as described in [default rules](/config/rules).
3. **The crawler is on no list.** Add its name to an allow rule. See [rules](/config/rules).

## Statistics

### Why are the statistics empty?

Statistics are off by default, and visits made while they are off are not counted. Turn them on as described in [statistics](/config/admin).

## Related

- [Environment variables](/reference/environment)
- [Command-line flags](/reference/cli)
- [Behind a reverse proxy](/guides/reverse-proxy)
