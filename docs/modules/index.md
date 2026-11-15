---
title: Writing modules
description: What a Tamamo module is, what it can do, and the shortest working one. Modules are ordinary Go modules compiled into the tamamo binary.
---

# Writing modules

A Tamamo module is an ordinary Go module: its own repository, its own `go.mod`. It imports Tamamo's SDK package, registers itself from an `init` function and is compiled into the `tamamo` binary. Nothing is loaded at run time, so a module is as fast as Tamamo's own code and ships inside the same single file.

This section is for people who write modules. To switch on a module you already have, see [Modules](/config/modules).

The word "module" means three things on these pages. A **Tamamo module** is the extension you write, which these pages are about. A **Go module** is a folder with a `go.mod` file, which is how Go groups code; your Tamamo module is one. A **module instance** is one entry under `modules:` in `tamamo.yaml`. You can switch the same Tamamo module on twice under two names, and each entry is one instance.

## What a module can do

| A module can | With | Read more |
| --- | --- | --- |
| Decide about requests before the rules | `Checker` | [Hooks](/modules/hooks#checker) |
| See what Tamamo did with every request | `Observer` | [Hooks](/modules/hooks#observer) |
| Edit requests on their way to your app, and its responses | `RequestModifier`, `ResponseModifier` | [Hooks](/modules/hooks#requestmodifier-and-responsemodifier) |
| Add HTML, CSS and JavaScript to the checking page | `PageExtender` | [Hooks](/modules/hooks#pageextender) |
| Serve its own URLs on the protected site | `Handler` | [Hooks](/modules/hooks#handler) |
| Offer its own admin API | `AdminHandler` | [Hooks](/modules/hooks#adminhandler) |
| Run background work and keep files | `Starter`, `Stopper` | [Hooks](/modules/hooks#starter-and-stopper) |
| Have settings, shown as a form in the web UI | `Info.Settings` | [Settings](/modules/settings) |
| Add its own pages to the web UI | `Info.Pages`, `Info.UI` | [Module UI](/modules/ui) |

A module picks any combination. Each of these is a small Go interface; Tamamo looks at which ones your type implements.

## The smallest module

```go [hello.go]
package hello

import (
	"context"
	"strings"

	"github.com/foxgirlsorg/tamamo/module"
)

func init() {
	module.Register(module.Info{
		ID:          "block-wp-admin",
		Name:        "Block /wp-admin",
		Description: "Refuses WordPress probes on sites that aren't WordPress.",
		New: func(ctx *module.Context) (module.Module, error) {
			return blocker{}, nil
		},
	})
}

type blocker struct{}

func (blocker) Check(_ context.Context, r *module.Request) (module.Decision, error) {
	if strings.HasPrefix(r.Path, "/wp-admin") {
		return module.Decision{Action: module.Block, Reason: "not WordPress"}, nil
	}
	return module.Decision{}, nil // no opinion: the rules decide
}
```

Build a Tamamo that contains it and switch it on:

```bash
tamamo-build --with github.com/you/tamamo-block-wp-admin
```

While you develop the module in its own folder, build from that folder instead. The `=.` form uses the copy in the current folder:

```bash
tamamo-build --with github.com/you/tamamo-block-wp-admin=.
```

```yaml [data/tamamo.yaml]
modules:
  - name: block-wp-admin
    enabled: true
```

That is the whole life cycle: **register**, **build in**, **switch on**.

## How it fits together

```text
  your module (a Go module)            Tamamo
  -------------------------            ------------------------------------
  func init() {                        compiled together by tamamo-build
      module.Register(Info{...})  ---> registry of modules in this build
  }
                                       tamamo.yaml: modules: [{name, settings}]
  Info.New(ctx) -> your value    <---  one instance per enabled entry
  Check / Observe / ServeHTTP... <---  called for the sites it is switched on for
  Start(ctx) ... Stop()          <---  when the entry is added, changed, removed
```

- **One registration, many instances.** `Register` describes the module once. Every enabled entry in `tamamo.yaml` gets its own value from `New`, with its own settings. Keep state in that value, not in package variables.
- **Config changes are live.** When an entry changes, Tamamo creates a new instance and stops the old one. Unchanged entries keep their instance, and whatever it holds in memory.
- **Sites are handled for you.** Hooks are only called for the sites the entry lists. An empty `sites` list means all sites. A module never has to check `sites` itself.
- **Failures are contained.** A panic in a hook is caught and logged. For `Check`, the entry's `on_error` decides what happens to the request.

## Next steps

1. [Write a module](/modules/write): a step-by-step tutorial, from an empty folder to a module with settings, tests and a release.
2. [Build Tamamo with modules](/modules/build): `tamamo-build`, Docker, or your own `main.go`.
3. [Hooks](/modules/hooks), [Settings](/modules/settings) and [Module UI](/modules/ui): the reference.

The repository has a complete example that uses every part of the SDK: [`examples/hello`](https://github.com/foxgirlsorg/Tamamo/tree/main/examples/hello).

## Compatibility

The SDK is the package `github.com/foxgirlsorg/tamamo/module`. Everything else in the repository is internal and can change at any time.

While Tamamo is at version 0, a minor release (0.2 to 0.3) may change the SDK. Your module's `go.mod` pins the Tamamo version it was written for, and `go build` tells you when a newer Tamamo no longer fits. Changes are listed in the release notes.

## Related

- [Modules](/config/modules): the admin's view, with every `tamamo.yaml` key.
- [Webhooks](/config/webhooks): decide about requests from any language, without building anything.
