---
title: Write a module
description: A step-by-step tutorial. Create a Go module, register it, add settings, check requests, test it, run it locally and publish it.
---

# Write a module

This tutorial builds a module called `maintenance`. It refuses every request with a "back soon" decision while a switch is on, except for paths you list. Along the way it covers everything most modules need: registration, settings, a check, tests, local development and publishing.

You need [Go](https://go.dev/dl/) 1.25 or newer and some Go experience. The commands on this page are for bash.

## 1. Create the Go module

A Tamamo module is a normal Go module in its own folder or repository.

```bash
mkdir tamamo-maintenance && cd tamamo-maintenance
go mod init github.com/you/tamamo-maintenance
go get github.com/foxgirlsorg/tamamo@latest
```

The only package a module imports from Tamamo is the SDK, `github.com/foxgirlsorg/tamamo/module`.

## 2. Register it

A module introduces itself with `module.Register`, called from `init`. `Info` describes it; `New` creates one instance.

```go [maintenance.go]
// Package maintenance is a Tamamo module that closes a site for maintenance.
package maintenance

import (
	"github.com/foxgirlsorg/tamamo/module"
)

func init() {
	module.Register(module.Info{
		ID:          "maintenance",
		Name:        "Maintenance mode",
		Description: "Refuses visitors while the site is being worked on.",
		Version:     "0.1.0",
		Author:      "You",
		Homepage:    "https://github.com/you/tamamo-maintenance",
		New:         newMaintenance,
	})
}

type maintenance struct{}

func newMaintenance(ctx *module.Context) (module.Module, error) {
	return &maintenance{}, nil
}
```

| `Info` field | What it is |
| --- | --- |
| `ID` | The name used in `tamamo.yaml`: `a-z`, `0-9` and dashes. Pick something specific; two modules with the same ID can't be in one build. |
| `Name`, `Description` | Shown in the web UI and by `tamamo -modules`. |
| `Version`, `Author`, `Homepage` | Shown next to the name. Optional. |
| `New` | Creates an instance. Required. |
| `Settings`, `Pages`, `UI`, `Static` | Covered below and in [Settings](/modules/settings) and [Module UI](/modules/ui). |

`Register` panics when `Info` is wrong (a bad ID, no `New`, a setting with an unknown type). That is on purpose: the mistake shows up the first time you start the binary, not later in production.

## 3. Add settings

Declare the settings in `Info.Settings`. The web UI builds the form from the list, and Tamamo checks saved values against it before `New` runs.

```go [maintenance.go]
		Settings: []module.Field{
			{
				Name: "active", Label: "Site is closed", Type: module.Bool, Default: "false",
				Description: "While on, visitors are refused.",
			},
			{
				Name: "open_paths", Label: "Paths that stay open", Type: module.List,
				Description: "Requests whose path starts with one of these are not refused.",
				Placeholder: "/status",
			},
			{
				Name: "action", Label: "Refuse with", Type: module.Select, Default: module.Block,
				Options: []module.Option{
					{Value: module.Block, Label: "The denied page"},
					{Value: module.Challenge, Label: "The checking page"},
				},
			},
		},
```

Read them in `New`, through `ctx.Settings`. Values are stored as text; the helper methods convert them. This replaces the `maintenance` type and `newMaintenance` from step 2.

```go [maintenance.go]
type maintenance struct {
	active bool
	open   []string
	action string
}

func newMaintenance(ctx *module.Context) (module.Module, error) {
	m := &maintenance{
		active: ctx.Settings.Bool("active"),
		open:   ctx.Settings.List("open_paths"),
		action: ctx.Settings.String("action"),
	}
	for _, p := range m.open {
		if !strings.HasPrefix(p, "/") {
			return nil, fmt.Errorf("open path %q must start with /", p)
		}
	}
	return m, nil
}
```

Add `fmt` and `strings` to the imports.

::: warning Keep New cheap
`New` also runs every time someone saves the settings, just to check them: the instance is then thrown away. So `New` must only read settings and return a value or an error. Opening files, calling the network and starting goroutines belong in [`Start`](/modules/hooks#starter-and-stopper).
:::

An error from `New` is shown to the admin when they save, and the previous settings stay in use. Write it for them: name the setting and say what is wrong.

## 4. Check requests

To decide about requests, implement `Checker`. Tamamo calls `Check` for every request to a site the module is switched on for, before the rules. Add `context` to the imports of `maintenance.go` for this step.

```go [maintenance.go]
func (m *maintenance) Check(_ context.Context, r *module.Request) (module.Decision, error) {
	if !m.active {
		return module.Decision{}, nil
	}
	for _, p := range m.open {
		if strings.HasPrefix(r.Path, p) {
			return module.Decision{}, nil
		}
	}
	return module.Decision{Action: m.action, Reason: "maintenance"}, nil
}
```

The answer is a `Decision`:

| `Action` | Meaning |
| --- | --- |
| `module.NoOpinion` (the empty string) | Not this module's business. The next module, then the rules, decide. Return this for most requests. |
| `module.Allow` | Let it through. Skips everything after this module, rules included. |
| `module.Challenge` | Show the checking page, unless the visitor has a valid pass. `Difficulty` (1 to 8) overrides the site's level. |
| `module.Block` | Refuse it. |

`Check` runs on every request, concurrently. Keep it fast, and guard anything it changes with a mutex or use atomics. See [Hooks](/modules/hooks#checker) for what `Request` contains.

## 5. Test it

A module is tested like any Go code: look it up, create an instance with settings, and call its methods.

```go [maintenance_test.go]
package maintenance

import (
	"context"
	"testing"

	"github.com/foxgirlsorg/tamamo/module"
)

func create(t *testing.T, settings module.Settings) module.Checker {
	t.Helper()
	info, _ := module.Lookup("maintenance")
	m, err := info.Create(module.NewContext("maintenance", settings, nil, t.TempDir()))
	if err != nil {
		t.Fatal(err)
	}
	return m.(module.Checker)
}

func TestClosed(t *testing.T) {
	m := create(t, module.Settings{"active": "true", "open_paths": "/status"})
	d, _ := m.Check(context.Background(), &module.Request{Path: "/shop"})
	if d.Action != module.Block {
		t.Errorf("a closed site should refuse /shop, got %q", d.Action)
	}
	d, _ = m.Check(context.Background(), &module.Request{Path: "/status/live"})
	if d.Action != module.NoOpinion {
		t.Errorf("/status should stay open, got %q", d.Action)
	}
}

func TestBadSettings(t *testing.T) {
	info, _ := module.Lookup("maintenance")
	_, err := info.Create(module.NewContext("maintenance", module.Settings{"open_paths": "status"}, nil, ""))
	if err == nil {
		t.Error("a path without a leading slash was accepted")
	}
}
```

`Info.Create` does what Tamamo does: it checks the settings against your `Settings` list, fills in the defaults and calls `New`.

```bash
go test ./...
```

## 6. Run it in Tamamo

Build a Tamamo with the module from your folder, using the `=folder` form:

```bash
go install github.com/foxgirlsorg/tamamo/cmd/tamamo-build@latest
tamamo-build --with github.com/you/tamamo-maintenance=. -o ./tamamo
./tamamo -modules
```

The output should begin like this. The list of Go modules in the build follows it and is left out here:

```text
maintenance 0.1.0  (Maintenance mode)
    Refuses visitors while the site is being worked on.
    - active (bool, default false) While on, visitors are refused.
    - open_paths (list) Requests whose path starts with one of these are not refused.
    - action (select, default block)
```

Start it with the admin API on, in front of anything that answers HTTP:

```bash
TAMAMO_ENABLE_API=true TAMAMO_TARGET=http://localhost:3000 ./tamamo -data ./dev-data
```

Then switch the module on in `dev-data/tamamo.yaml`:

```yaml [dev-data/tamamo.yaml]
modules:
  - name: maintenance
    enabled: true
    settings:
      active: "true"
      open_paths: /status
```

The log shows the module starting, and what it hooks into:

```text
level=INFO msg="module started" module=maintenance id=maintenance hooks=check
```

`curl -i localhost:8923/shop` now answers `403`. Edit the file and save: the change applies within a few seconds, no restart. After changing the module's *code*, run `tamamo-build` again and restart.

To see the settings form, run the [web UI](/guide/installation) against this Tamamo and open **Configure > Modules**.

## 7. Go further

The module so far decides about requests. The same value can do more by implementing more interfaces:

- Show a notice on the checking page: [`PageExtender`](/modules/hooks#pageextender).
- Count what happens: [`Observer`](/modules/hooks#observer).
- Keep data between restarts or refresh a list on a timer: [`Starter` and `Stopper`](/modules/hooks#starter-and-stopper).
- Give admins a screen with a button: [Module UI](/modules/ui).

[`examples/hello`](https://github.com/foxgirlsorg/Tamamo/tree/main/examples/hello) does all of these in about 300 lines.

## 8. Publish it

A module is published like any Go module: push the repository and tag a version. Before you publish, the folder must be a git repository, and it must be pushed to the host in the import path (here `github.com`).

```bash
git tag v0.1.0
git push origin main v0.1.0
```

Anyone can then build it in:

```bash
tamamo-build --with github.com/you/tamamo-maintenance@v0.1.0
```

In the README, say which module ID to use, list the settings, and name the Tamamo version it was built against. A copy-and-paste `modules:` entry helps most.

## Checklist

- The ID is specific and stable. Renaming it later breaks every `tamamo.yaml` that uses it.
- `New` only reads settings. No I/O, no goroutines.
- Every setting has a `Description`, and errors name the setting.
- `Check` returns `NoOpinion` for requests it doesn't care about, and is safe to call concurrently.
- State lives in the instance, not in package variables, so the module can be switched on twice.
- Anything inserted into a page from settings is escaped with `html.EscapeString`.
- Public handlers treat every request as hostile.

## Related

- [Hooks](/modules/hooks): every interface, with what it receives and when it runs.
- [Settings](/modules/settings): field types and the helper methods.
- [Build Tamamo with modules](/modules/build)
