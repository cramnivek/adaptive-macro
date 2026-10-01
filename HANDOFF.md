# Handoff

Last updated 2026-10-01. Branch `feat/web-deployment`, **81 commits ahead of `main`**, working tree clean. Not yet pushed; the deployed site is older still.

397 tests pass (`npm test`) — engine 104, mobile 227, gemini-proxy 66. `npm run typecheck` is clean, web and android both export.

**A caveat on typecheck**, which cost time once and will again. It fails with seven
`TS2345` route-string errors whenever `mobile/.expo/types/router.d.ts` is stale —
that file is generated, gitignored, and only the Metro dev server writes it.
`expo export` does **not**. If typecheck sprouts route errors for `/routines`,
`/session`, `/progression` or `/import-workouts`, run `CI=1 npx expo start --web`
briefly and kill it.

**Every planned feature is built, the interface has been redesigned, and AI is now
the default rather than a button you press.** What remains is not code: pushing,
deploying, merging, and the checks that need real hardware.

---

## Do these first

1. **Push.** Twenty-five commits since the last push, including the whole exercise
   catalogue and the fix pass that followed its review.
2. **Deploy.** The live site is missing everything from 2026-09-29 and 2026-09-30: the logger, routines, the cross-reference, the backup rewrite, the `Invalid VFS state` fix, the redesign, and the exercise catalogue. See *Deploying*.
3. **Merge to `main`.** Eighty-one commits have never left this branch. Nothing depends on it, but the gap grows.
4. **Run migration v4 against a device holding real data.** v3 and v4 have only ever
   been applied to fresh databases. v4 is additive — one table, one nullable column,
   the safest shape there is, and a reviewer checked that `ALTER TABLE … ADD COLUMN
   catalogue_id TEXT REFERENCES …` with no DEFAULT is the form SQLite permits under
   `foreign_keys = ON`. It still has not been run against history.
5. `git push origin --delete claude/brave-pascal-zwfg38` — a dead duplicate branch that was accidentally deployed once. Deleting it from a dev container fails at the git proxy; it needs a real machine.

---

## What exists

**Deployment.** One Cloud Run service at `https://gemini-proxy-297164004726.asia-southeast1.run.app` serves the API and the exported web app from one origin, so there is no CORS. `router.ts` dispatches; the SPA fallback deliberately does not answer for missing assets or unknown `/api/` paths.

**Server-side third parties.** `/api/gemini`, `/api/off/search`, `/api/off/legacy`, `/api/usda/search`. Each attaches a key held on the service; none reaches the bundle. A user's own key in Settings always wins over the shared route.

**Lifting.** Migration v3 holds `exercises`, `routines`, `routine_exercises`, `sessions`, `sets`. The **Train tab** is the training home:

- **Log a workout** — blank or from a routine, prefilled from what was lifted last time
- **Routines** — named ordered lists, reorderable, buildable from a past session
- **See progression** — heaviest working set and working volume, on effective load

**Import from Hevy** stays in Settings → Your data, where a one-time migration
belongs, next to backup and restore. It previews before anything is written and is
idempotent on session start time.

**Trends** additionally shows weekly volume, and weekly training energy as a band against the filter's expenditure. That energy figure is display-only and nothing consumes it — `expenditure.ts` already absorbs training through the intake-versus-weight gap, so counting it again would raise the target for work already accounted for.

**Backups** (Settings → Your data) hold everything including the lifting history, download properly in a browser, and can be restored. Restore replaces rather than merges and states what the file holds before it does.

---

## The exercise catalogue, and AI by default

Migration **v4** adds `exercise_catalogue` (canonical name, movement pattern, primary
muscle, equipment, a bodyweight flag, instructions) and a nullable
`exercises.catalogue_id`. Enrichment is a **single structured call** — no grounding,
no grounding charge — because which muscle a press loads is general knowledge rather
than a published figure.

**AI fires without being asked**, which is the point of the feature and the thing to
watch. Three paths spend a call: food search with zero results, the exercise picker
with zero catalogue matches, and batch seeding in Settings. Each is guarded by
zero-results-only, a settle delay, and one attempt per distinct query per screen.

