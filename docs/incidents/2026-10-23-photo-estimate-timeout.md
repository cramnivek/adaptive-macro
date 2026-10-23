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

## Intermittent failure and fallback

Repeating the same public-photo check later hit the new deadline after 45.3 seconds. Low reasoning improved typical latency but did not resolve the intermittent failure. The initial three fast responses were insufficient evidence of recovery.

Two direct checks of stable `gemini-3.5-flash-lite` with the same actual prompt, image, schema and parser completed in 3.126 and 2.237 seconds. Both identified toast, avocado and egg and passed schema validation. This qualifies basic compatibility, not portion accuracy or a broad nutritional benchmark.

Structured meal photos with default or explicit low reasoning now get 15 seconds on the primary model, then one Flash-Lite attempt with a 12-second deadline if the primary times out or returns 502/503/504. Both header and body waits count. Other image tasks, grounded requests and explicit higher reasoning keep their existing policy. Authentication, quota and invalid-request failures are never retried. Caller cancellation aborts the active request without starting a fallback. The server-side model switch requires no replacement Android APK.

The primary and fallback can both incur usage. Aborting the primary bounds the server wait but does not prove Google's billing or computation stops immediately. Timing logs identify which model served each attempt without recording health content. The 27-second processing budget excludes the initial upload and network transit; it cannot promise every installed client's older 30-second camera timer will be avoided.

A controlled run of the actual proxy handler deliberately stalled the primary transport and let the fallback call the real Google endpoint using the public breakfast image and production meal schema. It made exactly two attempts, returned 200 in 17.538 seconds, and the app's schema validated toast, avocado and egg. All 174 proxy tests and workspace typechecks passed. Fake-timer tests cover stalled headers/body, failed fallback without a third attempt, cancellation, excluded request types, and quota/auth status preservation.

Model capability reference: [Gemini 3.5 Flash-Lite](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite).

Revision `gemini-proxy-00175-kmd` deployed with 100% traffic. Four subsequent public-photo requests, alternating legacy and current request shapes, returned schema-valid estimates in 4.342, 4.856, 5.008 and 4.980 seconds. They used the primary model; the forced-stall check above establishes the fallback path. Live verification confirmed `/_health` body `ok`, the expected web entry, all 209 manifest-listed JavaScript files available, unknown API 404 and tokenless Gemini 401. The full workspace suite passed 1,845 tests, and CI passed for implementation commit `808762c65ef75bc79f3a6bbd05b99f741e79a307`. These checks do not establish physical-device behavior or guarantee provider availability.

## Typed-meal follow-up

After the photo deployment, two text-only production calls also reached the 110-second server limit. The typed-meal client stops waiting after 30 seconds. Three diagnostic descriptions using the actual app prompt/schema/parser also exceeded a 25-second diagnostic limit, including two with explicit low reasoning. The same examples on Flash-Lite returned valid estimates in 2.635, 1.988 and 2.000 seconds. No user meal descriptions were read or logged.

The fast policy originally required an image, so typed meal estimation never received the 15-second primary and 12-second fallback budgets. Extend eligibility to the same meal schema with or without an image. Grounded text, explicit higher reasoning, other structured text tasks and upstream auth/quota failures retain their original behavior. Three regression tests cover old text clients, the 27-second combined deadline, and excluded text tasks. All 177 proxy tests and workspace typechecks pass. A user subsequently reported the app working; that report alone does not establish recovery from an intermittent provider stall, so the bounded typed-meal correction is retained.
