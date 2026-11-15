---
title: HTTP endpoints
description: Every HTTP path Tamamo serves to visitors under /.tamamo/, and the admin API routes the web UI uses, with method, purpose and authentication.
---

# HTTP endpoints

Use this page to check what a request does, to point a monitor at Tamamo, or to see what the web UI calls. Visitor paths live on the protected site's address, port `8923` by default. Admin API paths live on port `8081`, which only the web UI reaches.

## Visitor endpoints

Everything under `/.tamamo/` belongs to Tamamo. Your site never receives these requests.

`/.tamamo/auth` and `/.tamamo/forward-auth` are for your proxy, not for visitors. They answer `404` while [`server.target`](/config/server#auth-mode) is set, and the proxy configs in the guides keep visitors away from them.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET, HEAD | `/.tamamo/health` | Returns `ok`. For health checks and uptime monitors. | None |
| GET, HEAD | `/.tamamo/auth` | nginx `auth_request` check. Returns `204` to allow, `401` for a check, `403` to block. | None |
| GET, HEAD | `/.tamamo/forward-auth` | Caddy `forward_auth` and Traefik ForwardAuth check. Returns `204` to allow, `401` with the checking page, `403` with the denied page. Reads the page asked for from `X-Forwarded-Uri` and `X-Forwarded-Method`. | None |
| GET, HEAD | `/.tamamo/api/pass` | A 15-minute copy of the visitor's pass, as JSON, for the page's script to send to a site on another domain. Answers `404` unless another site lists this one in `accept_passes_from`, and `401` without a valid pass. | The pass cookie |
| POST | `/.tamamo/api/verify` | The checking page posts the solved puzzle here. Success sets the pass cookie and returns `{"ok": true, "redirect": "/page"}`. Failure returns `403`, or `429` with `Retry-After: 60` after too many failures. | The signed challenge |
| GET, HEAD | `/.tamamo/static/img/{slot}` | Checking page images: `checking`, `success`, `denied`, `background` or `favicon`. | None |
| GET, HEAD | `/.tamamo/static/{file}` | Checking page scripts: `solver.js` and `worker.js`. | None |
| GET, HEAD | `/.tamamo/modules/{id}/{file}` | Static files of a [module](/modules/hooks#pageextender) that is on for the site. `{id}` is the module's ID. | Enabled module |
| Any | `/.tamamo/x/{name}/…` | A module's [own URLs](/modules/hooks#handler). `{name}` is the entry's name. The module answers. | Enabled module |

Other methods on Tamamo's own paths return `405` with an `Allow` header. Any other path under `/.tamamo/` returns `404`. Templates (`.html`) and dotfiles are never served.

To check the health endpoint:

```bash
curl -s https://example.com/.tamamo/health
```

It prints `ok`.

## Admin API

The admin API runs only when [`TAMAMO_ENABLE_API`](/reference/environment#tamamo-enable-api) is set. Otherwise the web UI shows `502 Bad Gateway`. See [troubleshooting](/reference/troubleshooting#why-does-the-web-ui-show-502-bad-gateway).

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/` | Identity: `name`, `admin_api`, `version` | None |
| GET | `/api/state` | Setup status, sign-in status, version, `restart_required` | None |
| POST | `/api/setup` | Creates the first login. `409` if one exists. | None |
| POST | `/api/login` | Signs in. `401` wrong login, `409` no login yet, `429` locked out. | None |
| POST | `/api/logout` | Ends the session | None |
| GET, PUT | `/api/config` | Reads or saves all settings, with the `locked` map | Session |
| GET | `/api/stats?site=` | Statistics for one site | Session |
| POST | `/api/stats/reset` | Clears statistics | Session |
| POST | `/api/preview` | Checking page HTML for the designer preview | Session |
| POST, DELETE | `/api/upload/{slot}` | Uploads (up to 4 MB) or removes a checking page image | Session |
| POST | `/api/password` | Changes the login. `409` when `TAMAMO_ADMIN_USERNAME` is set. | Session |
| POST | `/api/secret/rotate` | Replaces the signing key now | Session |
| POST | `/api/test` | Rule tester: which rule matches a sample request | Session |
| GET, PUT | `/api/rules/file` | Reads or saves rules as YAML. A `400` error names the line. | Session |
| GET | `/api/modules` | The modules in this build (`available`, with their settings and pages) and the ones running (`running`) | Session |
| Any | `/api/x/{name}/…` | A module's [own admin API](/modules/hooks#adminhandler) | Session |
| GET | `/assets/img/{slot}` | Checking page image | None |
| GET | `/assets/challenge/…`, `/assets/mascot/…` | Preview scripts and mascot pictures | None |
| GET | `/assets/modules/ui/{id}/{file}` | Files of a module's [web UI pages](/modules/ui) | Session |
| GET | `/assets/modules/static/{id}/{file}` | A module's static files, for the preview | Session |
| GET | `/assets/modules/kit/{file}` | The [UI kit](/modules/ui#the-ui-kit) for module pages: `tamamo.css`, `tamamo.js` | None |

Every call follows these rules:

- Sign-in sets the `tamamo_admin` cookie. It is `HttpOnly` and `SameSite=Strict`, and lasts `admin.session_hours` (default 168).
- Requests other than `GET`, `HEAD` or `OPTIONS` need the header `X-Tamamo-Request: 1`. An `Origin` header, if sent, must name the same host. Otherwise they get `403`.
- When `admin.domains` is set, other host names get an empty `404`.
- Errors are JSON: `{"error": "..."}`.
- The first four failed sign-ins are free. From the fifth on, each failure locks the address out for 30 seconds, then for twice as long each time, up to 15 minutes. A successful sign-in clears the count.

## Related

- [Environment variables](/reference/environment)
- [nginx auth_request](/guides/nginx-auth-request)
- [An API on another domain](/guides/api-on-another-domain)
- [Caddy and Traefik forward auth](/guides/forward-auth)
- [Troubleshooting](/reference/troubleshooting)
