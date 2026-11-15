---
title: Put Tamamo behind a reverse proxy
description: "Tested nginx, Caddy and Traefik configs for running Tamamo behind a reverse proxy, with HTTPS, the real visitor IP and an admin subdomain."
---

# Put Tamamo behind a reverse proxy

Tamamo doesn't handle HTTPS certificates. For a public site, put the web server you already run in front of it: nginx, Caddy or Traefik. That server is the *reverse proxy*. It accepts visitors on port 443, handles HTTPS, and passes each request on to Tamamo. Tamamo checks the visitor and passes the request on to your app.

```text
visitor ──► proxy (HTTPS, port 443) ──► Tamamo (port 8923) ──► your app
```

This guide has four steps:

1. [Keep visitors away from Tamamo's own port.](#_1-keep-tamamo-s-port-private)
2. [Configure your proxy.](#_2-configure-your-proxy)
3. [Tell Tamamo to trust the proxy](#_3-tell-tamamo-to-trust-the-proxy), so it sees each visitor's real IP address.
4. [Check that it works.](#_4-check-that-it-works)

Before you start, you need:

- Tamamo running as in [Installation](/guide/installation), with `TAMAMO_TARGET` pointing at your app.
- A working nginx, Caddy or Traefik that already serves HTTPS for your domain. This guide doesn't cover installing the proxy or getting a certificate.

The examples use `example.com`.

::: tip Does your proxy already serve the site itself?
If your proxy serves files or PHP itself, or you don't want all traffic to pass through Tamamo, use auth mode instead. The proxy keeps serving the site and only asks Tamamo whether each visitor may pass. See [nginx auth_request](/guides/nginx-auth-request) or [Caddy and Traefik forward auth](/guides/forward-auth).
:::

## 1. Keep Tamamo's port private

The compose file from the installation page publishes port 8923 to everyone. Behind a proxy, that is a back door: a visitor who connects to port 8923 directly skips the proxy and can lie about their IP address.

How you close it depends on where your proxy runs.

**The proxy runs on the server itself, outside Docker.** In `docker-compose.yml`, replace the `ports` line of the `tamamo` service so the port is reachable only from the server:

```yaml [docker-compose.yml]
services:
  tamamo:
    ports:
      - "127.0.0.1:8923:8923"    # was "8923:8923"
```

The proxy then reaches Tamamo at `127.0.0.1:8923`. The examples below use this address.

**The proxy runs in Docker, in the same compose file as Tamamo.** Remove the `ports` section of the `tamamo` service. Containers in one compose file reach each other by service name, so the proxy reaches Tamamo at `tamamo:8923`. Use that instead of `127.0.0.1:8923` in the examples below.

Then apply the change:

```bash
docker compose up -d
```

Without Docker, set `listen: "127.0.0.1:8923"` under `server:` in `tamamo.yaml` and restart Tamamo.

## 2. Configure your proxy

Every proxy has to do the same three things:

| The proxy must | Why |
| --- | --- |
| Pass the `Host` header unchanged | Tamamo picks the [site](/config/sites) by the host name the visitor opened. |
| Send the visitor's IP address in a header, replacing whatever the visitor sent | Tamamo needs the real address for IP rules, the rate limit and the pass. |
| Send `X-Forwarded-Proto: https` | Tamamo then marks its pass cookie `Secure`, and your app knows the visitor used HTTPS. |

The configs below do all three. Each one was tested with Tamamo. Use the one for your proxy, reload the proxy, then note its **IP source**: you need it in step 3.

| Proxy | IP source for step 3 |
| --- | --- |
| [nginx](#nginx) | `x-real-ip` |
| [Caddy](#caddy) | `x-forwarded-for` |
| [Traefik](#traefik) | `x-forwarded-for` |

### nginx

Put the `location /` block in the `server` block that serves your domain over HTTPS, and the `map` block above it.

```nginx [/etc/nginx/conf.d/example.com.conf]
# Needed for WebSockets. Leave it out if you already have this map.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ""      "";
}

server {
    listen 443 ssl;
    server_name example.com www.example.com;
    # ...your ssl_certificate lines...

    location / {
        proxy_pass http://127.0.0.1:8923;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

IP source: `x-real-ip`.

### Caddy

Caddy sends all three headers without being told.

```text [/etc/caddy/Caddyfile]
example.com, www.example.com {
    reverse_proxy 127.0.0.1:8923
}
```

IP source: `x-forwarded-for`.

### Traefik

Traefik reads its routes from labels on the `tamamo` container. The example uses an entry point named `websecure` and a certificate resolver named `le`. Use the names from your own Traefik setup.

Tamamo and Traefik must share a Docker network. If Traefik is in another compose file, attach Tamamo to Traefik's network. Here it is called `web`:

```yaml [docker-compose.yml]
services:
  tamamo:
    # no "ports" section
    networks: [default, web]
    labels:
      - traefik.enable=true
      - traefik.docker.network=web
      - traefik.http.routers.site.rule=Host(`example.com`) || Host(`www.example.com`)
      - traefik.http.routers.site.entrypoints=websecure
      - traefik.http.routers.site.tls.certresolver=le
      - traefik.http.services.site.loadbalancer.server.port=8923

networks:
  web:
    external: true
```

The `default` network keeps Tamamo connected to your app. If Traefik is in the same compose file as Tamamo, leave out the `networks` parts and the `traefik.docker.network` label.

Traefik sends all three headers without being told. IP source: `x-forwarded-for`.

## 3. Tell Tamamo to trust the proxy

Tamamo now gets the visitor's address in a header. It only believes that header when the connection comes from an address you list as a trusted proxy. Otherwise anyone could send the header and pretend to be someone else.

Set two things in `data/tamamo.yaml`, in the `server` section the file already has:

```yaml [data/tamamo.yaml]
server:
  ip_source: x-real-ip        # the IP source of your proxy, from step 2
  trusted_proxies:
    - 172.18.0.1              # the address your proxy connects from
```

In the web UI, the same two fields are on **Configure > Server**: **Where the visitor IP comes from** and **Trusted proxies**.

The address in `trusted_proxies` is the proxy's address *as Tamamo sees it*. Find it by where the proxy runs:

**The proxy runs on the server, Tamamo in Docker.** Tamamo sees the connection coming from its Docker network's gateway. Print it with this command, run in the folder of your compose file:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.Gateway}} {{end}}' $(docker compose ps -q tamamo)
```

It prints one address, such as `172.18.0.1`. Use that.

**The proxy runs in Docker too.** Containers can get a new address when they are recreated, so trust the whole network they share. Print its range with:

```bash
docker inspect -f '{{range .NetworkSettings.Networks}}{{.NetworkID}} {{end}}' $(docker compose ps -q tamamo) | xargs docker network inspect -f '{{.Name}}: {{range .IPAM.Config}}{{.Subnet}}{{end}}'
```

It prints one line for each network, such as `web: 172.19.0.0/16`. Use the range of the network your proxy is on.

**Nothing runs in Docker.** Use `127.0.0.1`.

Tamamo loads the file again by itself within a few seconds. Check it for mistakes with:

```bash
docker compose exec tamamo tamamo -check
```

It prints `/data/tamamo.yaml is valid`, or the first error with its line number.

::: warning Don't leave trusted_proxies empty
With an empty list, Tamamo believes the header from anyone. That is only safe while step 1 keeps visitors away from Tamamo's port, and one mistake there lets a bot pick its own IP address.
:::

The [Server](/config/server#visitor-ip-addresses) page describes both settings in full. If `TAMAMO_IP_SOURCE` is set in your compose file, it overrides `ip_source`.

## 4. Check that it works

1. Tamamo answers through the proxy. This prints `ok`:

   ```bash
   curl -s https://example.com/.tamamo/health
   ```

2. Open `https://example.com` in a private browser window. You see the checking page for a moment, then your site.

3. Tamamo sees your address, not the proxy's. In the web UI, open **Monitor > Activity**. The newest events show your own public IP address. If they show an address starting with `172.` or `127.`, go back to [step 3](#_3-tell-tamamo-to-trust-the-proxy): the address shown is the one to put in `trusted_proxies`.

Without the web UI, check the IP address with a temporary [rule](/config/rules) that blocks your own address: the site must then show the denied page to you.

## Serve the web UI on an admin subdomain

The [web UI](/config/admin) can have its own host name, such as `admin.example.com`, with HTTPS from the same proxy.

Two environment variables make this safe. `TAMAMO_ADMIN_DOMAIN` makes the admin API answer only for that host name. `TAMAMO_ADMIN_USERNAME` and `TAMAMO_ADMIN_PASSWORD` create the login before anyone can open the page. Without them, the first person to open the web UI creates the login.

1. Put the password in the `.env` file next to `docker-compose.webui.yml`:

   ```ini [.env]
   TAMAMO_ADMIN_PASSWORD=a-long-password-of-your-own
   ```

2. In `docker-compose.webui.yml`, add the variables to `tamamo`, and publish the web UI to the server only:

   ```yaml [docker-compose.webui.yml]
   services:
     tamamo:
       environment:
         TAMAMO_ADMIN_DOMAIN: admin.example.com
         TAMAMO_ADMIN_USERNAME: admin
         TAMAMO_ADMIN_PASSWORD: ${TAMAMO_ADMIN_PASSWORD}

     webui:
       ports:
         - "127.0.0.1:8081:8081"    # was "8081:8081"
   ```

   Apply it with `docker compose -f docker-compose.webui.yml up -d`.

3. Send `admin.example.com` to port 8081 in your proxy. It is the same config as for the site, with the other host name and port:

   ::: code-group

   ```nginx [nginx]
   server {
       listen 443 ssl;
       server_name admin.example.com;
       # ...your ssl_certificate lines...

       location / {
           proxy_pass http://127.0.0.1:8081;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

   ```text [Caddy]
   admin.example.com {
       reverse_proxy 127.0.0.1:8081
   }
   ```

   :::

   With Traefik, put the same kind of labels on the `webui` service, with the rule ``Host(`admin.example.com`)`` and port `8081`.

4. Reload the proxy, open `https://admin.example.com`, and sign in with the username and password from steps 1 and 2.

::: danger Keep the web UI private
Whoever signs in controls your site's protection. Serve the web UI over HTTPS only, and never publish port 8081 to the internet. If you can, also limit `admin.example.com` to your own IP address or a VPN in the proxy.
:::

## Common problems

- **Every visitor has the same IP address in Activity.** Tamamo doesn't trust the proxy, so it shows the proxy's own address. Put that address in `trusted_proxies`. See [step 3](#_3-tell-tamamo-to-trust-the-proxy).
- **502 Bad Gateway from the proxy.** The proxy can't reach Tamamo. Check that Tamamo runs (`docker compose ps`), and that the address in the proxy config fits [step 1](#_1-keep-tamamo-s-port-private): `127.0.0.1:8923` for a proxy on the server, `tamamo:8923` for a proxy in the same compose file.
- **An error page from Tamamo, and "upstream request failed" in `docker compose logs tamamo`.** Tamamo works but can't reach your app. Check [`TAMAMO_TARGET`](/config/server#upstream). Inside Docker, `localhost` is the Tamamo container itself.
- **The wrong site answers, or a site of its own is ignored.** The proxy doesn't pass the `Host` header on. In nginx, that is `proxy_set_header Host $host;`.
- **The pass cookie has no `Secure` mark.** Tamamo thinks the visitor used plain HTTP. The proxy must send `X-Forwarded-Proto: https`.
- **The admin domain answers "not found".** The host name doesn't match `TAMAMO_ADMIN_DOMAIN`. While that variable is set, opening the web UI by IP address or as `localhost` gives the same answer.

## Related

- [nginx auth_request](/guides/nginx-auth-request): nginx serves the site and asks Tamamo about each request.
- [Caddy and Traefik forward auth](/guides/forward-auth): the same for Caddy and Traefik.
- [Server](/config/server): the IP source, trusted proxies and the upstream in full.
- [Sites](/config/sites): one Tamamo for several domains.
