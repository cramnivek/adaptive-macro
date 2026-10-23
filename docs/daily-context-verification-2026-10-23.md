# Daily logging and health-context verification

Feature branch: `codex/daily-logging-context`, based on the accepted photo/storage
fix branch. PR #53 is stacked on #52. No main merge, Supabase migration, or new
Cloud Run deployment was performed for these features.

## Checked

- Full local tests: 252 engine + 1,330 mobile + 155 proxy = **1,737 passed**.
- All workspace typechecks passed; mobile typecheck was repeated after the
  source-reconciliation fix. CI at `07df9fe` also passed install, typecheck and
  the full tests: https://github.com/cramnivek/adaptive-macro/actions/runs/39812309475 .
- Final web and Android exports passed. Android Hermes entry is
  `entry-309fd5b61061ab74d552c3856937e15a.hbc` (7.9 MB).
- Real SQLite tests cover saved estimate evidence, old/malformed optional
  metadata, backup/restore, sleep source corrections/deletions, older history,
  clearing, and refusing writes through a closed account handle.
- Pure tests cover sleep stage/overlap/date handling and sodium coverage,
  complete-day requirements, baseline, and weight/sodium display boundaries.
- Browser verification used a separate localhost guest profile and synthetic
  setup data. Desktop and a 393 px iframe showed all four meal-entry actions.
  Description, search, barcode and photo routes preserved `meal=lunch`;
  replacement navigation returned to the diary. The barcode permission-empty
  state retained Search by name instead. No camera permission was granted and
  no model request was made during this UI check.
- Independent code review found stale source-deleted sleep intervals. Two real
  SQLite reproductions failed before the fix and pass after it. Re-review found
  no remaining critical or important issues.

## Limits and pending device work

The generic premium web UI auditor reports 98 `affordance.actionless-button`
findings. Its action detector does not recognize the React Native `onPress`
handlers on these Button components. Canonical map resolution has no unresolved
findings, but this is **not a clean static audit** and is not evidence of native
accessibility. Button roles and the changed navigation were inspected in the
browser. Physical Android spacing, large-text behavior, and Garmin permission
and import still need device acceptance.

Android internal development build:
https://expo.dev/accounts/zeldrich/projects/adaptive-macros/builds/152e4045-0da2-4d57-82ff-8e98a0b103a2
has now finished successfully and provides an APK. Its native source includes
READ_SLEEP; current JavaScript updates are served by Metro. Install the updated
client over the current app before requesting the new sleep permission.

Then enable Garmin sleep sharing into Health Connect, review Ascend permissions
in Account, and sync. Verify a known night against Garmin, deny sleep while
retaining steps/weight, repeat sync without duplicate duration, and check a
source correction. Garmin documents sleep stages among shared data:
https://support.garmin.com/en-GB/?faq=JToBEy0jfe6pIygark2Ui5 .

The micronutrient prompt now asks to omit unknown values rather than report
zero. This does not prove model accuracy or repair unknown historical zeros.
Weight context describes logged observations and possible water retention; it
does not diagnose causation, measure fat change, or modify engine targets.

## Android follow-up

- Full tests pass: 252 engine + 1,340 mobile + 155 proxy = **1,747**.
  All workspace typechecks and web/Android exports pass.
- New tests cover separate weekly windows, rising daily weight alongside a
  falling weekly mean, sparse/invalid weights, sodium availability, exact sleep
  permission grants, and PNG file creation before native sharing.
- Weight now always shows its weekly summary and sodium availability on Weight
  and Today. Browser inspection at 393 px confirms the card, recorded-day count,
  daily-variation explanation and incomplete-log guidance are visible.
- The actual Expo DOM sticker renderer passed browser checks for all 16 workout
  theme/layout pairs and four nutrition themes: valid PNG decode, dimensions,
  clear/ink/translucent pixels and loaded fonts. Stable bridge requests avoid
  redraws. Reproduction fixture: ignored `.superpowers/sticker-android/`.
- Independent follow-up review found no important correctness issues.
- Native sharing into destination apps remains unverified on the phone. The
  new sleep request checks SleepSession specifically, reports refusal, exposes
  Health Connect settings and refreshes permissions after returning to the app.
  The READ_SLEEP development build was queued during this check and has since
  finished successfully. Metro cannot add its manifest permission to old clients.

