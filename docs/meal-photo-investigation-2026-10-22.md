# Meal photo investigation and Astra product review

Reviewed on 2026-10-22, starting from main at `7d2a285`. The reported failure
is in the Android meal-photo estimator: text-only estimates work, while a
photo remains scanning through the timeout without showing an error.

## What the investigation established

Cloud Run recorded an Android (`okhttp/4.12.0`) Gemini request at 16:09:02
Singapore time that ended with HTTP 504 after 120 seconds. Its request size
was about 80 KB. The next two Gemini requests completed successfully in 6.3
and 11.2 seconds. Logs were inspected for request metadata only; they do not
establish which internal operation stalled or prove these were the owner's
specific attempts.

The app's timeout only called `AbortController.abort()`. It then continued
awaiting promises from session lookup, fetch, and response decoding. If one
of those promises did not settle after cancellation, neither the automatic
camera retry nor the error display could progress. Regression tests reproduced
this in all three stages, plus a late session resolution could still start
an abandoned upload.

The change makes the wait itself reject on cancellation while still passing
the cancellation signal to fetch. It covers session refresh too. Retaking a
photo cancels the prior estimate, and the camera sheet provides Retry photo
after a failure and Cancel scan while waiting. The existing one-time automatic
camera retry can now progress when the first request ignores cancellation.

This fixes a demonstrated failure in the timeout/recovery mechanism. The
underlying intermittent Android transport/upstream stall has not been
reproduced on a connected phone, so a successful phone scan remains the final
acceptance check. No native dependency or model default was changed.

Validation: `npm test` passed all 1,686 tests (252 engine, 1,279 mobile,
155 proxy); `npm run typecheck` passed all three workspaces. Android export
also passed, producing a 7.9 MB Hermes bundle and the DOM component bundles.
These checks establish code and bundle validity, not device acceptance.

## Model and accuracy findings

The app uses Gemini 3.5 Flash for photo and text estimates. It converts photos
to JPEG at a maximum edge of 1024 pixels and quality 0.7. Requests ask for food
identity, grams, macros, confidence, assumptions, and many micronutrients in
one structured response. The model invents the nutrient estimates from its
learned knowledge; it does not look up each visible food in USDA during this
path.

The configured Google API key lists Gemini 3.8 Flash as available. Google's
[model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
confirms image input, structured output, and low/medium/high thinking support.
It is a suitable candidate for a controlled comparison. Changing only the
client constant would fail through the current proxy allowlist; a deliberate
upgrade must update the client and proxy together.

Four small direct-key calls used the app's actual request prompt and schema,
with the API key kept out of files and output. They bypassed the shared proxy
allowance. The challenger also used low thinking, so this compares two model
configurations rather than isolating the model alone.

| Smoke check | Gemini 3.5 Flash, current defaults | Gemini 3.8 Flash, low thinking |
| --- | --- | --- |
| Blank test image, correctly refused as food | HTTP 200, 4.428 s | HTTP 200, 3.553 s |
| Text with 100 g eggs, 10 g butter, 60 g sourdough | HTTP 200, 9.352 s, 377 kcal | HTTP 200, 9.796 s, 371 kcal |

The existing arithmetic reference for those ingredient quantities is
376.7 kcal. These results establish connectivity and schema compatibility,
not real-meal photo accuracy. One text meal and a blank image cannot rank
models, establish latency distributions, or justify a production switch.

[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) also
supports image input and structured output and is a possible independent
challenger. Ascend would need a separate server-side provider integration
and API credentials to use it. It was not called in this investigation.
Astra was used for product review, not as the app's photo-estimation backend.

## The useful accuracy experiment

Use the previously agreed set of about 15 meals, with components weighed and
reference nutrients computed from recorded food-composition values. Include
the owner's normal meals, mixed dishes, sauces, hidden oil, and different
plate/container sizes. Keep photos local until deliberately sent to a model.

For each meal, compare photo alone with photo plus the known food/weight
description. Run the current model and challenger on the same cases, with
several repetitions. Record failures and latency alongside these separate
questions:

1. Did it identify the foods and miss or invent an ingredient?
2. How far were each food's estimated grams from the weighed portion?
3. With food and grams supplied, how far were nutrient estimates from the
   reference? This separates composition errors from visual portion errors.
4. What were the absolute calorie error and signed calorie bias over meals?

Use the answers to choose the optimization. If composition is the problem,
trial model identification/grams followed by matched database composition,
with an editable match and a labelled estimate when a match is unavailable.
If portions are the problem, prioritize a short question about quantity,
container size, cooking oil, or leftovers. Database composition alone cannot
repair an incorrect portion or food match.

Two current trust gaps deserve follow-up: the prompt allows unknown
micronutrients to become zero, and saving an estimated food drops its original
confidence and assumption. Those are distinct from choosing a stronger model.

## Astra's recommended product direction

Make the core promise: log quickly, inspect the assumptions, and understand
why the plan changes. These are product hypotheses grounded in the repository,
not findings from user research.

| Priority | Smallest useful improvement | Value and scope |
| --- | --- | --- |
| 1 | Keep a failed photo and offer retry or a written description | Recoverable logging; this change begins that work. Verify camera and library flows on Android and web. |
| 2 | Run the weighed-meal comparison above | Select models and pipeline changes from measured failure modes. |
| 3 | Preserve estimate source, confidence, assumptions, and corrections after saving | Keeps the diary and coach honest. Needs local schema and backup work; unknown nutrients should stay distinct from zero. |
| 4 | Save an explicitly corrected meal as a usual meal | Makes the next log faster without another model call. Build on existing repeats and saved foods. |
| 5 | Show a first-week progress card and next check-in date | Makes the adaptation process understandable. A thin-data week can show progress without pretending enough data exists to change targets. |
| 6 | Put deterministic weight, lifting, and log-coverage evidence before weekly coach prose | Makes the combined food/lifting benefit visible without implying causation. |
| 7 | Show that the log is on this device and when it was last backed up | Reduces the assumption that signing in backs up workout history. |

Suggested sequence: reliable scans, measured accuracy, preserved uncertainty,
then usual meals or first-week guidance based on observing actual logging.

## Continuing Claude's work

The supplied Claude cloud link was not readable through the web tool. The
local project-specific Claude history and GitHub state were available. The
latest substantive local session had finished merging and deploying its code;
the remaining handoff is PR #51, whose checks pass. Its later background Metro
process was stopped during an idle low-memory event. That event is separate
from the observed Gemini timeout.

Future work can continue from the code, handoff, Git history, and local project
notes without waiting for Claude's allowance to reset. An unread cloud-only
instruction would still need to be provided before claiming it was recovered.
