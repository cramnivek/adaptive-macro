# Handoff

Last updated 2026-09-29. Branch `feat/web-deployment`, 26 commits ahead of `main`, working tree clean, pushed.

State: 245 tests pass (`npm test`), `npm run typecheck` clean, web and android both export.

---

## Do these first

1. **Redeploy.** The live site's CSV import is broken and the fix is pushed but not deployed. See *Deploying* below. This is the only item that affects anyone using the app right now.
2. **Answer the bodyweight question** under *Open decisions*. It blocks nothing technically, but it decides whether 206 pull-up sets are visible or blank.
3. `git push origin --delete claude/brave-pascal-zwfg38` — a dead duplicate branch that was accidentally deployed once. Deleting it from a dev container fails at the git proxy; it needs a real machine.

---

## What exists

**Web deployment.** The Cloud Run service at
`https://gemini-proxy-297164004726.asia-southeast1.run.app`
serves both the API and the exported web app from one origin, so there is no CORS and the shared token never crosses an origin boundary. `services/gemini-proxy/src/router.ts` dispatches; `staticFiles.ts` serves the build with a SPA fallback that deliberately does *not* answer for missing assets or unknown `/api/` paths.

**Server-side third parties.** `/api/gemini`, `/api/off/search`, `/api/off/legacy` and `/api/usda/search` each attach a key held on the service. No key reaches the bundle. A user's own key in Settings always wins over the shared route.

**Lifting history.** Migration v3 adds `exercises`, `routines`, `routine_exercises`, `sessions`, `sets`. `mobile/src/import/hevy.ts` parses a Hevy CSV export; `importWorkouts.ts` plans it; `runImport.ts` writes it. `packages/engine/src/workouts.ts` computes effective load and progression. `mobile/app/progression.tsx` draws it.

**Verified against the real 3,073-row export**, in a browser, end to end: 246 sessions and 3,057 sets written; a second import of the same file plans 0 sessions; Bench Press draws both charts with 8 record markers.

---

## Open decisions

### Bodyweight before the first weigh-in

Effective load for a bodyweight exercise is the weight trend on that date plus any added plate. The trend comes from logged weights, which start whenever the app was first used. The lifting history starts 2024-09-08.

So every pull-up session before the first weigh-in is unscoreable — 206 sets, the most-trained exercise in the export. The progression screen says so correctly rather than drawing a flat zero line, but the back history stays blank.

Three options:

1. Leave it. Nothing invented; pull-ups become scoreable from the first weigh-in onward.
2. **Carry the earliest recorded trend weight backwards for earlier dates, labelled on the chart.** Recommended — the only option that makes the sets visible without asking anyone to reconstruct numbers, and the assumption is stated where it is seen.
3. Let the user enter a starting weight and date for the imported range.

### Phase 2 remainder

`docs/superpowers/plans/2026-09-28-workout-tracking-phase-2.md`. Task 1 (progression) is done. Remaining: routines, the session logger, the cross-reference chart.

**Task 4 is the dangerous one.** Wiring the MET-derived session estimate into the target would be a small diff that looks like a feature and would reintroduce the double-count this design was explicitly corrected to avoid — `expenditure.ts` already absorbs training through the intake-versus-weight gap. The estimate is display-only. The plan has a verification step for exactly this.

---

## Deploying

The web build is **not** committed. Stage it into `services/gemini-proxy/web/` first — `web/`, never `dist/`, which `.gcloudignore` excludes.

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

A routine deploy must **not** pass `--set-env-vars`: it replaces the whole set, so naming one variable silently drops the others. Use `--update-env-vars` to change one.

Verification steps are in `services/gemini-proxy/README.md`. The important one: check the **body** of `/_health`, not its status code.

---

## Traps, each of which has already cost time

**`expo export --platform android` overwrites `dist/`.** Export web *last*, or stage `web/` before exporting anything else. A stale stage ships a site whose `index.html` still contains the literal `%WEB_TITLE%` placeholder and no bundle.

**A status-code check cannot tell a good deploy from a bad one.** Every non-asset path falls back to `index.html` with a 200, so a build missing the health branch still answers `/_health` with 200 — in HTML. A deploy of the wrong commit passed a status-only check and reached production that way.

**`/healthz` is intercepted by Google Front End** on Cloud Run and never reaches the container. `/health`, `/livez`, `/readyz` and `/healthz/` all pass through; only the exact `/healthz` does not. The endpoint is `/_health`. Do not rename it back.

**`expo-file-system` does not exist on web.** `readAsStringAsync` throws there. Anything reading a file must branch: on web the picker returns a real `File`, on a device only expo-file-system can open the URI. This broke the import on the deployed site and no test caught it — both exports built and every test passed.

**Only pure modules are tested.** `mobile/vitest.config.ts` covers `src/api`, `src/ai`, `src/web` and `src/import`. Importing `../db` pulls in expo-sqlite, whose react-native dependency cannot be parsed under node, so such a test fails to run at all. That is why `importWorkouts.ts` (decisions, tested) is separate from `runImport.ts` (writes, not). Do not loosen the config to get a green check; put the logic on the testable side instead.

**`MIGRATIONS` is append-only.** Each entry has shipped to a real device. Add a step; never edit one.

---

## Verifying without a deploy

`gcloud` is not installed in the cloud container and adding a service account key was considered and declined. It is not needed: Chromium is present, so the whole app can be driven locally.

```bash
cd mobile && rm -rf dist && npx expo export --platform web
cd .. && rm -rf services/gemini-proxy/web && cp -r mobile/dist services/gemini-proxy/web
cd services/gemini-proxy && npm run build
PORT=8200 GEMINI_API_KEY=x PROXY_TOKEN=y node dist/index.js &
```

Then drive `http://localhost:8200` with Playwright against `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. This is how the web import bug was found. Note that `notify()` uses `window.alert` on web, so a Playwright run must listen for `dialog` events or failures vanish silently.

---

## Still unverified

- **iOS.** Nobody has done the round trip: Safari, Add to Home Screen, log a weight, fully close, reopen from the home screen, confirm it persisted. This is the reason the web deployment exists, and it is untested.
- **Migration v3 against a real v2 database.** It has only been applied to fresh ones. A device that already has data has not been tried.
- **The wasm content type** in `staticFiles.ts`. Probing guessed paths for `expo-sqlite`'s wasm returned 404, so the fix is unconfirmed end to end. The browser console will say if it is wrong.
- **Native.** `expo-document-picker` was added this session, so the import screen needs a rebuild before it works on a device.

---

## Repository facts worth knowing

- The repo is **public**. The full Hevy export is therefore not committed; `mobile/src/import/__tests__/fixtures/hevy-sample.csv` is a 45-row trim carrying every shape the parser must handle.
- Specs live in `docs/superpowers/specs/`, plans in `docs/superpowers/plans/`. Each feature has a design doc first.
- Measuring beats trusting a spec: re-checking the export against `2026-09-23-workout-tracking-design.md` confirmed every figure it quotes and corrected four claims. The plan records which.
