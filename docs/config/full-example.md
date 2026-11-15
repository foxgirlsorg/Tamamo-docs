---
title: Full example
description: A realistic tamamo.yaml for a blog and a shop, with a custom rule, a monitor bypass and statistics.
---

# Full example

This file puts a blog and a shop behind one Tamamo. It lists only what differs from the defaults. Anything you leave out keeps its default.

::: warning
Do not paste this over an existing `tamamo.yaml`, because your admin login is stored in that file. Copy the sections you need into your own file instead.
:::

```yaml
# Settings for a blog and a shop behind one Tamamo.
# Anything you leave out keeps its default.
server:
  # Unknown host names go here. The blog and the shop have their own targets.
  target: http://app:80

# Global rules. Rules listed here replace the default rules, so list every
# rule you want to keep.
rules:
  - name: Block SEO scrapers
    action: block
    user_agents: ['*AhrefsBot*', '*SemrushBot*', '*MJ12bot*']
    note: Crawlers that take bandwidth and send no visitors.
  - name: Allow robots.txt
    action: allow
    paths: [/robots.txt, /favicon.ico]
  - name: Allow search engines
    action: allow
    user_agents: ['*Googlebot*', '*bingbot*', '*DuckDuckBot*']
  - name: Check everyone else
    action: challenge
    paths: ['*']

sites:
  - name: Blog
    hosts: [blog.example.com, "*.blog.example.com"]
    target: http://blog:8080
    protection:
      difficulty: 5

  - name: Shop
    hosts: [shop.example.com]
    target: http://shop:8080
    page:
      texts:
        checking:
          heading: One moment before you shop
          message: We check your browser once before you enter {host}.

protection:
  bypass_headers:
    - name: Uptime monitor
      header: X-Monitor-Token
      value: "replace-with-a-long-random-value"
  rate_limit:
    enabled: true
    requests: 300
    window_seconds: 60
    action: challenge

stats:
  enabled: true
  store_ips: false
  recent_events: 500
```

What changed:

- **`rules`** replaces the default rules. The AI assistant, link preview and archive allows are gone unless you add them back. The block rule comes first, so a scraper is refused before any allow rule matches.
- **Blog** changes only the difficulty.
- **Shop** has its own checking-page heading and uses the global rules.
- **Uptime monitor** lets requests with the `X-Monitor-Token` header skip the checks. Use your own long random value, and keep the file private, because the value is stored in plain text.
- **`rate_limit`** shows the checking page to an address that makes more than 300 requests a minute.
- **`stats`** keeps counts without visitor IP addresses (`store_ips: false`).

Check the file after each edit with `docker compose exec tamamo tamamo -check`. It prints `/data/tamamo.yaml is valid`, or the first error with its line number. A running Tamamo keeps its previous settings if the file is broken.

## Related

- [Sites](/config/sites): how host names pick a site.
- [Checking page](/config/checking-page): every `page` key.
- [Protection](/config/protection): the bypass headers and the rate limit.
- [Modules](/config/modules): checks compiled into Tamamo.
