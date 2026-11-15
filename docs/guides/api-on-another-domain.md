---
title: An API on another domain
description: "Protect an API that lives on another domain than its website, without checking visitors twice, and let your own app in without a check."
---

# An API on another domain

Use this guide when your website and its API have different domains, for example `example.com` and `api.example-backend.com`, and the API may run on another server. You want three things:

- Bots can't call the API.
- A visitor who passed the check on the website is not checked again by the API.
- Your own app, for example a phone app, is never checked.

## Why it needs a setup

After a check, the visitor's browser holds a *pass* in a cookie. A browser sends a cookie only to the domain that set it. So the pass from `example.com` never reaches `api.example-backend.com`, and the API can't know the visitor was already checked.

The API also can't show the checking page. Its callers are scripts and apps, not people looking at a page.

## How it works

```text
1. visitor ──► example.com                  checking page, solved once
               (pass cookie for example.com)

2. page script ──► example.com/.tamamo/api/pass
               ◄── { "token": "...", "header": "X-Tamamo-Pass" }

3. page script ──► api.example-backend.com/v1/items
                   X-Tamamo-Pass: <token>
               ◄── the API's answer
```

1. The visitor opens the website and passes the check there, as always.
2. Your page's script asks Tamamo for a copy of the pass. Tamamo gives one only to a visitor who has a valid pass. The copy lasts 15 minutes.
3. The script sends the copy to the API in the `X-Tamamo-Pass` header. Tamamo, in front of the API, sees a pass from a site it was told to trust and lets the request through. Your API never sees the header.

The copy is tied to the visitor's network and browser, like the pass itself. Someone who steals it can't use it from another place. It can't be used as a cookie, and a cookie can't be used in the header.

Your app doesn't take part in any of this. It sends a [bypass header](/config/protection#bypass-headers) and is let in.

## What you need

- One Tamamo that visitors of **both** domains go through. The API can be on any server: Tamamo forwards to it over the network. Two separate Tamamo installs can't do this, because the second one can't read passes the first one signed.
- The website protected by a check. A site that lets everyone in has no passes to share.
- A small change in your website's script: it has to fetch the copy and add the header.

## 1. Add the API as a site

In `data/tamamo.yaml`, add a site for the API's domain. `target` is where the API runs, as Tamamo reaches it.

```yaml [data/tamamo.yaml]
sites:
  - name: API
    hosts: [api.example-backend.com]
    target: https://backend-server.internal:8443
    protection:
      accept_passes_from: [default]
```

`accept_passes_from` lists the sites whose visitors need no second check, by name. `default` is the default site. If your website is a site of its own named `Website`, write `[Website]`.

In the web UI: add the site on **Monitor > Sites**, then open **Configure > Protection**, pick the API site at **Editing**, press **Customize for this site**, and fill in **Accept passes from these sites** in the **Never checked** card.

Then point the DNS record of `api.example-backend.com` at the server Tamamo runs on, and add the domain to your reverse proxy, the same way as the website's. See [Behind a reverse proxy](/guides/reverse-proxy).

## 2. Send the pass from your website

Add this to the script of your website, and call your API through `apiFetch`:

```js
let pass = null

async function tamamoPass() {
  const now = Date.now() / 1000
  if (!pass || pass.expires - now < 60) {
    const r = await fetch('/.tamamo/api/pass')
    if (!r.ok) throw new Error('no pass')
    pass = await r.json()
  }
  return pass
}

async function apiFetch(url, options = {}) {
  const p = await tamamoPass()
  const headers = { ...options.headers, [p.header]: p.token }
  let r = await fetch(url, { ...options, headers })
  if (r.status === 403) {
    // The copy ran out or the visitor's network changed. Get a new one once.
    pass = null
    const fresh = await tamamoPass().catch(() => null)
    if (!fresh) {
      location.reload() // no pass any more: the reload shows the check
      return r
    }
    r = await fetch(url, { ...options, headers: { ...options.headers, [fresh.header]: fresh.token } })
  }
  return r
}

// Use it like fetch:
const items = await apiFetch('https://api.example-backend.com/v1/items').then((r) => r.json())
```

`/.tamamo/api/pass` answers `401` when the visitor has no valid pass, and `404` when no site lists this one in `accept_passes_from`.

### CORS

A browser asks the API for permission before it sends a script's request with an extra header to another domain. This question is an `OPTIONS` request, and it can't carry the pass.

- Tamamo lets that question through when it comes from a site in `accept_passes_from`.
- Your API must already answer it, as it does today for your website. Tamamo adds `X-Tamamo-Pass` to the `Access-Control-Allow-Headers` of that answer, so you don't have to change the API.
- When the pass is missing, Tamamo answers `403` with `{"error":"challenge_required"}` and lets your website's script read it.

## 3. Let your app in

An app can't solve the check and has no website to get a pass from. Give it a secret header instead. Under the API site's `protection:`, add:

```yaml [data/tamamo.yaml]
    protection:
      accept_passes_from: [default]
      bypass_headers:
        - name: Phone app
          header: X-App-Key
          value: put-a-long-random-value-here
```

The app sends `X-App-Key: put-a-long-random-value-here` with every request. Tamamo lets those requests through without a check.

::: warning A secret inside an app is not very secret
Anyone who takes the app apart can read the header and use it. It keeps casual bots out, not a determined person. Turn on the [rate limit](/config/protection#rate-limit) for the API site too, and change the value in a new app version if it leaks. Your API still has to check who the user is, as it does today.
:::

## 4. Check that it works

Replace the domains with yours.

1. Without a pass, a script request to the API is refused. This prints `403`:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -H 'Origin: https://example.com' https://api.example-backend.com/v1/items
   ```

2. With the app's header it gets through. This prints your API's own status, such as `200`:

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -H 'X-App-Key: put-a-long-random-value-here' https://api.example-backend.com/v1/items
   ```

3. Open your website in a private browser window. After the check, the page's API calls work. In the web UI, **Monitor > Activity** shows them for the API site as passed.

## Common problems

- **`/.tamamo/api/pass` answers `404`.** No site lists this one in `accept_passes_from`, or the name is spelled differently from the site's name.
- **`/.tamamo/api/pass` answers `401`.** The visitor has no pass on the website. That happens when the website lets everyone in without a check. The website must use `challenge`.
- **The API call fails with a CORS error in the browser console.** Your API doesn't answer the browser's `OPTIONS` question for your website's domain. That is the API's own CORS setting, not Tamamo's.
- **The API still answers `403` with the header set.** The copy is tied to the visitor's network and browser. Check that Tamamo sees the same visitor IP address for both domains: both must come through the same kind of proxy, with [`ip_source` and `trusted_proxies`](/config/server#visitor-ip-addresses) set.
- **A rule for the API site asks for a higher difficulty than the website's.** A pass only counts for checks up to the difficulty it was earned at.

## Related

- [Protection](/config/protection): bypass headers, the rate limit and the other checks.
- [Sites](/config/sites): several domains behind one Tamamo.
- [Endpoints](/reference/endpoints): everything Tamamo serves under `/.tamamo/`.
