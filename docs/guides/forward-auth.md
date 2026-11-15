---
title: Caddy and Traefik forward auth
description: "Let Caddy or Traefik serve your site and ask Tamamo about each request with forward_auth or ForwardAuth, so Tamamo never forwards traffic."
---

# Caddy and Traefik forward auth

In this setup your proxy keeps serving the site. Before each request, it asks Tamamo one question: may this visitor pass? Tamamo answers, and never touches the traffic itself.

```text
visitor ──► Caddy or Traefik ──► your app
                  │  ▲
     "may they pass?"  "yes" / the checking page
                  ▼  │
                 Tamamo
```

Use it when the proxy serves files or PHP itself, or when you don't want large downloads and streams to pass through Tamamo. If you'd rather have Tamamo forward everything, see [Behind a reverse proxy](/guides/reverse-proxy). For nginx, see [nginx auth_request](/guides/nginx-auth-request).

## How it works

The proxy calls one address in Tamamo for every request: `/.tamamo/forward-auth`.

| Tamamo answers | Meaning | What the proxy does |
| --- | --- | --- |
| `204` | The visitor may pass. | Serves the request. |
| `401` with the checking page | The visitor has to pass the check first. | Shows that page to the visitor. |
| `403` with the denied page | The visitor is blocked. | Shows that page to the visitor. |

The checking page loads its script and pictures from `/.tamamo/...` and reports the solved check there. So the proxy also has to send everything under `/.tamamo/` straight to Tamamo. After the check, the visitor gets a pass cookie, the page reloads, and Tamamo answers `204`.

## Before you start

You need:

