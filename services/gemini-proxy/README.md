# gemini-proxy

Server-side passthrough to the Gemini API, holding `GEMINI_API_KEY` so the
mobile app never needs one for a fresh install. It exists on Cloud Run rather
than EAS Hosting because Google refuses requests from EAS Hosting's
Cloudflare egress IP.

Deliberately dumb: the grounding gate, the `found` check, and the zero-macro
floor all stay client-side in `mobile/src/api/gemini.ts`, where they are
tested. This service only attaches the key, checks the shared token, and
allowlists the model.

## Environment variables

- `GEMINI_API_KEY` — the actual Gemini API key, attached to every forwarded
  request.
- `PROXY_TOKEN` — the shared secret the proxy checks against the
  `x-proxy-token` header. The app sends this as `EXPO_PUBLIC_PROXY_TOKEN`
  (the `EXPO_PUBLIC_` prefix means it's inlined into the app bundle and
  therefore extractable — the name states the weakness rather than hiding
  it).

## Deploy

```
gcloud run deploy gemini-proxy --source . --region asia-southeast1 \
  --allow-unauthenticated --timeout 120 \
  --set-env-vars "^##^GEMINI_API_KEY=...##PROXY_TOKEN=..."
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
