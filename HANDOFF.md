# Handoff

Last updated 2026-09-29. Branch `feat/web-deployment`, **36 commits ahead of `main`**, working tree clean, pushed.

261 tests pass (`npm test`), `npm run typecheck` clean, web and android both export.

---

## Start here if you are picking this up locally

```bash
git clone https://github.com/cramnivek/adaptive-macro
cd adaptive-macro
git checkout feat/web-deployment
npm install
npm test && npm run typecheck
```

Then, for UI work, **run the dev server rather than exporting**:

```bash
cd mobile && npx expo start
```

Press `w` for a browser or scan the QR code with Expo Go on a phone. Changes hot-reload. This is the single biggest reason to work locally: the cloud container has no dev server reachable from a phone, so every UI change there costs a full `expo export`, a re-stage and a deploy — minutes per iteration instead of seconds.

### What local gives you that the cloud container does not

- **Hot reload.** See a layout change immediately, on a real phone.
- **`gcloud`.** The container has no credentials and a deploy key was deliberately declined, so deploys happen on your machine anyway.
- **A real device.** iOS install, native builds, the camera scanner — none of it testable in a container.
- **Your own plugins and skills.** Whatever is installed for your account or configured in the repo comes with you.

### What the cloud container had that is worth reproducing

Chromium with Playwright, used to drive the real web build headlessly. It caught three bugs that a green test suite missed — `expo-file-system` missing on web, a MIME-filtered picker being unusable on iOS, and the OPFS `Invalid VFS state`. If you keep one habit from this work, keep that one: after a UI change, drive it in a browser, don't just run the tests.

Recipe (works locally too):

```bash
cd mobile && rm -rf dist && npx expo export --platform web
cd .. && rm -rf services/gemini-proxy/web && cp -r mobile/dist services/gemini-proxy/web
cd services/gemini-proxy && npm run build
PORT=8200 GEMINI_API_KEY=x PROXY_TOKEN=y node dist/index.js &
```

Then drive `http://localhost:8200` with Playwright. Two traps: `notify()` uses `window.alert` on web, so listen for `dialog` events or failures vanish silently; and assert on something that cannot be true by accident — a check for a static label once reported a weigh-in as saved when nothing had been.

---

## Where the work stands

**The design brief as of the last message: the logging UI should follow Hevy closely.** The logger was rebuilt once in that direction (`efdd3e4`) but has not been reviewed against the real app by anyone who uses it.

`mobile/app/session.tsx` is now a list of exercises, each a grid of rows:

```
SET   PREVIOUS      KG    REPS   ✓
1     100.0 × 8    [100]  [5]    ✓
```

- `PREVIOUS` is the same set index from the last finished session
- A row is a draft until ticked; ticking writes it, editing a ticked row updates it, unticking deletes it
- A new row copies the one above, falling back to the previous session's set at that index
- Tapping the set number toggles warmup
- Header carries elapsed time, set count and Finish

**Known rough edges, all in the logger:**

1. **The header scrolls away.** Finish and the timer are in the scroll flow, so they disappear as rows are added. Hevy pins them. This is the most obvious thing to fix first.
2. **No rest timer.** Deliberately a non-goal in the spec, but it is one of the things Hevy does that people miss.
3. **No reordering exercises** within a session.
4. **The exercise picker is a plain inline list** — no muscle-group filter, no recent-first grouping beyond most-used ordering.
5. **`setIndex` is the row position**, so warmup rows consume indices. Harmless for progression, which excludes warmups, but it makes `PREVIOUS` line up oddly if a session's warmup count changes between sessions.

Judge all of these against the real Hevy app; I was working from a description of its layout, not the app itself.

---

## What exists

**Deployment.** One Cloud Run service at `https://gemini-proxy-297164004726.asia-southeast1.run.app` serves the API and the exported web app from one origin, so there is no CORS. The live site is current as of `ba14592`; `efdd3e4` (the logger rebuild) is **not deployed**.

**Server-side third parties.** `/api/gemini`, `/api/off/search`, `/api/off/legacy`, `/api/usda/search` — each attaches a key held on the service, none reaches the bundle. A user's own key in Settings always wins.

**Tabs.** Today · Weight · **Train** · Trends · Settings.

