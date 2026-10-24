# Local day rollover and Today density

The diary must follow the device's local calendar day after midnight and on
resume. A deliberately selected history day must stay selected. Existing log
dates are never rewritten. Tighten Today's macro summary vertically while
retaining readable values and touch targets. The user's shared-red decision is applied through existing theme roles. Broader
illustration and sharing concepts remain in the separate design preview.

1. Add a pure local-day observer and selection rule under `mobile/src/state/`.
   Test local midnight, forward/backward day changes, historical selection,
   explicit resynchronization, timer cleanup, and timezone-local day values.
2. Connect the observer in `AppStore.tsx` to native activation and browser
   focus/visibility. Recompute date-dependent check-ins on local-day changes.
   Make the date navigation say `Today` only on today's date and clearly label
   the jump action when browsing history.
3. Reduce only compact macro-summary gaps, value line spacing and surrounding
   Today padding. Preserve full summary callers, font scaling and 44-point
   controls. Apply the user's explicit shared-red decision through the existing
   palette, shared primary Button and active tab navigation. Validate fill/text
   contrast in both themes and document the approved brand roles in DESIGN.md.
4. Run the focused tests, workspace typecheck and appropriate full suite. Verify
   the actual store/Today flow with a controlled browser clock across midnight
   and resume, including a manually selected history day. Export and deploy web
   with old chunks retained. Provide the native release separately as needed.
5. Revise the existing private preview with shared red brand roles and the
   denser Today header; preserve data-category colors and sharing controls.
   Publish to the same URL after browser verification.

## Review status

24 October: user requested a design preview before release. App changes remain
uncommitted on `codex/local-day-and-today-density`; no Cloud Run deploy or EAS
build started. All 1,862 tests, root typecheck and web export passed. A browser
fixture using the actual AppProvider and Today verified Friday-to-Saturday
activation, intentional history selection across Sunday, Go to today, and
Monday browser-focus recovery. Database and auth boundaries were mocked.

The owner-private design preview is published at
https://ascend-journal-preview.shadypoppy2051.chatgpt.site with shared red actions,
active tabs and the denser Today macro card. Broader icon concepts remain
preview-only. Await design feedback before releasing visual changes.

24 October follow-up: user approved the red/compact Today and Trends previews,
subtle motion and the in-header wordmark, then authorized implementation. The
active implementation/release plan is `2026-10-24-approved-brand-trends-motion.md`.