**`exercises.name` is never written.** The link is the new column, and the picker
displays `canonical_name` while logging the **recorded** name. That distinction is
load-bearing: `sets` carries its own `exercise_name`, and PREVIOUS, the progression
list and the icon map all key on it, so logging the model's spelling of a lift
already on record forks it in two and blanks both halves. A whole-branch review
caught that the first implementation did exactly this.

**Measured, not assumed:** a 20-name enrichment call takes **26.5 s** against
`gemini-3.5-flash` (318 prompt / 2,066 output / **5,114 thinking** tokens, HTTP 200,
`finishReason: STOP`). The thinking tokens are most of the latency and no
output-token estimate sees them. `ENRICH_TIMEOUT_MS` is 60 s for that reason. A batch
that fails to parse or times out is retried on the next run; only a rejected key or
an exhausted quota (`GeminiAccessError`) stops the queue.

**Known rough edges**, none blocking:

- Case-colliding recorded names (`Chin Up` and `Chin up` both on record) collapse in
  the enrichment name map, so one is reported "not recognised" on every run.
- A local database failure during seeding is reported as a lookup failure and the
  remaining batches each spend a real call before hitting the same fault.
- Nothing caps consecutive timeouts: four batches on a hanging connection is four
  minutes with the button disabled and its label stuck on "Batch 1 of 4…".
- The `Add "<typed text>"` button's label names what you typed while it correctly
  creates the recorded name. The data outcome is right; the label disagrees.
- `notify` and `confirm` are `window.alert`/`window.confirm` on web, so the "No
  how-to yet" notice is a browser dialog on the iOS PWA.

---

## The workout logger, and what is rough about it

**The design brief: the logging UI should follow Hevy closely.** The logger was
rebuilt in that direction (`efdd3e4`) and **has not been reviewed against the real
app by anyone who uses it.** That review is still owed.

`mobile/app/session.tsx` is a list of exercises, each a grid of rows:

```
SET   PREVIOUS      KG    REPS   ✓
1     100.0 × 8    [100]  [5]    ✓
```

- `PREVIOUS` is the same set index from the last finished session
- A row is a draft until ticked; ticking writes it, editing a ticked row updates it,
  unticking deletes it
- A new row copies the one above, falling back to the previous session's set at that
  index
- Tapping the set number toggles warmup
- The header carries elapsed time, set count and Finish

**Known rough edges, all in the logger:**

1. **The header scrolls away.** Finish and the timer sit in the scroll flow, so they
   disappear as rows are added. Hevy pins them. Most obvious thing to fix first.
2. **No rest timer.** A deliberate non-goal in the spec, but one of the things Hevy
   does that people miss.
3. **No reordering exercises** within a session.
4. **The exercise picker is a plain inline list** — no muscle-group filter, no
   recent-first grouping beyond most-used ordering.
5. **`setIndex` is the row position**, so warmup rows consume indices. Harmless for
   progression, which excludes warmups, but it makes `PREVIOUS` line up oddly when a
   session's warmup count changes between sessions.

Judge all of these against the real Hevy app; the rebuild worked from a description
of its layout, not the app itself.

## The redesign

Nine commits, 2026-09-29/30. Spec in `docs/superpowers/specs/2026-09-29-visual-identity-and-ia-design.md`,
plan in `docs/superpowers/plans/2026-09-29-visual-identity-and-ia.md`.

The direction is called **Instrument**: this app measures rather than motivates, so
the chrome is grey and recedes and the only colour on screen is the data. `Card`
lost its fill and border and became a rule-led section; every figure is in IBM Plex
Mono; UI text is Space Grotesk. The accent is a neutral — near-white on dark,
near-black on light — which is why `Palette` gained **`onFill`**, the foreground for
text on any filled control. Ten call sites hardcoded `'#FFFFFF'` there and would
have gone invisible.

`src/theme.ts` is now `src/theme/` — `palette.ts` holds the data and **must keep zero
imports**, because `src/theme/__tests__/palette.test.ts` imports it under node. That
test is the only automated guard on the whole visual layer: it asserts every text
pair at 4.5:1, every bar fill and ring stroke at 3:1, the three macro colours apart
by lightness, and the two text tiers apart from each other. It has already caught
three real problems, including a 3.44:1 failure that predated the redesign.