## Movable workout overlay

- Replaced platform bottom constants with the measured Expo tab bar height.
  A separate 44-point handle moves vertically, bounded above the tab bar and
  below the top safe area. Position persists across tabs and resets by session.
- Four bounds tests cover Android tab insets, both drag limits, resize and an
  oversized overlay. Full tests pass: 252 engine + 1,344 mobile + 155 proxy =
  **1,751**. All workspace types and Android/web exports pass.
- Browser verification used a synthetic local workout. At 360 px, dragging
  moved the bar without navigating, a Weight tab click still worked, the moved
  position persisted, and dragging down stopped above the tabs. At 320 px, the
  resting overlay retained readable countdown and 44-point controls; +30s and
  Skip both worked. Resume still opened the workout. Screenshot artifacts are
  ignored `.superpowers/workout-overlay-moved.png` and
  `.superpowers/workout-overlay-rest-320.png`.
- Review identified narrow rest controls crowding the timer; compact rest-mode
  Resume and removal of its decorative pulse addressed it. Re-review found no
  remaining important issues. Actual Android gesture feel remains a device
  check. No new native dependency or build is needed for this overlay change.

## Photo body-fat Save feedback

The user reports Save leaves the result sheet open. A synthetic write failure
in the actual BodyFatPhotoSheet reproduced an unchanged result, with its notice
outside the modal. Save now shows pending state, prevents duplicate submissions,
and presents write failures inside the result sheet while preserving the estimate
for retry. Browser verification confirmed visible failure, disabled Saving state,
and a successful retry closing the sheet. The ignored fixture at
`.superpowers/bodyfat-save/` uses synthetic images/results and a mocked write;
it does not establish the cause of the user's device storage failure.

The 17 existing body-fat/parser/measurement-schema tests pass, as do workspace
types and the Android export. The previous full 1,751-test run predates this
UI-only follow-up. The user subsequently confirmed that Save now succeeds on
the Android phone. The original device-side write failure was not captured.

GitHub subsequently caught a native ViewStyle type mismatch for the overlay's
web-only `touchAction`. Local installed types accepted it. The CSS extension is
now typed explicitly and applied only on web; workspace types pass locally.

## Sticker and finish-card follow-up

The user's Android screenshots still showed a sticker spinner and an empty
finish preview. Investigation found three concrete defects:

- Identical nutrition props recreated by a parent refresh reset the native
  sticker to loading, but its DOM child deliberately skipped redrawing identical
  serialized inputs. A browser fixture using the actual modal reproduced a
  preview disappearing after 500 ms and remaining on Generating. The parent and
  child now use the same serialized request key; the preview survives repeated
  refreshes and a theme change still redraws.
- Hidden Expo DOM views inherited flex sizing. All three native renderer sites
  now have absolute, bounded 1-point holders and container styles, avoiding the
  blank layout space. Font loads are shared, bounded and retryable; unchanged
  card summaries no longer restart rendering on bridge object updates.
- FinishSheet called the browser-only shareCardFile function on Android, where
  it returns null. It now mounts the native drawer, previews its PNG, and shares
  that image. PNG bytes now use a PNG filename/MIME/UTI instead of JPEG labels.
  An image share failure reports failure instead of silently sharing text.

Sticker, finish and post-card loads have bounded failure/retry states. The finish
sheet can scroll so the preview and controls remain reachable. A native-branch
browser fixture rendered the actual finish PNG; this exercises Android branch
wiring with mocked native file/share boundaries, not an Android WebView. Files
are ignored under `.superpowers/finish-native/`. Three font-load tests and two
native-sharing regressions were observed failing before their fixes. Independent
review found no important issues. Physical Android renderer/share acceptance
remains pending; no current device peer was connected at the status check.
Full local verification passed: 252 engine + 1,349 mobile + 155 proxy = 1,756
tests, all workspace typechecks, and final Android/web exports.

The Android EAS build is FINISHED, not failed. PR checks at e236a15 passed after
the prior touchAction type fix. The development outage was separate: Metro had
no listener on 8081. It was restarted hidden as PID 38880, logs
`.superpowers/metro-20261023-071327.*`, and /status returns packager-status:running.
The reason the previous process exited was not established. No reinstall, app
data clearing, Supabase change or Cloud Run deploy was needed for these fixes.
