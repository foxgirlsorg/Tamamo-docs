---
title: Environment variables
description: Every environment variable of the Tamamo and web UI images, what each one overrides, and when it takes effect.
---

# Environment variables

This is the only list of environment variables. Use them for values that differ between machines, such as the upstream address or the admin login. Set them under `environment:` in your compose file, then run `docker compose up -d` again. Tamamo reads them at start-up.

For example, this sets `TAMAMO_TARGET` under the `tamamo` service in `docker-compose.yml`:

```yaml [docker-compose.yml]
services:
  tamamo:
    environment:
      TAMAMO_TARGET: http://app:80
```

A variable overrides the same setting in `tamamo.yaml`. The web UI shows that field as locked, with a badge that names the variable. Remove the variable to unlock the field.

::: warning Saving a locked field has no effect
The web UI saves a changed locked field to `tamamo.yaml`, but the variable still wins. Remove the variable, or change its value to match.
:::

## Backend

### TAMAMO_DATA

Overrides the `-data` flag: the folder with your settings, keys and statistics. Defaults to `./data`. The image uses `/data`. See [the data folder](/reference/files).

```yaml
TAMAMO_DATA: /srv/tamamo
```

### TAMAMO_LISTEN

Overrides [`server.listen`](/config/server), the address visitors connect to. Defaults to `:8923`. The image sets it, so the field is always locked there.

```yaml
TAMAMO_LISTEN: ":9000"
```

### TAMAMO_TARGET

Overrides [`server.target`](/config/server), the upstream: your website, which Tamamo forwards visitors to. Defaults to `http://localhost:3000`.

```yaml
TAMAMO_TARGET: http://app:80
```

### TAMAMO_ENABLE_API

Turns the admin API on when set to `1`, `true`, `yes` or `on`, in any letter case. Any other value leaves it off. The web UI needs the API, and a leftover `admin.enabled` in `tamamo.yaml` is ignored. See [web UI access](/config/admin).

```yaml
TAMAMO_ENABLE_API: "true"
```

### TAMAMO_ADMIN_LISTEN

Overrides `admin.listen`, the port of the admin API. Defaults to `:8081`. The image sets it and does not publish the port to your host.

```yaml
TAMAMO_ADMIN_LISTEN: ":8081"
```

### TAMAMO_IP_SOURCE

Overrides [`server.ip_source`](/config/server). Accepts `remote`, `x-forwarded-for`, `x-real-ip` or `cf-connecting-ip`. Any other value is ignored, but the field still shows as locked.

```yaml
TAMAMO_IP_SOURCE: x-forwarded-for
```

### TAMAMO_ADMIN_DOMAIN

Overrides [`admin.domains`](/config/admin), a comma-separated list of host names the admin API answers. Use `*.example.com` to allow a whole domain.

```yaml
TAMAMO_ADMIN_DOMAIN: admin.example.com
```

### TAMAMO_ADMIN_TRUSTED_PROXIES

Overrides [`admin.trusted_proxies`](/config/admin#sign-in-lockout-behind-the-web-ui-container), a comma-separated list of the proxies in front of the admin API: IP addresses, CIDR ranges, or `private`. The sign-in lockout then counts per visitor instead of per proxy.

```yaml
TAMAMO_ADMIN_TRUSTED_PROXIES: private
```

### TAMAMO_ADMIN_USERNAME

Sets the web UI login name. The login can then not be changed in the web UI. Set it together with `TAMAMO_ADMIN_PASSWORD`. If only one of them is set, Tamamo stops at start-up.

```yaml
TAMAMO_ADMIN_USERNAME: admin
```

### TAMAMO_ADMIN_PASSWORD

Sets the password for `TAMAMO_ADMIN_USERNAME`. Tamamo stores a hash, not the password. The field is not locked. Keep the value in a `.env` file so it stays out of the compose file. `.env` is a file next to the compose file, and Docker Compose reads variables from it.

```yaml
TAMAMO_ADMIN_PASSWORD: ${TAMAMO_ADMIN_PASSWORD}
```

### TAMAMO_DIFFICULTY

Sets [`protection.difficulty`](/config/protection) (1 to 8). It only applies when Tamamo creates `tamamo.yaml` for the first time. Later starts ignore it.

```yaml
TAMAMO_DIFFICULTY: "5"
```

## Web UI image

### TAMAMO_API

The address of the admin API. The image sets it to `http://tamamo:8081`. Set it only when your backend service has another name.

```yaml
TAMAMO_API: http://tamamo-backend:8081
```

### NGINX_ENTRYPOINT_LOCAL_RESOLVERS

Set to `1` in the image, so nginx looks up the backend name on each request. Leave it as it is.

```yaml
NGINX_ENTRYPOINT_LOCAL_RESOLVERS: "1"
```

## Related

- [Command-line flags](/reference/cli)
- [Data folder](/reference/files)
- [Troubleshooting](/reference/troubleshooting)