**Two margins are thin and deliberate.** Light `textFaint` is 4.53:1 on
`surfaceRaised` against a 4.5 floor, and 1.27:1 against `textMuted` against a 1.25
floor. Both have assertions. Do not nudge those hexes without running the test.

**What to look at first, in order.** None of this has been seen:

1. **Settings, dark, every section expanded.** Three findings compound here.
2. **Whether the hairline rule is visible at all on a dark phone.** `border` on
   `background` is 1.49:1 at `hairlineWidth`. That ratio is unchanged from the old
   palette, but the rule went from decorating a filled card to being the only thing
   separating sections. If it disappears, the direction has no structure.
3. **Describe** — a 26px mono total above 12px mono macros in one card.
4. **Today at 320–375pt, light.** `surface` `#FFFFFF` on `background` `#FAFAF8`
   leaves buttons defined by a 1.24:1 hairline alone.
5. **iOS PWA cold load, throttled then offline.** Confirms the `fontError` branch
   fires rather than hanging on a background-coloured `View`. On that path the app
   renders in the system font *and* loses its weight hierarchy, because every style
   that gained a family had its `fontWeight` removed.
6. **Tab bar.** Active/inactive is near-white vs grey now, not blue vs grey — 2.7:1
   between states. It is the app's only wayfinding signal and it lost its hue.

**Known and deliberate:** `stepperGlyph` stays in the system font because the `−` is
U+2212 and it was not confirmed that either bundled face carries that glyph; a
missing glyph renders as tofu. The same carve-out covers five symbol-only `<Text>`
elements in `routines.tsx` (`↑` `↓` `✕`). `Card.title` has no `flexShrink`, which is
safe only while `right` slots stay narrow.

### What the browser walk found

Walked dark mode at 390px on 2026-09-30. The direction reads: Settings shows all
seven sections on one screen, the hairline rule is visible, `onFill` is legible on
every filled control, and the Section header is a real `<button>` with a 44px target.

Three findings the automated gates could not see, all now fixed:

- **The typeface pass was ~22% done.** 76 of 98 style entries had a `fontSize` and no
  `fontFamily`, because the redesign typeset the shared primitives but not the style
  sheets each screen defines for itself. Today alone rendered three faces at once.
  Then a second gap: in React Native Web **any `<Text>` without an explicit family
  falls back to the system font**, so 19 inline colour-only `<Text>` elements were
  still untypeset even after the style sheets were done. No test can see a font, and
  no diff reviewer could see it either — nothing was wrong in any one file.
- **A stale cross-reference.** `train.tsx` pointed at "Settings → Lifting history"
  after that card moved into "Your data". No review could catch it: `train.tsx` was
  not in the diff of the task that moved it.
- **Nothing else visual regressed.** Verified by reading computed styles in the live
  DOM rather than by eye.

**Still open, and NOT fixed:**

- **`kg` is clipped on the Weight stepper.** Measured in the live DOM: the suffix
  overflows its container by 12px with the system font and 13px with Space Grotesk,
  so this is **pre-existing** and the redesign contributes 1px. Cause is a `flex: 1`
  `TextInput` measuring 226px inside a 223px parent — React Native Web does not imply
  `min-width: 0`. Fix by giving the input `minWidth: 0` or the suffix `flexShrink: 0`.
- **The modal header divider** (visible on Describe) is React Navigation's own
  default and reads much brighter than the `border` token against near-black.
- **Light mode has never been looked at.** `prefers-color-scheme` could not be forced
  without devtools emulation. Its colours are all test-asserted; its layout is
  identical to dark by construction, but no human has seen it.
- **The hairline at 1:1 on a real phone.** It read clearly in captures, but those were
  zoomed ~2x. At `hairlineWidth` and 1.49:1 it may be fainter in daylight.

## Verified, and how

Everything below was driven in a real browser against the full 3,073-row export, because three separate bugs shipped past a green test suite and were only caught this way.

