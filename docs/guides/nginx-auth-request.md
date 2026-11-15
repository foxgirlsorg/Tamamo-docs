---
title: nginx auth_request
description: "Let nginx serve your site and ask Tamamo about each request with auth_request, so Tamamo never forwards traffic."
---

# nginx auth_request

Use this setup when nginx already serves your site, for example with static files, several virtual hosts or PHP-FPM. nginx asks Tamamo about each request. Tamamo answers allow, check or block, and nginx forwards the traffic to your app itself.

## Reverse proxy or auth_request

In a [reverse proxy](/guides/reverse-proxy) setup, Tamamo forwards every request. In auth_request mode, it answers a small question per request.

| | Reverse proxy | auth_request |
| --- | --- | --- |
| Who forwards the traffic | Tamamo | nginx |
| `server.target` | Your app | Empty |
| Large downloads and streaming | Pass through Tamamo | Straight from nginx |
| Works with | Any proxy | nginx with `ngx_http_auth_request_module`. For Caddy and Traefik, see [forward auth](/guides/forward-auth). |

## Before you start

You need:

- Tamamo running as in [Installation](/guide/installation).
- A working nginx that already serves your site. It needs the `auth_request` module, which the official nginx packages and Docker image include. This command prints `http_auth_request_module` when it is there:

  ```bash
  nginx -V 2>&1 | grep -o http_auth_request_module
  ```

- nginx able to reach Tamamo. The examples assume both run in Docker on one network, so nginx reaches Tamamo at `tamamo:8923`. With nginx outside Docker, use `127.0.0.1:8923` and publish Tamamo's port to the server only, as in [Keep Tamamo's port private](/guides/reverse-proxy#_1-keep-tamamo-s-port-private).

## How the pieces fit

Tamamo serves its own pages under `/.tamamo/`. nginx forwards that prefix to Tamamo.

| Endpoint | Used by | Answer |
| --- | --- | --- |
| `GET /.tamamo/auth` | nginx, for every request | `204` allow, `401` needs a check, `403` blocked |
| `/.tamamo/...` with `X-Tamamo-Render: 1` | nginx, after `401` or `403` | The checking page, or the denied page |
| `POST /.tamamo/api/verify` | The checking page's script | Stores the pass cookie after a solved check |
| `/.tamamo/health` | You, to test | `ok` |

On a `401`, nginx sends the visitor to `@tamamo`, which renders the checking page. A visitor who passes gets a pass cookie, and the next request gets `204`.

## Steps

1. **Set up Tamamo.** In `data/tamamo.yaml`, set these three things in the `server` section:

   ```yaml [data/tamamo.yaml]
   server:
     target: ""                # empty: nginx does all the forwarding
     ip_source: x-real-ip      # nginx sends the visitor's IP in this header
     trusted_proxies:
       - 172.18.0.0/16         # the Docker network nginx is on
   ```

   To find the right value for `trusted_proxies`, follow [Tell Tamamo to trust the proxy](/guides/reverse-proxy#_3-tell-tamamo-to-trust-the-proxy). If your compose file sets `TAMAMO_TARGET` or `TAMAMO_IP_SOURCE`, remove those lines there: they override the file.

   Also remove the `ports` section of the `tamamo` service in your compose file. Visitors must only reach Tamamo through nginx.

2. **Add Tamamo to your nginx configuration.** The example serves `example.com` over plain HTTP to stay short. In your own file, keep your `listen`, `server_name` and certificate lines, and add the `upstream` block, the five Tamamo locations, and the two marked lines in each `location` that serves your site.

   ```nginx [nginx/default.conf]
   upstream tamamo {
       server tamamo:8923;
       keepalive 16;
   }

   server {
       listen 80;
       server_name example.com www.example.com;

       # Tamamo's pages, scripts, images and the verify endpoint.
       location /.tamamo/ {
           proxy_pass http://tamamo;
           proxy_http_version 1.1;
           proxy_set_header Connection "";
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Only nginx itself may ask Tamamo for a verdict.
       location = /.tamamo/auth { return 404; }
       location = /.tamamo/forward-auth { return 404; }

       # Asked before every request. Internal: visitors can't call it.
       location = /.tamamo-auth {
           internal;
           proxy_pass http://tamamo/.tamamo/auth;
           proxy_http_version 1.1;
           proxy_pass_request_body off;
           proxy_set_header Content-Length "";
           proxy_set_header Connection "";
           proxy_set_header Host $host;
           proxy_set_header X-Original-URI $request_uri;
           proxy_set_header X-Original-Method $request_method;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Renders the checking page (401) or the denied page (403).
       location @tamamo {
           proxy_pass http://tamamo;
           proxy_http_version 1.1;
           proxy_set_header Connection "";
           proxy_set_header Host $host;
           proxy_set_header X-Tamamo-Render 1;
           proxy_set_header X-Original-URI $request_uri;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }

       # Your site. Every request is checked first.
       location / {
           auth_request /.tamamo-auth;        # add this
           error_page 401 403 = @tamamo;      # and this

           proxy_pass http://your-site:80;    # whatever serves your site today
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   `/.tamamo-auth` is `internal`, and `@tamamo` runs only after a `401` or `403`. Visitors can't reach either one directly.

3. **Reload nginx.** Tamamo reloads `tamamo.yaml` on its own within a few seconds.

## Check that it works

Run these on the server. Use the `Host` header if DNS isn't set up yet.

```bash
# 1. Tamamo answers through nginx.
curl -s -H 'Host: example.com' http://localhost/.tamamo/health
# ok

# 2. A visitor without a pass gets the checking page.
curl -i -H 'Host: example.com' http://localhost/ | head -n 1
# HTTP/1.1 200 OK

# 3. A script request without a pass is refused with JSON.
curl -i -H 'Host: example.com' -H 'Sec-Fetch-Mode: cors' -H 'Sec-Fetch-Dest: empty' http://localhost/
# HTTP/1.1 403 Forbidden
# {"error":"challenge_required"}
```

Then open `http://example.com` in a browser. After the check, your site loads.

## Common problems

- **`nginx -t` reports `unknown directive "auth_request"`.** Your nginx lacks the module. Check with the command in [Before you start](#before-you-start).
- **Every page returns `500`, and the log says `auth request unexpected status: 502`.** nginx can't reach `tamamo:8923`. Check that Tamamo runs and that the address in the `upstream` block is right.
- **Part of the site skips the check.** A `location` block without `auth_request` is not checked. Add the two lines to every block that serves the site, including static files.
- **The checking page loops after you pass.** The pass cookie isn't stored. Test through the same host name you open in the browser, and make sure the browser accepts cookies. Tamamo marks the cookie `Secure` only when nginx tells it the visitor used HTTPS, which the `X-Forwarded-Proto` lines do.
- **Every visitor shows the same IP in Activity.** nginx isn't in `trusted_proxies`. See step 1.

- **Every page returns `500`, and the log says `auth request unexpected status: 404`.** `target` isn't empty, so Tamamo keeps `/.tamamo/auth` closed. Empty it as in step 1, and check `TAMAMO_TARGET` in your compose file. See [auth mode](/config/server#auth-mode).

## Related

- [Behind a reverse proxy](/guides/reverse-proxy): let Tamamo forward the traffic instead.
- [Sites](/config/sites): one `server` block per domain, each with its own site.
- [Caddy and Traefik forward auth](/guides/forward-auth): the same idea for Caddy and Traefik.
