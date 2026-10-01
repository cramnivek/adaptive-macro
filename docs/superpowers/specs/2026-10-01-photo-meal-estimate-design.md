# Estimating a meal from a photograph

Design, 2026-10-01.

## Problem

Logging a plate of food means naming every component of it. `app/describe.tsx`
already removes most of that pain — "two scrambled eggs in butter, sourdough toast,
flat white" becomes items with portions, macros, a stated assumption and a confidence,
and nothing reaches the diary until the user has accepted it.

A photograph is faster than any sentence, and it is what people already take of their
food. The app cannot read one.

## Goal

Point the camera at the plate, or pick a photo taken earlier, optionally add a line of
context, and get the same reviewable estimate the text path produces.

## Non-goals

- **Keeping the photograph.** It is sent, estimated from, and discarded. See *Why the
  photo is not stored*.
- **A second review screen.** The photo feeds `describe.tsx`, which already has the
  meal picker, per-item portions, include and exclude, and the accept step. Building a
  second copy of that is the main way this feature could go wrong.
- **Reading nutrition labels or barcodes.** `app/scan.tsx` already does barcodes. A
  label in shot is just part of the picture.
- **Ollama.** The local path is a text model here. See *When the provider cannot see*.
- **Changing `SYSTEM_PROMPT` for the text path.** The meal-estimation eval compares
  providers on that prompt verbatim; altering it would silently change what the eval
  measures. The photo instructions are appended only when an image is present.

## Why the photo is not stored

Keeping it would be nice — a diary entry you can check later. It would also cost
migration v5, a thumbnail pipeline, real device storage, and it would have to survive
backup and restore, which is where a small feature stops being small.

The deciding factor is the iOS PWA. `HANDOFF.md` and the app's own Settings copy both
warn that browser storage is cleared without notice, and photographs would be the
first thing to push the quota over. A feature whose data silently evaporates is worse
than one that never claimed to keep it.

## Getting the image

Two new Expo packages, installed with `npx expo install` so SDK 57 picks the versions:

- **`expo-image-picker`** — camera and photo library, one API. Expo documents support
  for Android, iOS **and web**, which this project needs because iOS ships as a PWA.
  On web it renders a file input, which on iOS Safari opens the camera directly; that
  is more dependable inside a home-screen PWA than live video.
- **`expo-image-manipulator`** — resizing. Expo documents Android, iOS, tvOS and web.

`expo-camera` is already a dependency and already has a working permission flow in
`scan.tsx`, but it only captures live. Photographing lunch and logging it on the train
is the common case, and that needs the library too.

### Shrink before sending

Resize so the longest edge is **1024 px**, re-encode as JPEG at **quality 0.7**, and
request base64.

Gemini bills an image by tiling it, so a 12-megapixel photo costs several times what a
1024 px one does and tells the model nothing extra: identifying rice, chicken and
broccoli, and judging the portion against the plate, is plate-level work, not
pixel-level. On web there is no filesystem path and the camera returns base64 anyway,
so base64 is the one representation that behaves the same on both runtimes.

This lives in `mobile/src/ai/mealPhoto.ts` as `preparePhoto()`, returning
`{ base64: string; mimeType: string }`.

## Sending it

`describeMealWithGemini(description, apiKey, image?)` takes an optional image. The
request body gains one part:

```ts
contents: [
  {
    parts: [
      ...(image ? [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }] : []),
      { text: description.trim() },
    ],
  },
],
```

The image comes first and the text second, because the text is context for the
picture rather than the other way round. With no image the body is byte-identical to
what it is today.

The Claude path (`describeMeal`) takes the same optional image as a content block:
`{ type: 'image', source: { type: 'base64', media_type, data } }`.

`services/gemini-proxy` needs **no change**. It reads the body as text and forwards
it (`geminiProxy.ts:51`), so an `inlineData` part passes through untouched. No new
route, no new secret, no env-var change on the Cloud Run service.

### The photo instructions

Appended to `SYSTEM_PROMPT` only when an image is present, as
`PHOTO_PROMPT_ADDENDUM` in `describeMeal.ts`:

> The user has sent a photograph of what they ate. Identify each food you can see and
> estimate the portion from what is on the plate, using the plate, cutlery or
> container as a size reference — say in the assumption what you judged the portion
> against. If the text contradicts the photograph, the text wins: it is what the
> person says they ate, and the photograph may be of someone else's plate or of the
> food before they finished. Where part of the meal is hidden, stacked or ambiguous,
> say so in the assumption and lower the confidence rather than guessing confidently.
> If the photograph is not of food, set notFood.

The last line reuses the `notFood` flag the schema already carries for text that does
not describe a meal, so a photo of a dog takes a path that already exists.

### Timeout

The text path allows 30 seconds (`geminiDescribe.ts`, `TIMEOUT_MS`). An image request
also has to upload a few hundred kilobytes, often over mobile data. Requests carrying
an image get **60 seconds**; text-only requests keep 30.

