# Restore Android workout-card photo customization

**Goal:** Restore Add/change/remove photo and the existing shape, block, placement and depth editor on Android, with the shared image and posted image matching the preview.

**Root cause:** FinishSheet's photo controls are explicitly web-only. Its picker and compositor use HTMLImageElement and canvas. The native preview restoration in bfda341 renders only the default summary PNG and never supplies editor layers or accepts a photo.

**Architecture:** Use the installed Expo native image picker/manipulator to supply a bounded JPEG data URL. Extend the existing DOM renderer to compose it using the existing canvas functions and return serializable image/layer URLs. Reuse CardEditor and native gestures. Cache photo/layers inside that renderer, freeze render placement while dragging and reject stale bridge responses. Keep the existing flat-card caller compatible.

**Constraints:** No new packages, backend or schema changes. The selected photo stays on the device until the user shares/posts. Depth remains optional. Photo decode, rendering and picker failures must leave a usable retry/remove path; a canceled picker changes nothing. Preserve the web editor and existing share MIME handling.

## Tasks

- [x] Add regression tests for bounded native photo preparation and shared compositor inputs/output, cache reuse, photo replacement, depth fallback and request identity.
- [x] Add the native picker and serializable compositor, then extend CardDrawerDom without changing its existing default caller.
- [x] Wire FinishSheet photo controls/editor/preview/share/post on Android; keep bridge inputs stable during native gestures and prevent stale sharing.
- [x] Verify focused/full tests, workspace types, web/native exports and browser fixtures at native boundaries.
- [ ] Publish a focused PR and new Android build; preserve existing live chunks for any web deployment.

## Verification

All 1,802 workspace tests pass, including 14 new native photo/composition tests. Workspace typechecks and both Android and web exports pass. Browser fixtures use the real FinishSheet, CardEditor, compositor and fonts with mocked native picker/share boundaries: Add/change/remove, shape changes, JPEG sharing/posting, default PNG recovery, cancellation, picker errors and composition failure/retry messaging were exercised at 393 points wide. A lower-cost reviewer checked bridge serialization and stale-response handling; photo bytes now cross only on a renderer cache miss. Pending or failed edits are labelled and cannot share an obsolete composition.

These checks do not establish physical Android WebView/gesture behavior. The development client can receive the source through Metro; a standalone installation needs the new APK containing the updated DOM bundle.

## Remaining design scope

The approved foundation is established, not yet applied to every screen. Astra's brainstorming recommends three next clusters: food search/quick add/scanning and routines/history; Social/feed/profile; Settings/account/setup. Reuse the existing fonts, soft featured surfaces, semantic accents and clear next action. For each cluster, review a representative screen and its empty/error state; preserve dense lists, privacy controls, explicit onboarding inputs and the active session logger. No further app-wide visual identity brainstorm is needed.
