---
title: Build Tamamo with modules
description: "Three ways to get a tamamo binary that contains modules: the tamamo-build tool, a Docker build argument, or a main.go of your own."
---

# Build Tamamo with modules

Modules are compiled into the `tamamo` binary. Go has no dependable way to load code into a static binary at run time, so "installing" a module means building a Tamamo that includes it. This takes one command.

You need [Go](https://go.dev/dl/) 1.25 or newer for the `tamamo-build` and `main.go` routes, and Docker for the Docker route.

Pick whichever fits how you deploy:

| You deploy | Use |
| --- | --- |
| A Docker image | [The Docker build argument](#with-docker) |
| A binary | [`tamamo-build`](#with-tamamo-build) |
| Either, and you want the build in your own repository | [Your own `main.go`](#with-your-own-main-go) |

All three produce the same thing.

## With Docker

The Tamamo `Dockerfile` takes a `MODULES` build argument: Go module paths, separated by spaces.

```bash
git clone https://github.com/foxgirlsorg/Tamamo tamamo
cd tamamo
docker build --build-arg MODULES="github.com/you/tamamo-geo github.com/you/tamamo-audit@v1.2.0" -t tamamo-custom .
```

Then use the image in `docker-compose.yml`:

```yaml [docker-compose.yml]
services:
  tamamo:
    image: tamamo-custom   # instead of tamamo/tamamo
```

Or let Compose build it:

```yaml [docker-compose.yml]
services:
  tamamo:
    build:
      context: ./tamamo
      args:
        MODULES: github.com/you/tamamo-geo github.com/you/tamamo-audit@v1.2.0
```

To build in a module from a folder instead of the network, put the folder inside the build context and write `path=./folder`:

```bash
docker build --build-arg MODULES="github.com/you/tamamo-geo=./modules/geo" -t tamamo-custom .
```

The example module ships in the repository, so this works out of the box:

```bash
docker build --build-arg MODULES="github.com/foxgirlsorg/tamamo/examples/hello=./examples/hello" -t tamamo-hello .
```

## With tamamo-build

`tamamo-build` is a small program that writes a three-line `main.go`, runs `go build` and hands you the binary. It needs [Go](https://go.dev/dl/) 1.25 or newer.

```bash
go install github.com/foxgirlsorg/tamamo/cmd/tamamo-build@latest
tamamo-build --with github.com/you/tamamo-geo
```

`go install` puts `tamamo-build` in `$(go env GOPATH)/bin`. That folder must be on your PATH for the command to run.

The result is `./tamamo` (`tamamo.exe` on Windows), a static binary like the official ones.

| Flag | What it does |
| --- | --- |
| `--with <module>` | A module to compile in. Repeat it for more. See the forms below. |
| `-o <file>` | Where to write the binary. Default: `tamamo` in the current folder. |
| `--tamamo <version or folder>` | The Tamamo to build: a version such as `v0.2.0`, a commit, or a folder with Tamamo's source. Default: the latest release. |
| `--keep` | Keep the temporary build folder and print its path, to look at the generated `main.go` and `go.mod`. |

A `--with` value is a Go module path, optionally with a version or a local folder:

| Form | Meaning |
| --- | --- |
| `github.com/you/tamamo-geo` | The latest version. |
| `github.com/you/tamamo-geo@v1.2.0` | That version. A branch or commit works too. |
| `github.com/you/tamamo-geo=../tamamo-geo` | The copy in that folder. Use this while developing a module. |

To build for another system, set Go's usual variables:

```bash
GOOS=linux GOARCH=arm64 tamamo-build --with github.com/you/tamamo-geo -o tamamo-arm64
```

## With your own main.go

`tamamo-build` only automates this. The whole program is:

```go [main.go]
package main

import (
	"github.com/foxgirlsorg/tamamo/app"

	_ "github.com/you/tamamo-geo"
	_ "github.com/you/tamamo-audit"
)

func main() { app.Main() }
```

`app.Main()` runs Tamamo with the command-line flags of the program (such as `-data` or `-modules`) and exits when it is done.

```bash
go mod init example.com/my-tamamo
go mod tidy
CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o tamamo .
```

Keep these two files in a repository of your own and you have a reproducible build: `go.mod` and `go.sum` pin the exact version of Tamamo and of every module, and upgrading any of them is `go get <path>@<version>`.

## Check the result

```bash
./tamamo -modules
```

```text
geo 1.2.0  (Country filter)
    Blocks or challenges visitors by country.
    - countries (list, required) Two-letter country codes.
    - action (select, default block) What happens to a match.

Go modules linked into this binary:
    github.com/foxgirlsorg/tamamo v0.2.0
    github.com/you/tamamo-geo v1.2.0
    ...
```

In the web UI, **Configure > Modules** lists the same modules under **In this build**. A module in the build does nothing until an entry in `tamamo.yaml` [switches it on](/config/modules#switch-a-module-on).

## Upgrade

A new Tamamo release means building again, with the same command. Modules are compiled against the Tamamo version you build, so a module written for an older SDK may stop compiling. The build then fails with a Go error that names the module: update the module, or keep `--tamamo` on the older version until it is updated.

Your `tamamo.yaml` and data folder are not affected by rebuilding. See [Back up and upgrade](/guides/backup-and-upgrade).

## Common problems

- **`go: github.com/you/x@latest: ... not found`.** The repository is private or has no such version. For a private repository, set `GOPRIVATE=github.com/you/*` and make sure `git` can clone it, or use the `=folder` form.
- **`module declares its path as: ...`.** The path after `--with` must be exactly the `module` line of the module's `go.mod`.
- **The build works but `-modules` doesn't list the module.** The package you named doesn't call `module.Register` in an `init` function. A module in a sub-folder must be named by that folder's path.
- **`panic: module.Register: module "x" is registered twice` at start.** Two modules use the same ID. One of them has to be renamed by its author.

## Related

- [Modules](/config/modules): switching a module on once it is in the build.
- [Write a module](/modules/write)
- [Command-line flags](/reference/cli#modules)
