---
title: Installation
description: Run Tamamo with Docker and the web UI, with Docker alone, or from source with Go and systemd.
---

# Installation

Run Tamamo with Docker, with or without the web UI, or build it from source. In each case you point Tamamo at your website, the *upstream*.

## Docker with the web UI

The web UI runs as a second container and talks to Tamamo's admin API.

1. Download [docker-compose.webui.yml](/compose/docker-compose.webui.yml) into a new folder. It defines three services:

   ```yaml
   services:
     tamamo:
       image: tamamo/tamamo:latest
       restart: unless-stopped
       ports:
         - "8923:8923"              # visitors connect here
       environment:
         TAMAMO_TARGET: http://app:80   # your website
         TAMAMO_ENABLE_API: "true"      # lets the web UI change settings
         TAMAMO_ADMIN_TRUSTED_PROXIES: private   # sign-in lockout per visitor, not per container
       volumes:
         - ./data:/data             # settings live in data/tamamo.yaml

     webui:
       image: tamamo/tamamo-webui:latest
       restart: unless-stopped
       ports:
         - "8081:8081"              # admin web UI
       depends_on:
         - tamamo

     # Example website. Replace it with your own.
     app:
       image: traefik/whoami:latest
       restart: unless-stopped
   ```

2. Create the data folder. Tamamo keeps its settings, signing key and statistics there.

   ```bash
   mkdir data
   ```

   On Linux, give the folder to the user that runs inside the container:

   ```bash
   sudo chown 65532:65532 data
   ```

3. In `docker-compose.webui.yml`, set `TAMAMO_TARGET` under the `tamamo` service to your website's address as the container sees it. Inside a container, `localhost` is the container itself, so use a LAN address or a service name.

   ```yaml [docker-compose.webui.yml]
   services:
     tamamo:
       environment:
         TAMAMO_TARGET: http://192.168.1.20:3000
   ```

   Remove the `app` service once `TAMAMO_TARGET` points at your site.

4. Start the containers.

   ```bash
   docker compose -f docker-compose.webui.yml up -d
   ```

5. Open the web UI at `http://localhost:8081` and create the admin login. The username must be 3 to 64 characters, and the password at least 8.

   ![The setup screen, where you create the admin login](/img/ui/setup.webp)

   ::: warning
   The first person to open the web UI creates the login. Open it right after starting Tamamo, and don't leave the page open on a server that others can reach.
   :::

Visitors connect on port `8923`. A public site needs HTTPS, so put a proxy such as nginx, Caddy or Traefik in front of Tamamo. See [Behind a reverse proxy](/guides/reverse-proxy).

## Docker without the web UI

Use [docker-compose.yml](/compose/docker-compose.yml) when you want to configure Tamamo only through `tamamo.yaml`. It is the same file without the `webui` service and `TAMAMO_ENABLE_API`.

1. Download the file into a new folder, then create the `data` folder and set `TAMAMO_TARGET` as in the steps above.

2. Start the container.

   ```bash
   docker compose up -d
   ```

   On the first start, Tamamo writes `data/tamamo.yaml` with every setting and a comment on each one.

3. Edit `data/tamamo.yaml`. Changes apply within a few seconds. To check the file for errors, run:

   ```bash
   docker compose exec tamamo tamamo -check
   ```

   It prints `/data/tamamo.yaml is valid`, or the first error with its line number.

## How the web UI reaches the backend

The `webui` container forwards `/api/` and the image and script paths under `/assets/` to the admin API at the address in its `TAMAMO_API` variable, which defaults to `http://tamamo:8081`. `tamamo` is the service name, and Docker resolves it on every request, so recreating the backend needs no change to the web UI. The admin API is never published to your host; only the web UI container reaches it over the compose network. Set `TAMAMO_API` only if you rename the `tamamo` service.

## Switching between the two files

Both files use the same `./data` folder, so your settings carry over. Keep them side by side in one folder.

To remove the web UI, run the plain file with `--remove-orphans`, which stops the `webui` container:

```bash
docker compose -f docker-compose.yml up -d --remove-orphans
```

The admin API is then off, so edit `data/tamamo.yaml` from that point on.

To bring the web UI back, run the web UI file and sign in with your existing login:

```bash
docker compose -f docker-compose.webui.yml up -d --remove-orphans
```

## From source

This builds the Tamamo program and runs it without containers. You need Go 1.25 or newer and Git.

1. Build the program.

   ```bash
   git clone https://github.com/foxgirlsorg/Tamamo tamamo
   cd tamamo
   go build -o tamamo ./cmd/tamamo
   ```

2. Run it with a data folder and your upstream. Stop it with `Ctrl+C`.

   ```bash
   TAMAMO_TARGET=http://localhost:3000 ./tamamo -data ./data
   ```

To run Tamamo as a service, create a system user, install the binary and add a unit file:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin tamamo
sudo install -m 755 tamamo /usr/local/bin/tamamo
```

`/etc/systemd/system/tamamo.service`:

```ini
[Unit]
Description=Tamamo
After=network-online.target
Wants=network-online.target

[Service]
User=tamamo
Group=tamamo
StateDirectory=tamamo
ExecStart=/usr/local/bin/tamamo -data /var/lib/tamamo
Environment=TAMAMO_TARGET=http://127.0.0.1:3000
Environment=TAMAMO_ENABLE_API=true
Environment=TAMAMO_ADMIN_LISTEN=127.0.0.1:8081
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

`TAMAMO_ADMIN_LISTEN` keeps the admin API on the server itself. Leave out `TAMAMO_ENABLE_API` if you don't use the web UI.

Start the service, then create the login. The `-set-login` command reads the password from standard input.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tamamo
sudo -u tamamo /usr/local/bin/tamamo -data /var/lib/tamamo -set-login admin
```

The command asks `new admin password:` and then prints `admin login saved for admin`.

To serve the web UI, build the `tamamo_webui` project with Node.js 22 (`npm ci`, then `npm run build`) and serve its `dist/` folder with nginx. Use `nginx/default.conf.template` from that repository as the base for your nginx config, with `TAMAMO_API` set to `http://127.0.0.1:8081`.

::: info
Anyone who can reach the admin API can change Tamamo's settings. Keep it on `127.0.0.1`, or restrict it with a firewall.
:::

## Next steps

- [Configuration](/config/) explains how settings work, whether you use the web UI or `tamamo.yaml`.
- [Server](/config/server) sets the upstream, the listen address and how Tamamo finds the visitor's IP address.
