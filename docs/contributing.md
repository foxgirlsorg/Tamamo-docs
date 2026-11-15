---
title: Contributing
description: How to report bugs, suggest features, improve the docs and translations, and set up each Tamamo repository for development.
---

# Contributing

Bug reports, docs fixes and translations are as welcome as code.

## Ways to help

- **Report a bug.** Include the output of `tamamo -version`, the relevant lines from `docker compose logs tamamo` with secrets removed, and the steps that trigger the problem. If the bug depends on settings, include `data/tamamo.yaml` with the `password_hash` line removed.
- **Suggest a feature.** Describe the problem before the solution. A short example of how you would use it helps most.
- **Improve the docs.** Fix a step that doesn't work, or explain something that confused you. Send small fixes as their own pull request.
- **Translate.** The web UI and the checking page have English, Russian and Ukrainian texts. You can fix a translation or add a language.
- **Write code.** Fix a bug, add a module, or build a feature you suggested first.

## Repositories

| Repository | Contents |
|---|---|
| [`tamamo`](https://github.com/foxgirlsorg/Tamamo) | The Go backend. It handles all visitor traffic and the admin API. |
| [`tamamo_webui`](https://github.com/foxgirlsorg/Tamamo-webui) | The optional admin web UI, in React and TypeScript. It never serves visitors. |
| [`docs`](https://github.com/foxgirlsorg/Tamamo-docs) | This documentation site, built with VitePress. |

The backend works alone. A change to a setting often touches both the backend and the web UI, because the web UI calls the admin API.

## Backend

You need Go 1.25 or newer, as set by the `go` line in `go.mod`. Run these commands in the [tamamo repository](https://github.com/foxgirlsorg/Tamamo).

```bash
cd tamamo
go test ./...
go vet ./...
TAMAMO_TARGET=http://localhost:3000 TAMAMO_ENABLE_API=true go run ./cmd/tamamo -data ./data
```

Both checks print nothing when they pass. `TAMAMO_TARGET` sets the upstream and `TAMAMO_ENABLE_API` turns on the admin API; see [environment variables](/reference/environment).

Tests sit next to the code in `*_test.go` files. Add a test for every bug you fix.

## Web UI

You need Node 22, as pinned in `.nvmrc`. Start the backend first, with `TAMAMO_ENABLE_API=true`. Run these commands in the [tamamo_webui repository](https://github.com/foxgirlsorg/Tamamo-webui).

```bash
cd tamamo_webui
npm ci
npm run dev
```

Open the address Vite prints, usually `http://localhost:5173`. Press `Ctrl+C` in the terminal to stop the dev server. Vite forwards `/api` and `/assets` to the backend on port 8081. Before you open a pull request, run `npm run build` and `npm run lint`. The build runs `tsc -b` first, so a type error fails it.

These rules apply to all web UI code:

- Add shadcn/ui components only with the CLI, for example `npx shadcn@latest add select`. Do not edit `src/components/ui/` by hand.
- Use the dark theme only. Do not add a theme switch.
- Use the shadcn `Select`, `DropdownMenu` or `Combobox` for dropdowns, never a native `<select>`.
- Put every visible text in `src/locales/en.json`, `ru.json` and `uk.json`, with i18next plural suffixes (`_one`, `_few`, `_many`, `_other`).
- Load and save data with React Query. Build forms with react-hook-form and zod.

## Docs

You need Node 22, as pinned in `.nvmrc`. Run these commands in the [docs repository](https://github.com/foxgirlsorg/Tamamo-docs):

```bash
npm ci
npm run dev
npm run build
```

Press `Ctrl+C` in the terminal to stop `npm run dev`.

`npm run build` fails on dead links, so check each link you add. The paths below are from the root of the docs repository. Add a new page to the sidebar in `docs/.vitepress/config.mts`, and put screenshots in `docs/public/img/ui/`.

## Build the Docker images

Run these commands in the [tamamo](https://github.com/foxgirlsorg/Tamamo) and [tamamo_webui](https://github.com/foxgirlsorg/Tamamo-webui) repositories.

```bash
cd tamamo
docker build -t tamamo/tamamo .

cd ../tamamo_webui
docker build -t tamamo/tamamo-webui .
```

To run your local images, use [installation](/guide/installation) and change the `image:` lines in its compose file to these tags.

## Before you open a pull request

- The tests pass: `go test ./...` for the backend, and `npm run build` and `npm run lint` for the web UI.
- Every new text is in English, Russian and Ukrainian. If you can't translate one, say so in the pull request.
- The docs match the behavior. A change to a setting, flag or endpoint needs a docs change in the same pull request.
- The pull request covers one topic. Send a bug fix and a refactor as two pull requests.

## Report a security problem

Do not open a public issue for a security problem. A public issue shows attackers the bug before a fix exists. On GitHub, open the repository's Security tab and press "Report a vulnerability". Include the problem, the version you run, and the steps to reproduce it.

## License

Tamamo is released under the MIT License. The full text is in `LICENSE` in the `tamamo` repository.

## Related

- [Command-line flags](/reference/cli)
- [Environment variables](/reference/environment)
