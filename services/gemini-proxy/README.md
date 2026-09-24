# gemini-proxy

Server-side passthrough to the Gemini API, holding `GEMINI_API_KEY` so the
mobile app never needs one for a fresh install. It exists on Cloud Run rather
than EAS Hosting because Google refuses requests from EAS Hosting's
Cloudflare egress IP.

Deliberately dumb: the grounding gate, the `found` check, and the zero-macro
floor all stay client-side in `mobile/src/api/gemini.ts`, where they are
tested. This service only attaches the key, checks the shared token, and
allowlists the model.

Also proxies Open Food Facts search: `GET /api/off/search` (Search-a-licious)
and `GET /api/off/legacy` (the per-country `cgi/search.pl` endpoint). OFF's
search endpoints send no `Access-Control-Allow-Origin`, so a browser cannot
call them at all — a plain GET with no custom headers still fails. The
upstream URL for both is built server-side (in `offProxy.ts`) from validated
query parameters and is never taken from the request, so this cannot become an
open relay. The barcode endpoint (`/api/v2/product/<barcode>.json`) does send
CORS headers and is deliberately not proxied — the app keeps calling it
directly on every platform.

## Environment variables

- `GEMINI_API_KEY` — the actual Gemini API key, attached to every forwarded
  request.
- `USDA_API_KEY` — FoodData Central key, attached to `/api/usda/search`.
  Optional: unset falls back to USDA's `DEMO_KEY`, which is rate limited to
  roughly 30 requests per hour per IP and which one search session can
  exhaust. It is held here rather than shipped in the app because the quota
  is attached to the key, and a key in the bundle is readable by anyone who
  opens the site. A user who enters their own key in Settings bypasses this
  route entirely and spends their own quota.
- `PROXY_TOKEN` — the shared secret the proxy checks against the
  `x-proxy-token` header. The app sends this as `EXPO_PUBLIC_PROXY_TOKEN`
  (the `EXPO_PUBLIC_` prefix means it's inlined into the app bundle and
  therefore extractable — the name states the weakness rather than hiding
  it).

## Health

`GET /_health` returns `200 ok`. It is answered above the static branch and so
is deliberately independent of the web build: a container that returns `ok`
here but 404s `/` is misconfigured rather than dead, and that is worth being
able to tell apart.

The name is deliberate. Google Front End intercepts the conventional
`/healthz` on Cloud Run and answers its own 404 before the request reaches
the container, so that path cannot be used here.

## Deploy

The web build is not committed, so stage it into `web/` first. Every deploy
needs this: without it the image carries whatever `web/` happened to hold, and
a stale or absent build is invisible until someone opens the site.

```
cd ../../mobile && rm -rf dist && npx expo export --platform web
rm -rf ../services/gemini-proxy/web && cp -r dist ../services/gemini-proxy/web

cd ../services/gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 --quiet
```

It must be `web/` and not `dist/`: `.gcloudignore` excludes `dist/`, so naming
the build that would upload nothing and deploy a service that answers
`/_health` and 404s every page.

`GEMINI_API_KEY` and `PROXY_TOKEN` are already set on the service and survive
a deploy, so a routine deploy does not pass `--set-env-vars`. That flag
replaces the set wholesale, which means naming one variable silently drops the
other. Use it only to set them the first time or to rotate one:

```
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 \
  --set-env-vars "^##^GEMINI_API_KEY=...##PROXY_TOKEN=...##USDA_API_KEY=..."
```

To add or change one variable while leaving the rest alone, use
`--update-env-vars` instead, which merges rather than replaces:

```
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 \
  --update-env-vars USDA_API_KEY=...
```

### Verifying a deploy

Check the *body* of `/_health`, not its status code. Every path that does not
look like an asset falls back to `index.html` with a 200, so a build missing
the health branch entirely still answers `/_health` with 200 — it just answers
with HTML. A deploy of the wrong commit passed a status-only check and looked
green.

```
curl -s $URL/_health                      # ok            (text/plain, NOT html)
curl -s -o /dev/null -w "%{http_code}\n" $URL/            # 200
curl -s -o /dev/null -w "%{http_code}\n" $URL/scan        # 200  client-side route
curl -s -o /dev/null -w "%{http_code}\n" $URL/manifest.json  # 200
curl -s -o /dev/null -w "%{http_code}\n" $URL/api/nonsense   # 404  not the SPA
curl -s -o /dev/null -w "%{http_code}\n" \
  $URL/_expo/static/js/web/nope-123.js                       # 404  not the SPA
curl -s -o /dev/null -w "%{http_code}\n" -X POST $URL/api/gemini \
  -H "Content-Type: application/json" -d '{}'                # 401
curl -s -o /dev/null -w "%{http_code}\n" \
  "$URL/api/usda/search?q=chicken"                           # 401  token gate
```

Those last two are the ones that catch a stale image: an older build answers
both with `index.html` and a 200.

Then, from the browser console on the deployed page, the check curl cannot
make:

```js
await fetch('/api/gemini', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.status)
```

`401` proves the page reached the API same-origin. A `TypeError` means the
request never arrived and co-hosting did not take effect.

## Things a future reader will otherwise learn the hard way

- The model allowlist in `geminiProxy.ts` (`ALLOWED_MODELS`) must stay in
  lockstep with `MODEL` in `mobile/src/api/gemini.ts` and
  `mobile/src/ai/geminiDescribe.ts`. Changing the client's model without
  redeploying this service yields `400 {"error":"Model not allowed"}`, and
  no message anywhere says the word "model" — it just looks like every
  lookup and estimate is broken.
- `gcloud` on this machine (Windows) needs `CLOUDSDK_PYTHON` set to the SDK's
  bundled interpreter. Windows' App Execution Alias intercepts a bare
  `python`, so `gcloud` fails to find one unless that variable points at the
  real interpreter.
- The `preview` EAS environment has no variables set. A preview build will
  inline an empty `EXPO_PUBLIC_PROXY_TOKEN` and every proxy call will 401
  until someone adds `EXPO_PUBLIC_PROXY_TOKEN` and `GEMINI_API_KEY` to it.