- Tamamo 0.2.0 or newer, running as in [Installation](/guide/installation).
- A working Caddy or Traefik that already serves your site over HTTPS.
- Tamamo and the proxy able to reach each other. The examples assume both run in Docker on one network, so the proxy reaches Tamamo at `tamamo:8923`. With a proxy outside Docker, use `127.0.0.1:8923` and publish Tamamo's port to the server only, as in [Keep Tamamo's port private](/guides/reverse-proxy#_1-keep-tamamo-s-port-private).

The examples use `example.com`.

## 1. Set up Tamamo

In `data/tamamo.yaml`, set these three things in the `server` section:

```yaml [data/tamamo.yaml]
server:
  target: ""                   # empty: Tamamo forwards nothing
  ip_source: x-forwarded-for   # the proxy sends the visitor's IP in this header
  trusted_proxies:
    - 172.18.0.0/16            # the Docker network your proxy is on
```

If your compose file sets `TAMAMO_TARGET` or `TAMAMO_IP_SOURCE`, remove those lines there: they override the file.

The empty `target` matters twice. It tells Tamamo not to forward anything, and it switches on `/.tamamo/forward-auth`, which answers `404` while a target is set. See [auth mode](/config/server#auth-mode).

To find the right value for `trusted_proxies`, follow [Tell Tamamo to trust the proxy](/guides/reverse-proxy#_3-tell-tamamo-to-trust-the-proxy). Don't skip it. Tamamo only believes the proxy's headers when the proxy is in this list.

Also remove the `ports` section of the `tamamo` service in your compose file. Visitors must only reach Tamamo through the proxy.

## 2. Set up your proxy

### Caddy

```text [Caddyfile]
example.com {
    # Tamamo's own pages, scripts and pictures.
    handle /.tamamo/* {
        # Only Caddy itself may ask Tamamo for a verdict.
        @verdict path /.tamamo/auth /.tamamo/forward-auth
        respond @verdict 404

        reverse_proxy tamamo:8923
    }

    # Your site. Tamamo is asked before every request.
    handle {
        forward_auth tamamo:8923 {
            uri /.tamamo/forward-auth
        }

        reverse_proxy app:80
    }
}
```

Replace `reverse_proxy app:80` with whatever serves your site today, for example `file_server` or `php_fastcgi`. Keep `forward_auth` above it.

Both `handle` blocks are needed. Without the first one, the checking page can't load its script and never finishes. The two `@verdict` lines keep visitors from asking Tamamo for a verdict themselves. Caddy's own question doesn't pass through that block, so it still works.

### Traefik

Traefik needs two things: a route that sends `/.tamamo/` to Tamamo, and a middleware that asks Tamamo before your app is served. Both are set with labels.

On the `tamamo` service:

```yaml [docker-compose.yml]
services:
  tamamo:
    # no "ports" section
    labels:
      - traefik.enable=true
      # Tamamo's own pages, scripts and pictures.
      - traefik.http.routers.tamamo.rule=Host(`example.com`) && PathPrefix(`/.tamamo/`) && !Path(`/.tamamo/forward-auth`) && !Path(`/.tamamo/auth`)
      - traefik.http.routers.tamamo.entrypoints=websecure
      - traefik.http.routers.tamamo.tls.certresolver=le
      - traefik.http.services.tamamo.loadbalancer.server.port=8923
      # The question Traefik asks before every request.
      - traefik.http.middlewares.tamamo.forwardauth.address=http://tamamo:8923/.tamamo/forward-auth
```

On your app's service, add one label to the labels it already has:

```yaml [docker-compose.yml]
services:
  app:
    labels:
      - traefik.enable=true
      - traefik.http.routers.site.rule=Host(`example.com`)
      - traefik.http.routers.site.entrypoints=websecure
      - traefik.http.routers.site.tls.certresolver=le
      - traefik.http.routers.site.middlewares=tamamo     # this one
```

The two `!Path(...)` parts keep visitors from asking Tamamo for a verdict themselves: a visitor who opens `/.tamamo/forward-auth` is treated like on any other page.

`websecure` and `le` are the names of the entry point and the certificate resolver. Use the names from your own Traefik setup. `site` is the name of your app's router: keep the one you already have.

Leave the middleware's `trustForwardHeader` option off, which is the default. With it on, Traefik would pass on the address and page name the visitor claims.

## 3. Check that it works

1. Tamamo answers through the proxy. This prints `ok`:

   ```bash
   curl -s https://example.com/.tamamo/health
   ```

2. A visitor without a pass gets the checking page. This prints `401`:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://example.com/
   ```

3. Open `https://example.com` in a private browser window. You see the checking page for a moment, then your site.

4. In the web UI, **Monitor > Activity** shows your own public IP address on the newest events, not an address starting with `172.`.

## More than one domain

Tamamo picks the [site](/config/sites) by the host name the visitor opened. Caddy passes that name on by itself. Traefik sends it in the `X-Forwarded-Host` header, which Tamamo reads only from a trusted proxy. That is one more reason to fill in `trusted_proxies` in step 1.

For each extra domain, repeat the proxy config: in Caddy, another site block with the same two `handle` blocks. In Traefik, add the domain to the `tamamo` router's rule, and add the `middlewares=tamamo` label to that app's router.

## What is different in this mode

- Modules can't [edit requests or responses](/modules/hooks), because the traffic doesn't pass through Tamamo.
- A part of the site that the proxy serves without the auth check isn't protected. In Caddy, that is anything outside the `handle` block with `forward_auth`. In Traefik, any router without the `tamamo` middleware.
- The checking page arrives with status `401`, not `200`. Browsers show it the same way.

## Common problems

- **The checking page appears but never finishes.** Its script can't reach Tamamo. Check the `/.tamamo/` part of the proxy config: `curl -s https://example.com/.tamamo/health` must print `ok`.
- **Every request gets `502`, or `500` in Traefik.** The proxy can't reach `tamamo:8923`. Check that both are on the same Docker network and that the service is named `tamamo`.
- **Your site answers "Bad Gateway" from Tamamo.** A request reached Tamamo's port directly, and `target` is empty. Only `/.tamamo/` may be routed to Tamamo.
- **Every visitor has the same IP address in Activity.** The proxy isn't in `trusted_proxies`, or `ip_source` isn't `x-forwarded-for`. See step 1.
- **With Traefik, the wrong site's settings are used.** Same cause: Tamamo ignores `X-Forwarded-Host` from a proxy it doesn't trust.

- **The proxy gets `404` from `/.tamamo/forward-auth`, and every page fails.** `target` isn't empty. Check `TAMAMO_TARGET` in your compose file too.

## Related

- [Behind a reverse proxy](/guides/reverse-proxy): let Tamamo forward the traffic instead.
- [nginx auth_request](/guides/nginx-auth-request): the same idea for nginx.
- [Endpoints](/reference/endpoints): everything Tamamo serves under `/.tamamo/`.
