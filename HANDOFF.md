# Handoff

Last updated 2026-09-29. Branch `feat/web-deployment`, **33 commits ahead of `main`**, working tree clean, pushed.

257 tests pass (`npm test`), `npm run typecheck` clean, web and android both export.

**Every planned feature is built.** What remains is not code: deploying it, merging it, and the checks that need real hardware.

---

## Do these first

1. **Deploy.** The live site is several commits behind and is missing everything from 2026-09-29: the logger, routines, the cross-reference, the backup rewrite, the `Invalid VFS state` fix and eleven review fixes. See *Deploying*.
2. **Merge to `main`.** Thirty-three commits have never left this branch. Nothing depends on it, but the gap grows.
3. `git push origin --delete claude/brave-pascal-zwfg38` — a dead duplicate branch that was accidentally deployed once. Deleting it from a dev container fails at the git proxy; it needs a real machine.

---

## What exists

**Deployment.** One Cloud Run service at `https://gemini-proxy-297164004726.asia-southeast1.run.app` serves the API and the exported web app from one origin, so there is no CORS. `router.ts` dispatches; the SPA fallback deliberately does not answer for missing assets or unknown `/api/` paths.

**Server-side third parties.** `/api/gemini`, `/api/off/search`, `/api/off/legacy`, `/api/usda/search`. Each attaches a key held on the service; none reaches the bundle. A user's own key in Settings always wins over the shared route.

**Lifting.** Migration v3 holds `exercises`, `routines`, `routine_exercises`, `sessions`, `sets`. Settings → Lifting history has four entries:

- **Log a workout** — blank or from a routine, prefilled from what was lifted last time
- **Routines** — named ordered lists, reorderable, buildable from a past session
- **Import from Hevy** — preview before anything is written, idempotent on session start time
- **See progression** — heaviest working set and working volume, on effective load

**Trends** additionally shows weekly volume, and weekly training energy as a band against the filter's expenditure. That energy figure is display-only and nothing consumes it — `expenditure.ts` already absorbs training through the intake-versus-weight gap, so counting it again would raise the target for work already accounted for.

**Backups** (Settings → Your data) hold everything including the lifting history, download properly in a browser, and can be restored. Restore replaces rather than merges and states what the file holds before it does.

---

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