- **Train** — session in progress, last working set for the three most-trained lifts, recent sessions, routines. Starting is one tap: each button begins logging immediately, blank or from a routine.
- **Settings → Lifting history** — the Hevy import only. One-time migration belongs here; daily actions do not.
- **Settings → Your data** — backup and restore, covering the lifting history, downloading properly in a browser.

**Engine** (`packages/engine/src/workouts.ts`, pure, 104 tests): effective load including bodyweight work, progression, weekly volume, and a MET session-energy band that **nothing consumes** — `expenditure.ts` already absorbs training through the intake-versus-weight gap, so feeding it into the target would double-count.

---

## Verified, and how

Driven in a real browser against the full 3,073-row export:

- Import: 246 sessions, 3,057 sets; re-importing the same file plans 0
- Logger: previous column shows real values, ticking records, a new row copies the weight above, finishing saves
- Backup: download a v2 file with all 3,057 sets, open a fresh browser profile, confirm empty, restore, history returns with bodyweight flags intact
- Progression: both charts draw, pull-ups score off the weight trend

## Still unverified — needs hardware

- **iOS.** Safari → Add to Home Screen → log a weight → fully close → reopen. The reason the web deployment exists, and nobody has done it.
- **Migration v3 against a device that already holds v2 data.** Only applied to fresh databases.
- **Native.** `expo-document-picker` was added this session, so an APK needs rebuilding before import or restore work on a device.

---

## Deploying

The web build is **not** committed. Stage it into `services/gemini-proxy/web/` — `web/`, never `dist/`, which `.gcloudignore` excludes.

```powershell
cd mobile
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx expo export --platform web
Remove-Item -Recurse -Force ..\services\gemini-proxy\web -ErrorAction SilentlyContinue
Copy-Item -Recurse dist ..\services\gemini-proxy\web
cd ..\services\gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 --allow-unauthenticated --timeout 120
```

A routine deploy must **not** pass `--set-env-vars`: it replaces the whole set, so naming one variable silently drops the others. Use `--update-env-vars` for one.

Verifying a deploy: check the **body** of `/_health`, not its status code, and grep the shipped bundle for a string from the change. Every non-asset path falls back to `index.html` with a 200, so a build missing the health branch still answers `/_health` 200 — in HTML. A deploy of the wrong commit passed a status-only check and reached production that way.

---

## Traps, each of which has already cost time

**`expo-file-system` does not exist on web.** Both `readAsStringAsync` and `writeAsStringAsync` throw there. This broke the Hevy import and the data export on the deployed site, invisibly. All file I/O goes through `src/platform/files.ts` — use it.

**`expo export --platform android` overwrites `dist/`.** Export web *last*, or stage `web/` first.

**`/healthz` is intercepted by Google Front End** and never reaches the container. `/health`, `/livez`, `/readyz` and `/healthz/` pass through; only the exact `/healthz` does not. The endpoint is `/_health`.

**Cache the open, not the opened database.** `getDb` caching the resolved handle left a window where a second caller opened the OPFS file again; a sync access handle is exclusive, and that is where `Invalid VFS state` came from.

**A file picker filtered by MIME type is unusable on iOS.** A list of CSV types left Safari offering only Photo Library and Take Photo. The picker accepts `*/*`; the parser validates instead.

**`sessions.started_at` is local wall-clock**, because Hevy's export carries no timezone. Use `localStamp()`; writing UTC puts two conventions in one lexicographically-ordered column.

**Only pure modules are tested.** `mobile/vitest.config.ts` covers `src/api`, `src/ai`, `src/web`, `src/import`. Importing `../db` pulls in expo-sqlite, whose react-native dependency cannot be parsed under node. Put logic on the testable side — as `importWorkouts.ts` is split from `runImport.ts` — rather than loosening the config.

**All tab screens share the DOM.** Searching rendered text cannot prove a string is absent from one tab; check the source.

**`MIGRATIONS` is append-only.** Each entry has shipped to a real device.

---

## Repository facts

- The repo is **public**. The full Hevy export is not committed; `mobile/src/import/__tests__/fixtures/hevy-sample.csv` is a 45-row trim carrying every shape the parser must handle.
- Specs in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Both workout phases are complete. The three older plans show unticked boxes, but those features shipped — the checkboxes were never updated.
- Loose ends: 36 commits have never left this branch, and `claude/brave-pascal-zwfg38` is a dead duplicate still on the remote (`git push origin --delete claude/brave-pascal-zwfg38`).
