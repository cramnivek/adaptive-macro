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
- `SUPABASE_URL` — the Supabase project URL (`https://<ref>.supabase.co`). The
  proxy verifies the app's sign-in token against that project's published keys
  and limits Gemini per signed-in person. Optional: unset, per-user limits are
  off and every Gemini call uses the signed-out pool. No secret is involved.
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
# Keep the previous build's code files: a page opened before this deploy (an
# installed iPhone app still in memory) loads some of them later, by name.
mkdir -p ../keep && cp -r ../services/gemini-proxy/web/_expo/static/js/web/. ../keep/ 2>/dev/null
rm -rf ../services/gemini-proxy/web && cp -r dist ../services/gemini-proxy/web
cp -n ../keep/* ../services/gemini-proxy/web/_expo/static/js/web/ 2>/dev/null; rm -rf ../keep

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

## Deploying from GitHub

`.github/workflows/deploy.yml` tests every pull request, and on every push to
`main` builds the web app, keeps the live site's code files beside it
(`tools/keep-live-chunks.mjs`), deploys, and runs the checks above. Supabase
applies migrations from the same push, so the database and the app that
matches it go live minutes apart instead of whenever someone next deploys.

It signs in to Google with Workload Identity Federation: GitHub proves which
repository and branch a run belongs to, and Google lets only `main` of this
repository act as one narrow deploy account. No key is stored anywhere. The
deploy job is skipped, not failed, until the setup below is done.

### One-time setup, from PowerShell

```powershell
$PROJECT = gcloud config get-value project
$NUMBER  = gcloud projects describe $PROJECT --format="value(projectNumber)"
$SA      = "github-deploy@$PROJECT.iam.gserviceaccount.com"
# GitHub's numbers for the repository and its owner, from
# `gh api repos/cramnivek/adaptive-macro --jq '.id, .owner.id'`. Trusted
# instead of the name: a name can be registered again by someone else if the
# account is ever renamed, and a number cannot.
$REPO_ID  = "1374033579"
$OWNER_ID = "54169123"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com `
  cloudbuild.googleapis.com run.googleapis.com artifactregistry.googleapis.com

# The account GitHub acts as. It may deploy from source, and nothing else.
gcloud iam service-accounts create github-deploy --display-name "GitHub deploy"
gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SA" `
  --role roles/run.sourceDeveloper --condition None
gcloud projects add-iam-policy-binding $PROJECT --member "serviceAccount:$SA" `
  --role roles/serviceusage.serviceUsageConsumer --condition None

# It must be able to run the service, and the build, as the account they
# already run as. Granted on that one account, not on every account in the project.
$RUNTIME = gcloud run services describe gemini-proxy --region asia-southeast1 `
  --format="value(spec.template.spec.serviceAccountName)"
if (-not $RUNTIME) { $RUNTIME = "$NUMBER-compute@developer.gserviceaccount.com" }
gcloud iam service-accounts add-iam-policy-binding $RUNTIME `
  --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser

# Trust GitHub's sign-in, for pushes to main of this repository only.
gcloud iam workload-identity-pools create github --location global --display-name "GitHub"
gcloud iam workload-identity-pools providers create-oidc adaptive-macro `
  --location global --workload-identity-pool github `
  --issuer-uri "https://token.actions.githubusercontent.com" `
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_id=assertion.repository_id,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" `
  --attribute-condition "assertion.repository_id == '$REPO_ID' && assertion.repository_owner_id == '$OWNER_ID' && assertion.ref == 'refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding $SA --role roles/iam.workloadIdentityUser `
  --member "principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository_id/$REPO_ID"

# The three values GitHub needs:
"GCP_PROJECT_ID                 = $PROJECT"
"GCP_WORKLOAD_IDENTITY_PROVIDER = projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/adaptive-macro"
"GCP_DEPLOY_SERVICE_ACCOUNT     = $SA"
```

Done on 2026-10-20, as above: the pool, the provider and the account exist,
and the three variables are set.

Then in GitHub: the repository's **Settings → Secrets and variables → Actions →
Variables**, add those three as repository *variables* (not secrets — none of
them is a credential). The next push to `main` deploys; **Actions → Test and
deploy → Run workflow** deploys `main` without one.

If `roles/run.sourceDeveloper` is refused as an unknown role, the project
predates it: grant `roles/run.admin`, `roles/cloudbuild.builds.editor`,
`roles/artifactregistry.writer` and `roles/storage.admin` to `$SA` instead.

If the build step fails with a permission error naming the compute account,
the build account is missing `roles/run.builder`. Manual deploys from this
project already build, so it should be there; Google lists it as required for
source deploys:

```powershell
gcloud projects add-iam-policy-binding $PROJECT --role roles/run.builder `
  --member "serviceAccount:$NUMBER-compute@developer.gserviceaccount.com" --condition None
```

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

## Rate limits

`PROXY_TOKEN` is inlined into the client bundle by Expo — the browser needs it
to call this service, so it is readable by anyone who opens the deployed page
and views the JavaScript. That is survivable for one user and not survivable
with users.

`rateLimit.ts` does not fix that; only per-user credentials can. It caps what
one extracted token is worth.

The address is read as the second-from-last entry of `x-forwarded-for`, which
is right for an honest caller and **cannot be made spoof-proof here**. Measured
against the deployed service, twice:

- Twenty-one calls carrying no header hit the limit exactly on the twenty-first.
- Twenty-one calls each carrying a different invented address all went through,
  on twenty-one fresh buckets.

Cloud Run's front end appends only its own hop, so the client's own entry stays
caller-controlled whichever end you read from. Per-caller limiting here stops
accidental overuse and nothing else. Treat it as such.

What does hold is knowing who is *signed in*. With `SUPABASE_URL` set, a
request carrying `Authorization: Bearer <Supabase access token>` is verified
(`userToken.ts`, ES256 against the project's JWKS, no dependency) and counted
per person:

- Signed in — 20 per 10 minutes and **60 per 24 hours**, keyed on the user id.
  The daily one answers `429` with `x-limit: user-daily`.
- No token (or `SUPABASE_URL` unset) — 20 per 10 minutes per address, and a
  **signed-out pool of 100 per 24 hours** shared by everyone.
- An expired token answers `401` with `x-auth: expired`; the app refreshes and
  retries once. Any other bad token answers `401` and is not retried. Either
  kind counts against the caller's per-address burst limit before the `401` is
  sent, so a loop of bad tokens ends in `429` like any other flood. If
  Supabase's keys cannot be fetched (the fetch gives up after 3 seconds) and
  none are cached, the caller is treated as signed out rather than refused.
- The **daily ceiling**, 1,500 Gemini calls across every caller signed in or
  not, stays as the bill guard. It does not depend on knowing who is calling.

The shared token still gates every Gemini call; the sign-in token only decides
which limits apply. Someone who can create many accounts could still reach the
ceiling, and then every caller is refused until it rolls. Protecting the wallet
is worth more than protecting availability here.

- `/api/gemini` — 20 per 10 minutes. A grounded lookup takes most of a minute,
  so this is already far beyond any human pace.
- `/api/usda/*` and `/api/off/*` — 150 per 10 minutes. Cheap, and typed at.

Over the limit answers `429` with a `Retry-After` in whole seconds. The checks
run *before* the token check, so a caller with a bad token cannot hammer the
service either. Pages and assets are never limited: a rate-limited API must not
blank the app.

Anything that does not arrive with at least two hops shares one bucket, as
does a request with no header at all. That is the conservative way round — a
caller whose address cannot be established gets the strictest treatment rather
than an exemption — but it means that if this ever runs somewhere that does not
put the client in that position, every user shares one allowance.

The limits live in the process, so each Cloud Run instance counts separately;
scaling to N instances multiplies the effective limit by N. Good enough for a
spend cap, not a security boundary.
