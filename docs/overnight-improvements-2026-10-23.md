# Stability improvements and Astra review — 23 October 2026

The owner authorized continuing improvements without questions while asleep.
This pass addresses two reproduced failure paths without changing account
ownership, SQLite selection, permissions or production infrastructure.

## Changes

Cloud card image requests, uploads, upload retries and removals now have a
20-second deadline covering fetch and response body consumption. The transfer
is aborted on timeout; the promise also settles if transport ignores abort.
An upload timeout preserves its already saved local image and records failed
sync status so the existing retry action can recover. Late response bodies
cannot overwrite that failed status. Upload response parsing is shared between
initial upload and retry to keep these paths consistent.

This bounds the cloud request, not the entire user operation: authentication
token acquisition, local file reads and image conversion remain outside that
deadline. Do not present it as an end-to-end 20-second guarantee.

The web PostCard component previously retried drawing automatically whenever
failure reset its loading flag. The actual component, with an intentionally
failing renderer and identical parent props refreshed every 200 ms, reached 99
attempts in the browser reproduction. It now attempts automatically once per
serialized workout summary and then exposes the existing manual Render button.
The browser check recorded one initial attempt, a second for a changed summary,
and a third only after pressing Render. Identical parent updates do not restart
the attempt. Native rendering behavior is unchanged by this guard.

## Verification

Five added pure regression cases cover unanswered image requests, stalled image
bodies, stalled upload JSON bodies, and single/all-card deletion hangs. The
upload case also checks durable local image retention, late completion, retry
success and timer cleanup. The original hang regressions failed before the
implementation and passed afterward. Existing request expectations now include
the abort signal.

The browser fixture uses the real PostCard component, React and React Native
Web, with deliberate drawing failure and mocked unrelated native/service
boundaries. It is a behavioral regression check, not physical Android acceptance
or production timing. Local evidence is under `.superpowers/post-card-retry/`.

Astra independently reviewed both changes and reported no critical or important
findings. Verification completed:

- All 1,761 tests pass: engine 252, mobile 1,354 and proxy 155.
- All workspace typechecks pass.
- Android and web exports pass, using dedicated ignored output directories.
- The actual-component browser reproduction verifies automatic-attempt
  suppression, manual retry and changed-summary retry under parent rerenders.

No device performance result is implied. The recorded failures are injected
regression conditions; no live account or user's workout was modified.

## Priorities from Astra's source review

1. Prove offline startup with a persisted expired session using the actual
   installed authentication client. The current getSession initialization can
   refresh before database selection, so the unconditional offline promise in
   AuthGate's comment needs evidence. Never work around it by selecting another
   owner's or signed-out database. This is an identified risk, not a reproduced
   phone failure in this pass.
2. Release generated web-card object URLs on replacement/unmount while keeping
   borrowed URLs alive. The component currently cleans up fetched remote URLs
   but does not own cleanup of every locally generated URL. Test ownership and
   replacement explicitly before changing this lifecycle.
3. Bound web font readiness as well as network requests. Fonts that never settle
   can still hold a web drawing operation; the retry-loop guard does not solve
   that independent wait.
4. Measure native feed memory and scrolling after successive pages. Loaded posts
   retain DOM renderers to preserve bridge acknowledgements. Consider limiting
   simultaneous renderers or virtualizing visible posts after measurement;
   immediate unmount after callback previously broke the bridge.
5. Evaluate meal models against weighed portions and known recipes before a
   model switch. Report portion error and nutrient coverage separately, retain
   unknown sodium as unknown, and reserve examples outside prompt development.
   No model change or accuracy improvement is claimed here.

The existing standalone APK predates these two follow-up changes. The PR source
and local Metro receive the fixes; that previously shared APK does not update
its embedded JavaScript automatically. A subsequent APK is required to deliver
this pass to standalone Android. There are no Supabase migrations or production
merges/deployments in this pass.
