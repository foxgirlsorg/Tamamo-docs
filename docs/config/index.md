---
title: How settings work
description: Where Tamamo's settings live, how the web UI and the settings file relate, how saving and reloading work, and which fields are locked.
---

# How settings work

Tamamo keeps all of its settings in one file, `data/tamamo.yaml`. The `data` folder sits next to your compose file. Inside the container it is `/data`. You can edit that file by hand, or use the optional web UI, which edits the same file. Tamamo rewrites `tamamo.yaml` only when you save in the web UI. Your hand edits are otherwise left alone.

Settings you leave out keep their defaults. The smallest working file sends visitors to your site:

```yaml
server:
  target: http://app:80
```

## The web UI

The web UI is a settings editor. It never serves visitors. It needs the admin API, which runs only when the backend has `TAMAMO_ENABLE_API=true`. Login and access are covered in [Web UI, login and statistics](/config/admin).

The sidebar has three groups:

- **Monitor** (Overview, Sites, Activity) shows statistics, recent events, and your sites.
- **Configure** (Protection, Rules, Modules, Checking page, Server) changes how Tamamo checks visitors.
- **Admin** (Security, Settings, About) holds the admin login, the interface language, and version information.

## Saving changes

The configuration screens edit a draft copy of your settings. Your changes stay in the draft as you move between screens. Visitors see nothing until you save.

When the draft differs from the saved settings, a bar at the bottom of the screen shows **Unsaved changes**.

- **Save changes** writes the whole configuration to `tamamo.yaml`. Tamamo applies it right away.
- **Discard** undoes every change since the last save, after you confirm.

A save rewrites the whole file in Tamamo's format and regenerates every comment, so comments you added by hand are lost. Tamamo never rewrites a file you edited by hand. If you keep your own comments, edit the file yourself.

## Edit by hand

Tamamo checks the file about every 2 seconds and applies your edits without a restart. Two changes need a restart: the listen addresses (`server.listen` and `admin.listen`) and turning the admin API on or off with `TAMAMO_ENABLE_API`.

If an edit is wrong:

- **Unknown key:** Tamamo names the line and suggests the closest key, such as `(did you mean "listen"?)`.
- **Broken edit while running:** Tamamo logs `could not reload the settings; keeping the running ones` and keeps the previous settings until the file is valid again.
- **Broken file at startup:** Tamamo logs the error and does not start.

Values outside their allowed range move to the nearest allowed value. For example, `difficulty: 12` becomes `8`.

Check the file before you restart. In Docker, run this in the container:

```bash
docker compose exec tamamo tamamo -check
```

It prints `/data/tamamo.yaml is valid`, or the first error with its line number. Outside Docker, run `tamamo -check` instead.

## Locked fields

Some settings can also come from environment variables. A variable always wins over the file. The one exception is `TAMAMO_DIFFICULTY`, which applies only when Tamamo creates the file for the first time. In the web UI, that field is read-only and shows a badge such as **Set by TAMAMO_TARGET**. To change it, change the variable in your compose file or container environment, then restart the container. The variables are listed on [environment variables](/reference/environment).

::: warning
The shipped [docker-compose.yml](/compose/docker-compose.yml) sets `TAMAMO_TARGET: http://app:80`. While that line is there, `server.target` in the file is ignored. Remove the line to set the upstream in `tamamo.yaml`.
:::

## Global settings and sites

The Protection, Rules, and Checking page screens have an **Editing** picker. It switches between **Global settings (default site)** and each site. A site without its own copy follows the global settings. **Customize for this site** gives a site its own copy, and **Use global settings** drops that copy when you save. See [Sites](/config/sites).

## Find a setting

| Screen | Writes to `tamamo.yaml` | Page |
| --- | --- | --- |
| Server | `server`, `stats`, `admin.listen`, `admin.domains` | [Server](/config/server) |
| Protection | `protection` | [Protection](/config/protection) |
| Rules | `rules` | [Rules](/config/rules) |
| Sites | `sites` | [Sites](/config/sites) |
| Bypass headers, rate limit, webhooks | `protection` | [Protection](/config/protection#checks-before-the-rules), [Webhooks](/config/webhooks) |
| Modules | `modules` | [Modules](/config/modules) |
| Checking page | `page` | [Checking page](/config/checking-page) |
| Security | `admin.username`, `admin.session_hours`, `admin.password_hash` | [Web UI, login and statistics](/config/admin) |
| Overview, Activity | Nothing. They read statistics from `tamamo.db`. | [Web UI, login and statistics](/config/admin) |
| Settings, About | Nothing. The language is stored in your browser. | [Web UI, login and statistics](/config/admin) |

The full example file is on [a complete example](/config/full-example).
