# Handoff

Last updated 2026-09-30. Branch `feat/web-deployment`, **47 commits ahead of `main`**, working tree clean, **not pushed**.

322 tests pass (`npm test`) — engine 104, mobile 152, gemini-proxy 66. `npm run typecheck` is clean, web and android both export.

**A caveat on typecheck**, which cost time once and will again. It fails with seven
`TS2345` route-string errors whenever `mobile/.expo/types/router.d.ts` is stale —
that file is generated, gitignored, and only the Metro dev server writes it.
`expo export` does **not**. If typecheck sprouts route errors for `/routines`,
`/session`, `/progression` or `/import-workouts`, run `CI=1 npx expo start --web`
briefly and kill it.

**Every planned feature is built, and the interface has been redesigned.** What
remains is not code: looking at the redesign in a browser, deploying, merging, and
the checks that need real hardware.

---

## Do these first

1. **Look at the redesign in a browser.** Nine commits changed how every screen is
   drawn and none of it has been seen by a human or a browser. Nothing about layout
   is checkable under node, and three bugs have already shipped past a green suite on
   this project. Priorities are in *The redesign* below.
2. **Deploy.** The live site is several commits behind and is missing everything from 2026-09-29: the logger, routines, the cross-reference, the backup rewrite, the `Invalid VFS state` fix and eleven review fixes. See *Deploying*.
3. **Merge to `main`.** Forty-seven commits have never left this branch. Nothing depends on it, but the gap grows.
4. `git push origin --delete claude/brave-pascal-zwfg38` — a dead duplicate branch that was accidentally deployed once. Deleting it from a dev container fails at the git proxy; it needs a real machine.

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

---

## Still unverified — needs hardware

- **iOS.** Safari → Add to Home Screen → log a weight → fully close → reopen. The reason the web deployment exists, and nobody has done it.
- **Migration v3 against a device that already holds v2 data.** Only ever applied to fresh databases.
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

`gcloud` is not installed in the cloud container, and a service account key was considered and declined — a Cloud Run deploy key also reads the service's env vars, which hold the Gemini key. It is not needed: Chromium is present.

```bash
cd mobile && rm -rf dist && npx expo export --platform web
cd .. && rm -rf services/gemini-proxy/web && cp -r mobile/dist services/gemini-proxy/web
cd services/gemini-proxy && npm run build
PORT=8200 GEMINI_API_KEY=x PROXY_TOKEN=y node dist/index.js &
```

Drive `http://localhost:8200` with Playwright against `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Two things that cost time: `notify()` uses `window.alert` on web, so listen for `dialog` events or failures vanish; and assert on something that cannot be true by accident — a check for a static label once reported a weigh-in as saved when nothing had been.

---

## Repository facts

- The repo is **public**. The full Hevy export is not committed; `mobile/src/import/__tests__/fixtures/hevy-sample.csv` is a 45-row trim carrying every shape the parser must handle.
- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Both workout phases are marked complete. The three older plans still show unticked boxes, but those features shipped — the checkboxes were never updated, and they are not outstanding work.
- Measuring beats trusting a spec. Re-checking the Hevy export against its design doc confirmed every figure it quotes and corrected four claims; the phase 1 plan records which.
