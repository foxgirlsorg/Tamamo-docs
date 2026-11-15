---
title: Hooks
description: "Reference for every interface a Tamamo module can implement: Checker, Observer, RequestModifier, ResponseModifier, PageExtender, Handler, AdminHandler, Starter and Stopper."
---

# Hooks

A hook is a Go interface from the package `github.com/foxgirlsorg/tamamo/module`. The value your `New` function returns implements the ones the module needs, and Tamamo calls them. There is nothing to declare: implementing the method is enough.

The code examples on this page are fragments of an imaginary `geo` module. Each one shows a single hook. A complete, working module that uses most of the hooks is in [`examples/hello`](https://github.com/foxgirlsorg/Tamamo/tree/main/examples/hello) in the Tamamo repository.

| Interface | Method | Called |
| --- | --- | --- |
| [`Checker`](#checker) | `Check(ctx, *Request) (Decision, error)` | For every request, before the rules |
| [`Observer`](#observer) | `Observe(Event)` | After Tamamo acted on a request |
| [`RequestModifier`](#requestmodifier-and-responsemodifier) | `ModifyRequest(out *http.Request, r *Request)` | Before a request is sent to your app |
| [`ResponseModifier`](#requestmodifier-and-responsemodifier) | `ModifyResponse(resp *http.Response, r *Request) error` | Before your app's response reaches the visitor |
| [`PageExtender`](#pageextender) | `ExtendPage(*PageRequest) PageParts` | When a Tamamo page is rendered |
| [`Handler`](#handler) | `ServeHTTP(w, r)` | For `/.tamamo/x/<name>/...` on the protected site |
| [`AdminHandler`](#adminhandler) | `ServeAdmin(w, r)` | For `/api/x/<name>/...` on the admin API |
| [`Starter`](#starter-and-stopper) | `Start(ctx) error` | Once, when the instance is switched on |
| [`Stopper`](#starter-and-stopper) | `Stop() error` | Once, when it is switched off |

Rules that hold for all of them:

- **Sites.** A hook is only called for requests to sites the entry is switched on for (`sites` in `tamamo.yaml`).
- **Concurrency.** Every hook except `Start` and `Stop` is called from many goroutines at once. Protect shared state.
- **Panics.** A panic in a hook is caught and logged; it never takes Tamamo down. What happens to the request is described per hook.
- **Speed.** `Check`, `Observe`, `ModifyRequest` and `ModifyResponse` run on the request path. Whatever time they take, the visitor waits.

## The context

`New` receives a `*module.Context`. Keep it in your struct if you need it later.

| Field or method | What it is |
| --- | --- |
| `Name` | The entry's `name` in `tamamo.yaml`. Use it in logs and to build your own URLs (`/.tamamo/x/` + `Name`). |
| `Settings` | The entry's settings with defaults filled in. See [Settings](/modules/settings). |
| `Sites` | The site IDs the entry is limited to. Empty means all. For information only: Tamamo does the filtering. |
| `Logger` | A `*slog.Logger` that writes to Tamamo's log with `module=<name>` attached. |
| `Validating` | `true` when `New` runs only to check a config before saving. The instance is then discarded. |
| `DataDir()` | Returns the instance's own folder, `data/modules/<name>/`, creating it on first use. Call it from `Start` or later, not from `New`. |

## Checker

```go
type Checker interface {
	Check(ctx context.Context, r *Request) (Decision, error)
}
```

`Check` decides about a request before the rules do. Modules are asked top to bottom; the first non-empty `Action` wins and the rest, rules included, are skipped. See [where modules run](/config/modules#where-modules-run).

`Request` describes the visitor's request:

| Field | Type | Notes |
| --- | --- | --- |
| `Site` | `string` | The site's ID; `default` for the default site. |
| `Method` | `string` | Behind nginx `auth_request`, the method of the original request. |
| `Host` | `string` | Lower-case, without a port. |
| `Path` | `string` | Normalized: `/a/../b` arrives as `/b`. Match against this, never against a raw URL. |
| `Query` | `string` | The raw query string, without `?`. |
| `UserAgent` | `string` | |
| `IP` | `netip.Addr` | The visitor's address as Tamamo resolved it from the [IP source](/config/server). Check `IP.IsValid()`: it can be unknown. |
| `Header` | `http.Header` | The live request headers. Read-only: changing them here is a bug. |

`Decision`:

| Field | Notes |
| --- | --- |
| `Action` | `module.NoOpinion` (`""`), `module.Allow`, `module.Challenge` or `module.Block`. Anything else is ignored with a warning. |
| `Difficulty` | For `Challenge`: 1 to 8. `0` uses the site's level. |
| `Reason` | A short note. Not shown to visitors. |

The request is recorded in the statistics with the rule name `module:<name>`.

**Errors and panics.** When `Check` returns an error or panics, the entry's `on_error` applies: `continue` (the default) treats it as no opinion, `challenge` and `block` act on the request. Return an error when the module could not do its job, such as a lookup that failed; the admin chooses whether that fails open or closed.

**Cancellation.** `ctx` is the request's context. Pass it to anything that can block, so work stops when the visitor disconnects.

```go
func (g *geo) Check(ctx context.Context, r *module.Request) (module.Decision, error) {
	if !r.IP.IsValid() {
		return module.Decision{}, nil
	}
	country, err := g.lookup(ctx, r.IP)
	if err != nil {
		return module.Decision{}, err // on_error decides
	}
	if g.blocked[country] {
		return module.Decision{Action: module.Block, Reason: "country " + country}, nil
	}
	return module.Decision{}, nil
}
```

## Observer

```go
type Observer interface {
	Observe(e Event)
}
```

`Observe` is told what Tamamo did with each request, whoever decided it. Use it to count, log, or feed a module's own view of traffic. It can't change the outcome.

| `Event` field | Notes |
| --- | --- |
| `Time` | When it happened. |
| `Kind` | One of the constants below. |
| `Site`, `Host`, `Path`, `UserAgent` | As in `Request`. |
| `IP` | Text form, or `""` when unknown. |
| `Rule` | What decided: a rule's name, `module:<name>`, `webhook:<name>`, `ratelimit`, `bypass:<name>`, or `""` for the default action. |

| `Kind` | Meaning |
| --- | --- |
| `module.EventAllow` | Let through by a rule, a module, a webhook, a bypass header or the default. |
| `module.EventPass` | Let through because of a valid pass. |
| `module.EventChallenge` | The checking page was served. |
| `module.EventBlock` | Refused. |
| `module.EventSolve` | A proof of work was accepted and a pass issued. |
| `module.EventFail` | A proof of work was rejected. |

`Observe` runs before the request continues, so return at once. For slow work, such as writing to a database or calling an API, push the event to a buffered channel and handle it in a goroutine started by `Start`:

```go
func (a *audit) Observe(e module.Event) {
	select {
	case a.queue <- e:
	default: // full: drop rather than slow visitors down
	}
}
```

Events are delivered whether or not Tamamo's own statistics are switched on.

## RequestModifier and ResponseModifier

```go
type RequestModifier interface {
	ModifyRequest(out *http.Request, r *Request)
}

type ResponseModifier interface {
	ModifyResponse(resp *http.Response, r *Request) error
}
```

These edit traffic Tamamo proxies to your app, after a request was let through.

`ModifyRequest` gets the outgoing request, with Tamamo's own changes already applied (`X-Forwarded-*`, `X-Real-IP`, the pass cookie removed). Typical uses: add a header your app trusts, or strip one it shouldn't see.

```go
func (m *tagger) ModifyRequest(out *http.Request, r *module.Request) {
	out.Header.Set("X-Visitor-Country", m.country(r.IP))
}
```

`ModifyResponse` gets your app's response before it is sent to the visitor. Change headers freely. To change the body, replace `resp.Body` and fix `Content-Length`; remember that bodies can be large, compressed or streamed. Returning an error (or panicking) makes Tamamo answer with its `502` error page instead.

```go
func (m *tagger) ModifyResponse(resp *http.Response, r *module.Request) error {
	resp.Header.Set("X-Protected-By", "tamamo")
	return nil
}
```

::: warning Not in auth mode
With [nginx auth_request](/guides/nginx-auth-request) or [Caddy and Traefik forward auth](/guides/forward-auth), the proxy sends traffic to your app itself and only asks Tamamo for a verdict. Tamamo proxies nothing, so these two hooks are never called there.
:::

## PageExtender

```go
type PageExtender interface {
	ExtendPage(p *PageRequest) PageParts
}
```

`ExtendPage` adds to Tamamo's own pages: the checking page and its success, denied and error states. It is called each time one is rendered, including the preview in the web UI's page designer.

| `PageRequest` | Notes |
| --- | --- |
| `Site`, `Host` | The site the page is for. |
| `State` | `checking`, `success`, `denied` or `error`. |
| `Lang` | The translation shown, or `""` for the page's main language. |
| `Preview` | `true` in the page designer. Skip counting and side effects then. |
| `AssetURL(name)` | The URL of a file from `Info.Static`. |

| `PageParts` | Where it goes |
| --- | --- |
| `Head` | HTML at the end of `<head>`. |
| `Body` | HTML at the end of `<body>`, above the credit line, wrapped in `<div class="tm-module" data-module="<name>">`. |
| `Styles` | Stylesheet URLs, linked after Tamamo's own styles. |
| `Scripts` | Script URLs, loaded with `defer`. |

Ship the module's files in the binary with `embed` and point `Info.Static` at them:

```go
//go:embed static
var files embed.FS

func init() {
	static, _ := fs.Sub(files, "static")
	module.Register(module.Info{
		ID:     "notice",
		Static: static, // static/notice.css -> p.AssetURL("notice.css")
		New:    newNotice,
	})
}

func (n *notice) ExtendPage(p *module.PageRequest) module.PageParts {
	if p.State != "checking" || n.text == "" {
		return module.PageParts{}
	}
	return module.PageParts{
		Body:   `<p class="notice">` + html.EscapeString(n.text) + `</p>`,
		Styles: []string{p.AssetURL("notice.css")},
	}
}
```

Things to know:

- **Escape.** `Head` and `Body` are inserted as HTML, unescaped. Anything that comes from settings or from the request must go through `html.EscapeString`.
- **Unclosed markup is closed.** Tamamo closes elements, comments and `<script>` blocks a snippet leaves open, and drops `<html>`, `<head>` and `<body>` tags, so a snippet can't swallow the rest of the page.
- **The credit line stays.** "Protected by Tamamo" can't be removed or hidden.
- **Static files are public.** Visitors can fetch everything in `Info.Static` at `/.tamamo/modules/<module id>/<file>` while the module is on for their site. Don't put anything private there. HTML and SVG files are served sandboxed; dotfiles are never served.
- **Use `AssetURL`.** The address differs between the live page and the preview. Never hard-code it.

## Handler

```go
type Handler interface {
	http.Handler // ServeHTTP(w http.ResponseWriter, r *http.Request)
}
```

A module that implements `http.Handler` gets its own URLs on the protected site, under `/.tamamo/x/<name>/`. The prefix is removed: a request for `/.tamamo/x/geo/lookup?ip=1.2.3.4` arrives with `r.URL.Path == "/lookup"`. All methods are passed on.

Use it for endpoints the checking page calls from JavaScript, for callbacks from other services, or for a small public API.

```go
func (g *geo) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/country":
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(map[string]string{"country": g.country(r)})
	default:
		http.NotFound(w, r)
	}
}
```

::: danger These requests are unchecked
Requests to `/.tamamo/` never go through the checks, the rules or the proof of work, and they come straight from the internet. Validate every input, limit body sizes with `http.MaxBytesReader`, rate-limit anything expensive, and never expose data a visitor shouldn't see.
:::

A panic answers `500`. The name in the URL is the entry's `name` (`ctx.Name`), not the module's ID, so two entries of one module have separate URLs.

## AdminHandler

```go
type AdminHandler interface {
	ServeAdmin(w http.ResponseWriter, r *http.Request)
}
```

`ServeAdmin` is the module's own admin API, under `/api/x/<name>/` on the admin port. The prefix is removed here too: `/api/x/geo/stats` arrives as `/stats`.

Tamamo has already checked that the caller is a signed-in admin and, for anything but `GET` and `HEAD`, that the request carries the `X-Tamamo-Request` header (protection against cross-site requests). Answer with JSON; on errors, send `{"error": "..."}` with a fitting status, which is what the web UI and the [UI kit](/modules/ui#the-ui-kit) expect.

```go
func (g *geo) ServeAdmin(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/stats":
		json.NewEncoder(w).Encode(g.stats())
	case r.Method == http.MethodPost && r.URL.Path == "/reload":
		if err := g.reload(r.Context()); err != nil {
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	default:
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "not found"})
	}
}
```

It is what a [module page](/modules/ui) talks to, and you can call it from scripts with an admin session. The admin API only runs when Tamamo is started with [`TAMAMO_ENABLE_API`](/reference/environment#tamamo-enable-api).

## Starter and Stopper

```go
type Starter interface {
	Start(ctx context.Context) error
}

type Stopper interface {
	Stop() error
}
```

`Start` runs once, right after `New`, when the entry is switched on for real: at start-up, or when the entry is added or changed. This is where files, network connections and goroutines belong.

- `Start` must return quickly. Put loops in a goroutine.
- `ctx` is cancelled when the instance ends: the entry was switched off, removed or changed, or Tamamo is stopping. Every goroutine should watch it.
- `Stop` is called after `ctx` is cancelled. Wait for your goroutines, flush, and close what you opened.

```go
func (g *geo) Start(ctx context.Context) error {
	dir, err := g.ctx.DataDir() // data/modules/<name>/
	if err != nil {
		return err
	}
	if err := g.load(filepath.Join(dir, "countries.db")); err != nil {
		return err
	}
	g.done = make(chan struct{})
	go func() {
		defer close(g.done)
		t := time.NewTicker(24 * time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if err := g.refresh(ctx, dir); err != nil {
					g.ctx.Logger.Warn("refresh failed", "err", err)
				}
			}
		}
	}()
	return nil
}

func (g *geo) Stop() error {
	<-g.done
	return g.close()
}
```

**When settings change.** Tamamo creates a new instance (`New`, then `Start`) and then stops the old one. For a moment both exist, so two instances of one entry must be able to share the data folder: write files atomically (write a temporary file, then rename).

**When Start fails.** The error is logged and shown on the module's card in the web UI as "Failed to start". The instance stays loaded, so its other hooks are still called: make them safe to run without what `Start` would have set up, or return an error from `Check` so `on_error` applies.

## Related

- [Settings](/modules/settings)
- [Module UI](/modules/ui)
- [HTTP endpoints](/reference/endpoints): where module URLs sit among Tamamo's own.
