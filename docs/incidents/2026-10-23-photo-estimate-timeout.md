# Photo estimate timeout, 23 October 2026

## Evidence

Cloud Run revision `gemini-proxy-00172-s7v` logged `/api/gemini` at 14:58:16 UTC with status 504 after 120.0009 seconds. The platform terminated it at its request limit. Another call at 14:59:06 returned 200 after 74.6686 seconds. The service health endpoint and frontend remained available.

The proxy previously forwarded Gemini requests without a server deadline and returned an upstream stream for the adapter to read. It relied on the incoming connection closing to abort Gemini. A client's own timeout does not reliably end that work through Cloud Run's frontend. The photo client has a 60-second deadline, so successful backend results can arrive after the client has stopped waiting.

The meal request also left reasoning effort to the provider default. The configured `gemini-3.5-flash` alias currently returns `modelVersion: gemini-3.6-flash`, consistent with Google's documented automatic migration. This was observed live; the recent UI changes did not change the meal model or request payload. Google-internal reasons for the 75–120-second tail are not established by these logs.

The camera flow also abandoned its first attempt after 30 seconds and silently tried once more with a fresh 60-second limit. That made one scan last up to 90 seconds and could duplicate backend work when a disconnect did not reach the container. The earlier assumption that a call slower than 30 seconds must have stalled was not supported by a tail-latency measurement.

## Controlled check

A public Unsplash breakfast image (fried egg, avocado and toast, 768 pixels) was sent using the actual meal prompt, schema and parser through the deployed proxy. Default reasoning took 9.633 seconds with 902 thought tokens; low reasoning took 5.162 seconds with 269 thought tokens. Both produced validated estimates of the three visible foods. This demonstrates request compatibility and a latency improvement on one case, not nutritional accuracy or a tail-latency benchmark. No private user photographs were used.

## Correction

- Supply low reasoning for structured meal-photo requests that have no explicit reasoning configuration or tools. Apply the default at the proxy so installed Android clients benefit immediately. Other image schemas and grounded searches preserve their configuration.
- Bound image requests to 45 seconds and other Gemini requests to 110 seconds, below Cloud Run's 120-second limit. Include reading the entire response body; race the deadline so a transport ignoring cancellation still settles. Abort upstream on the deadline and clean up timers/listeners.
- Return an application JSON 504 response with a retry message, rather than waiting for the platform error. The current client maps a 504 to a readable timeout message. Its existing text, photo and cancellation deadlines remain.
- Remove the camera's automatic second attempt. One scan makes one estimate call; the person can explicitly retry after an error. This client change reaches web immediately and Android through a subsequent JavaScript/native release; the already-queued APK still receives the server correction.
- Log only requested model, image/non-image classification, status and elapsed time. Never log photos, prompts, responses, food names or credentials.

Unit tests exercise stalled headers and response bodies that ignore abort, configuration preservation, passthrough failure statuses and client error handling. Live deployment verification must include the built entry/health/API boundaries plus repeated public-photo requests through the production proxy. A new Android APK is not required for the server correction; the already queued compact-Today APK also benefits from it.

After revision `gemini-proxy-00173-9v2` deployed, two legacy-shaped meal-photo calls (no reasoning setting) completed in 4.984 and 4.987 seconds, and a current-client call in 6.362 seconds. All returned validated estimates of the three visible foods. In a browser fixture using the actual Describe screen and a mocked 34-second camera/provider boundary, the revised flow completed with one provider call and enabled Add to diary. This verifies the duplicate-retry removal, not physical camera behavior.

Sources: [Gemini 3.5 automatic migration](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.5), [thinking controls](https://ai.google.dev/gemini-api/docs/thinking).