## When the provider cannot see

`estimateMeal` dispatches across Gemini, Claude and Ollama. The first two are
multimodal; the configured Ollama model is not. Asking it to read a picture would fail
somewhere deep and unhelpfully.

So `estimateMeal` rejects the combination explicitly, with a typed
`PhotoUnsupportedError` surfaced through the existing `describeErrorMessage` as:

> Photo estimates need Gemini or Claude. Change the estimate provider in Settings.

This is a pure check and gets a test.

## The screen

`describe.tsx` gains, above the existing text field:

- two buttons, **Take a photo** and **Choose a photo**
- once an image is chosen, a preview with a **Remove** control in place of the buttons

Empty text blocks the estimate in **two** places and both have to change: the button's
`disabled={busy || !text.trim() || !ready}` (`describe.tsx:234`) and the early return
at the top of `run()` (`describe.tsx:78`). Either one left alone makes the photo path
look broken. Both become "text **or** an image". Everything after the estimate returns — the draft items, the portion editing,
the include toggles, the meal picker, the accept — is untouched.

A photo and a line of text are better together than either alone: the picture says
what is there, "the rice was about two cups" fixes the portion the picture cannot
settle. The field keeps its current placeholder and stays optional.

### Getting there

`MealActionsSheet` currently offers two rows, Describe and Scan. It gains a third,
**Photograph it**, which pushes `/describe` with `{ meal, capture: 'camera' }`.
`describe.tsx` reads `capture` on mount and opens the camera immediately, so the
common path is: tap the meal's `…`, tap Photograph it, shoot, review, accept.

A denied camera permission shows the reason and leaves the text path working, rather
than blocking the screen.

## Testing

`mobile/vitest.config.ts` runs `environment: 'node'`, and anything importing
`react-native` fails to *run*. `expo-image-picker` and `expo-image-manipulator` are
native modules, so `preparePhoto()` itself cannot be tested here — it is verified in
the browser walk.

What can be tested is the part that decides what gets sent, so it is extracted into
`mobile/src/ai/mealRequest.ts` with no React Native import:

- `buildGeminiMealBody(description, image?)` — with an image, `parts[0]` is the
  `inlineData` part with the given mime type and base64, `parts[1]` is the text, and
  the system instruction ends with the photo addendum
- without an image, the body is byte-identical to today's and the system instruction
  equals `SYSTEM_PROMPT` exactly — this is the test that stops the eval being
  disturbed
- `buildClaudeMealContent(description, image?)` — same two cases in Anthropic's shape
- `estimateMeal` with `provider: 'ollama'` and an image rejects with
  `PhotoUnsupportedError`, and without an image still dispatches to Ollama

The screen, the picker, the resize and the live call are verified in a browser against
the staged build, where `/api/gemini` is live. Metro cannot serve that route — a
dev-server walk gets the SPA fallback back and the feature looks broken when it is
fine.

## Risks

**Every photo costs input tokens, and the user cannot see the bill.** The resize is
the mitigation and it is a large one, but the actual figure is unknown until a real
call is made. **Measure it during implementation** — send one real photo through
`gemini-3.5-flash` and record the input-token count in `HANDOFF.md`, the way the
26.5-second enrichment measurement was recorded. A guess here is not good enough.

**A confident wrong estimate.** A photograph hides what is under the rice and says
nothing about the oil in the pan. This is the risk the existing design already
answers: every item carries its assumption and a confidence, nothing is logged until
the user accepts it, and the prompt instructs the model to lower confidence rather
than guess when the plate is ambiguous.

**Two new dependencies on a codebase that ships to two runtimes.** Both are Expo
packages with documented web support, installed through `npx expo install`. If either
turns out not to work in the PWA, the feature is native-only until fixed, and that
must be discovered in the browser walk rather than by a user.

**A large base64 body through the proxy.** At 1024 px and quality 0.7 a photo is
typically 100–250 KB, so roughly 140–350 KB of base64. Cloud Run accepts far more than
that, and the proxy streams the body as text. Worth confirming once with a real
request rather than assuming.

## Order of work

1. **`mealRequest.ts`** — the body builders and the Ollama rejection, with their
   tests. Pure, no UI, no new dependency.
2. **Wire the providers** — `geminiDescribe.ts` and `describeMeal.ts` take the
   optional image and the longer timeout. Still no UI.
3. **`mealPhoto.ts` and the dependencies** — `npx expo install`, `preparePhoto()`.
4. **`describe.tsx`** — the two buttons, the preview, the enable rule, the `capture`
   param.
5. **`MealActionsSheet`** — the third row.

Steps 1 and 2 are safe to land alone; nothing calls them with an image yet. Steps 3
through 5 should land together, since a picker that nothing consumes is dead weight.
