# Tamamo docs

Documentation for Tamamo, built with [VitePress](https://vitepress.dev/).

## Work on the docs

```bash
npm ci
npm run dev
```

This opens <http://localhost:5173>. Pages reload as you edit them.

## Where things are

| Path | What |
| --- | --- |
| `docs/guide/` | Getting started: what Tamamo is, quick start, the compose files |
| `docs/webui/` | Using the web UI, screen by screen |
| `docs/config/` | `tamamo.yaml`, section by section |
| `docs/guides/` | How-to guides (reverse proxy, Cloudflare, backups, ...) |
| `docs/reference/` | Environment variables, CLI flags, files, endpoints, troubleshooting |
| `docs/public/compose/` | The two compose files, served as downloads |
| `docs/public/img/ui/` | Web UI screenshots |
| `docs/.vitepress/config.mts` | Site title, navigation and sidebar |
| `docs/.vitepress/theme/custom.css` | Colors (dark only, accent `#de6161`) |

A new page must be added to the sidebar in `config.mts`.

## Check before you push

```bash
npm run build
```

The build fails on dead links.

## Deploying

GitHub Actions handles it:

- **CI** (`.github/workflows/ci.yml`) builds every pull request and every branch except `main`.
- **Deploy** (`.github/workflows/deploy.yml`) builds `main` and publishes it to GitHub Pages.

One-time setup: in the repository go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. The base path comes from the Pages settings, so the same build works on `<owner>.github.io/<repo>/` and on a custom domain.

To build for a sub-path yourself:

```bash
DOCS_BASE=/tamamo-docs/ npm run build
```