- Import: 246 sessions, 3,057 sets; a second import of the same file plans 0
- Logger: prefills bench at 89.4, switching to lateral raise replaces it with 6.8, switching to Pull Up clears it, bodyweight set logs as bodyweight
- Progression: both charts draw, record markers present, pull-ups score off the weight trend
- Backup: download a v2 file with all 3,057 sets, open a **fresh browser profile**, confirm empty, restore, history returns with bodyweight flags intact

**The catalogue (2026-10-01)**, walked against the *exported* build served by the real
proxy, so `/api/gemini` was live and the calls were real. Metro cannot serve that
route — a dev-server walk gets the SPA fallback HTML back, the parse fails, and the
feature looks silently broken when it is fine. Use the staging recipe in *Verifying
without a deploy*.

- Typed `Deadlift (Barbell)` into an empty catalogue: the row `Barbell Deadlift ·
  Hamstrings · Barbell` appeared about eight seconds later, carrying the **hinge**
  glyph — so the model classified it correctly and the glyph map resolved it
- Seeding from Settings: "Catalogue built — 1 of 1 catalogued"
- The picker then offered `Barbell Deadlift` and adding it created a block named
  **`Deadlift (Barbell)`**. This is the one that matters; see *The exercise catalogue*
- The how-to sheet: 28px glyph, muscle and equipment, instructions that genuinely
  describe a barbell deadlift down to "avoid rounding your lower back", and the
  caveat. **A human read them.** No test can do this one
- An uncatalogued block header says "No how-to yet" rather than doing nothing
- With `/api/gemini` forced to 500 the picker says "Could not look that up. You can
  still add it." rather than failing silently

Not looked at by eye: light mode (the palette contrast test covers the tokens), the
progression chips, and whether `pull` and `isolation` are tellable apart at 14px.

---

## Still unverified — needs hardware

- **iOS.** Safari → Add to Home Screen → log a weight → fully close → reopen. The reason the web deployment exists, and nobody has done it.
- **Migrations v3 and v4 against a device that already holds earlier data.** Only ever applied to fresh databases.
- **Native.** `expo-document-picker` was added this session, so an APK needs rebuilding before import or restore work on a device.
- **The wasm content type** in `staticFiles.ts`. Probing guessed paths returned 404, so it is unconfirmed end to end.

---

## Deploying

The web build is **not** committed. Stage it into `services/gemini-proxy/web/` — `web/`, never `dist/`, which `.gcloudignore` excludes.

```powershell
cd C:\Users\marca\adaptive-macro
git pull origin feat/web-deployment
npm install

cd mobile
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx expo export --platform web
Remove-Item -Recurse -Force ..\services\gemini-proxy\web -ErrorAction SilentlyContinue
Copy-Item -Recurse dist ..\services\gemini-proxy\web

cd ..\services\gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 --allow-unauthenticated --timeout 120
```

A routine deploy must **not** pass `--set-env-vars`: it replaces the whole set, so naming one variable silently drops the others. Use `--update-env-vars` to change one. Verification steps are in `services/gemini-proxy/README.md`.

---

## Traps, each of which has already cost time

**`expo-file-system` does not exist on web.** Both `readAsStringAsync` and `writeAsStringAsync` throw there. This broke the Hevy import and the data export on the deployed site, invisibly — each caught the error and showed a dismissible alert. All file reading and writing now goes through `src/platform/files.ts`; use it rather than calling expo-file-system directly.

**`expo export --platform android` overwrites `dist/`.** Export web *last*, or stage `web/` first. A stale stage ships a site whose `index.html` still contains the literal `%WEB_TITLE%`.

**A status-code check cannot tell a good deploy from a bad one.** Every non-asset path falls back to `index.html` with a 200, so a build missing the health branch still answers `/_health` 200 — in HTML. Check the body. A deploy of the wrong commit passed a status-only check and reached production that way.

**`/healthz` is intercepted by Google Front End** and never reaches the container. `/health`, `/livez`, `/readyz` and `/healthz/` pass through; only the exact `/healthz` does not. The endpoint is `/_health`.

