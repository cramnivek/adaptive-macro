# Shoot, see the estimate on the shot, shoot again

Design, 2026-10-01.

## Problem

Photographing a meal works and is fast, but the camera is a one-shot door: Expo's
`launchCameraAsync` hands the OS camera the screen, takes one picture, and closes.
The estimate appears somewhere else, after a scroll. If the shot was bad — half the
plate out of frame, a reflection across the rice — you start the whole walk again.

What is wanted is pointing the phone and getting an answer, with the camera staying
where it is.

## Non-goals

- **A live overlay that updates as you move the phone.** Sampling frames into the
  existing call costs roughly ten to fifteen times a single shot for the same logged
  meal, and the numbers would describe where the phone pointed several seconds ago —
  live-looking without being live, which is worse than not having it. Gemini's Live
  API is a streaming protocol the HTTP passthrough proxy does not speak, billed per
  second of video. An on-device classifier can say "that looks like rice" but cannot
  estimate macros, and portion from one 2D frame without depth is the hard part.
- **A second review surface.** Portions, confidences, include and exclude, the meal
  picker and the accept all stay exactly where they are.
- **Replacing the photo library path.** "Choose a photo" is unchanged.
- **Keeping the frames.** Same reasoning as the photo itself: nothing is stored.

## Why a modal, not a screen

The obvious build is a `photo-meal` route that shoots, estimates, and hands the result
to `describe.tsx`. That needs the estimate carried between screens, and a router param
cannot hold it — which means a module-level stash, or putting the estimate in
`AppStore` where nothing else transient lives.

So the camera becomes a **`Modal` inside `describe.tsx`**, the shape `EditEntrySheet`
and `ExerciseInfoSheet` already use. `describe.tsx` keeps owning `photo`, `estimate`,
`drafts` and `busy`; the modal renders over them and calls the same `run()` the button
calls. Nothing is handed anywhere, and the overlay reads the estimate that the screen
already has.

This also means the Today tab's **Photograph it** needs no change: it already opens
`/describe?capture=camera`, and `capture=camera` now opens the modal instead of the OS
camera.

## The flow

```
live camera ──shutter──▶ still + "Estimating…" ──▶ still + items overlaid
     ▲                                                   │
     └──────────────── "Shoot again" ◀───────────────────┤
                                                         │
                          "Use this" ──▶ modal closes, describe has both
```

**Live.** `CameraView` full-bleed with a shutter button, following `scan.tsx`'s
layout: camera under `StyleSheet.absoluteFill`, controls in an overlay `View` with
`pointerEvents="box-none"`. Permission is handled by `useCameraPermissions`, the same
hook `scan.tsx` uses, with the same "camera access is off" copy as the existing error.

**Shutter.** `takePictureAsync({ base64: true })`, then the existing `prepare()` from
`mealPhoto.ts` — same 1,024 px longest edge, same JPEG quality 0.7, so the measured
1,076-token cost per shot holds. The still replaces the live preview immediately, so
the frame you are judging is the frame that was sent.

**Estimating.** The overlay panel shows the same elapsed clock `describe.tsx` already
runs for `busy`, over a dimmed still.

**Result.** Each estimated item appears as a line in the panel: name, portion in
grams, kcal, and its confidence chip in the existing colour. The assumption text is
*not* on the viewfinder — it does not fit, and truncating the sentence that makes a
number honest is worse than not showing it there. The panel says how many items and
the total, and that detail is one tap away.

**Shoot again** discards the still, the photo and the estimate, and returns to live.
It costs nothing and is the point of the feature.

**Use this** closes the modal. `describe.tsx` already holds the photo and the
estimate, so the screen behind is exactly as if the button had been pressed — the
drafts are there, portions adjustable, the meal picker ready.

**Dismissing the modal** any other way (back gesture, Android back) keeps whatever was
captured, same as Use this. Nothing is thrown away by accident.

## What changes

- **Create** `mobile/src/components/MealCameraSheet.tsx` — the modal: live view,
  shutter, still, overlay panel, the three controls. Props:
  `{ visible, photo, estimate, busy, elapsed, onCapture, onRetake, onClose }`. It owns
  no estimate state; it is given what `describe.tsx` has.
- **Modify** `mobile/app/describe.tsx` — a `camera` boolean, the modal mounted beside
  the existing content, `capture=camera` opening the modal rather than calling
  `takeMealPhoto`, and `onCapture` setting the photo then calling `run()`.
- **Modify** `mobile/src/ai/mealPhoto.ts` — export `prepare` as `preparePhoto(uri,
  width, height)` so the sheet can use it on a `CameraView` result. `takeMealPhoto`
  stays for any caller that still wants the OS camera; the "Take a photo" button on
  the describe screen now opens the modal instead.

`expo-camera` is already a dependency. No new packages, no schema change, no proxy
change.

## Testing

`vitest` runs `environment: 'node'`, so neither the modal nor the camera can be tested
here, and `mealPhoto.ts` already cannot be. There is no pure logic in this change —
it is arrangement — so it adds no tests and the suite stays at its current count.
Claiming a test for it would mean writing one that asserts nothing.

Verified instead in the browser against the staged build, and then on the phone, which
is the only place the camera path is real:

1. Today → a meal's `…` → Photograph it. The modal opens on a live camera.
2. Shoot. The still appears at once and the clock starts.
3. Items appear over the still with their confidence chips.
4. Shoot again returns to live and spends nothing.
5. Use this closes the modal, and the describe screen below already has the photo,
   the items and their portions.
6. Deny the camera permission. The modal says so and the text path still works.
7. On the iOS PWA: the same walk, because `CameraView` on web is `getUserMedia` and a
   home-screen PWA is where this has historically been most fragile.

## Risks

**`takePictureAsync` on web.** `scan.tsx` uses `CameraView` for barcodes, so the view
itself is proven on both runtimes, but this project has never called
`takePictureAsync`. Expo documents web capture as returning base64 rather than a file
path, which `preparePhoto` already handles since it takes a URI and the manipulator
accepts a base64 data URI. **Check this first** — if web capture does not work, the
web build keeps the existing library-and-OS-camera path and the modal is native-only,
and that must be discovered in step 7 rather than by a user.

**A camera left running.** The modal must unmount `CameraView` when it closes, or the
preview keeps the camera and the battery. Closing by any route has to take it down.

**The overlay inviting trust it has not earned.** This is the reason the assumption
text stays off the viewfinder and the confidence chip stays on it. A number on a
camera image reads as a measurement; the chip is what says otherwise, so it is not
optional decoration.

## Order of work

1. **`preparePhoto` export** and a `CameraView` capture that produces a `MealPhoto`.
   Prove web capture works before anything is built on it.
2. **`MealCameraSheet`** — live, shutter, still, the three controls, no estimate yet.
3. **Wire it into `describe.tsx`** — the modal, `capture=camera`, and `onCapture`
   running the estimate.
4. **The result panel** — items, confidence chips, total.

Step 1 is the one that can invalidate the rest, so it goes first and alone.