**Cache the open, not the opened database.** `getDb` caching the resolved handle left a window where a second caller opened the OPFS file again, and a sync access handle is exclusive — that is where `Invalid VFS state` came from, surfacing at whatever unrelated call happened to be second.

**A file picker filtered by MIME type is unusable on iOS.** A list of CSV types left Safari offering only Photo Library and Take Photo, with no way to reach Files. The picker accepts `*/*`; the parser validates instead.

**Timestamps in `sessions.started_at` are local wall-clock**, because Hevy's export carries no timezone. Writing UTC there puts two conventions in one lexicographically-ordered column. Use `localStamp()`.

**Only pure modules are tested.** `mobile/vitest.config.ts` covers `src/api`, `src/ai`, `src/web`, `src/import`. Importing `../db` pulls in expo-sqlite, whose react-native dependency cannot be parsed under node, so such a test fails to run at all. Put logic on the testable side — as `importWorkouts.ts` is split from `runImport.ts` — rather than loosening the config.

**`MIGRATIONS` is append-only.** Each entry has shipped to a real device.

**A restarted Metro can serve a stale bundle, or no routes at all.** Two separate
traps, both hit in one session. Starting the dev server with `CI=1` disables file
watching, so edits are silently not picked up and you audit a bundle that predates
your change. And restarting Metro mid-session left Expo Router matching nothing —
every path fell through to its "Unmatched Route" screen, with a clean bundle and a
clean typecheck. Neither is a code fault; `npx expo start --web --clear` fixes both.
Suspect the cache before you go bisecting.

---

## Verifying without a deploy

**For UI work, run the dev server rather than exporting.** `cd mobile && npx expo
start`, then `w` for a browser or scan the QR code with Expo Go on a real phone.
Changes hot-reload, so iteration is seconds instead of the minutes an export,
re-stage and deploy costs. Do **not** prefix it with `CI=1` — that disables file
watching and you will silently test a stale bundle.

Keep the habit of driving the real build in a browser after a UI change rather than
trusting the suite. It has now caught five bugs a green suite missed: `expo-file-system`
missing on web, a MIME-filtered picker unusable on iOS, the OPFS `Invalid VFS state`,
and — from the 2026-09-30 walk — a typeface pass that had only reached a fifth of the
app and a stale cross-reference on the Train tab.

### Against a production-shaped build

`gcloud` is not installed in the cloud container, and a service account key was considered and declined — a Cloud Run deploy key also reads the service's env vars, which hold the Gemini key. It is not needed: Chromium is present.

```bash
cd mobile && rm -rf dist && npx expo export --platform web
cd .. && rm -rf services/gemini-proxy/web && cp -r mobile/dist services/gemini-proxy/web
cd services/gemini-proxy && npm run build
PORT=8200 GEMINI_API_KEY=x PROXY_TOKEN=y node dist/index.js &
```

**This is the only way to exercise anything that calls `/api/gemini`.** Metro does
not serve that route, so a dev-server walk gets the SPA fallback HTML, the JSON parse
fails, and auto-lookup and enrichment look broken when they are not. Put the real key
in `GEMINI_API_KEY` (it is in `mobile/.env.local`) and the calls are real.

Drive `http://localhost:8200` with Playwright against `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Three things that cost time: `notify()` and `confirm()` use `window.alert`/`window.confirm` on web, so listen for `dialog` events or failures vanish — and a browser-automation session that cannot answer one will wedge entirely; resizing the window mid-session wedged CDP input and screenshots once, after which only JS-dispatched clicks on the React Native Web pressables worked; and assert on something that cannot be true by accident — a check for a static label once reported a weigh-in as saved when nothing had been.

---

## Repository facts

- The repo is **public**. The full Hevy export is not committed; `mobile/src/import/__tests__/fixtures/hevy-sample.csv` is a 45-row trim carrying every shape the parser must handle.
- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Both workout phases are marked complete. The three older plans still show unticked boxes, but those features shipped — the checkboxes were never updated, and they are not outstanding work.
- Measuring beats trusting a spec. Re-checking the Hevy export against its design doc confirmed every figure it quotes and corrected four claims; the phase 1 plan records which.
