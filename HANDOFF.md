# Handoff

State of play on **2026-10-21**, written for the session that picks this up on
the owner's Windows PC to build the **Android app**. For how the repository
works — layout, commands, the security model, the rules — read
[AGENTS.md](AGENTS.md) first; this file is only what is in flight and what to
do next. Earlier snapshots are this file's git history and
[docs/handoff-2026-10-01.md](docs/handoff-2026-10-01.md).

---

## Where things stand

**The web app is live and current.** PRs #27–#42 merged and deployed on
2026-10-20/21. In outline: routines and barcode fixes; body measurements and
body fat from tape or photos; an honest weight trend and an energy density from
body composition; Trends check-ins earned per period and numbers that follow
the selected period; real steps and micronutrients; PR medals on record sets
(results, share card, feed posts) and a PR popup with sound; set/finish sounds
and screen transitions; protein recommended from goal, activity, sex and body
fat, and DRI micronutrient targets by age and sex; goals set as a weight and a
date; a 7- and 30-day weight projection; a profile-photo cropper; an
installed web app that reloads itself onto a new build when it comes back into
view after five minutes away.

**The database** has every migration in the repository, the last being
`20261020160000_post_lift_records.sql` (a lift in a post may carry `pr: true`),
confirmed applied on 2026-10-21.

**In flight:** PR #43, branch `claude/updates-overview-y2g5ve` — the first
Android fixes (below) and this file. Merge it before starting locally.

---

## The Android app: what to do first

The Expo project exists: `@zeldrich/adaptive-macros`, project id
`1feb7a8d-afb9-479d-8e29-821bb5be74c6`, already in `mobile/app.json`. Android
package `com.cramnivek.ascend`. `mobile/eas.json` has `development`
(dev client, internal), `preview` and `production` profiles, each tied to an
EAS environment of the same name.

**Do not use Expo Go** (`exp://exp.host/@zeldrich/adaptive-macros`). The app
has native modules Expo Go lacks (`@react-native-google-signin/google-signin`
among them); it will fail and teach nothing. Use a development build.

1. **Machine.** Install Android Studio (SDK, an emulator, Java 17). Optional:
   USB debugging on the owner's Android phone, which is better than the
   emulator for camera, barcode and sound. Run Claude Code from **PowerShell**.
2. **Repo.** `git pull` on `main`, `npm install`, `cd mobile`.
3. **Environment.** On expo.dev, set in the `development` environment (and
   later `preview`/`production`): `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_PROXY_TOKEN`,
   `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and optionally `EXPO_PUBLIC_API_BASE`.
   Without them the app falls back to compiled-in public values (Supabase,
   proxy token, the Cloud Run URL), which work, except Google sign-in, which
   needs the client id. For Google sign-in also register the build's
   **SHA-1 signing fingerprint** in Google Cloud (`eas credentials` shows it).
   The service-role key never goes anywhere near the app.
4. **Build.** Either `npx expo run:android` (local, needs the SDK) or
   `npx eas login` then `npx eas build --profile development --platform android`
   (cloud, 10–20 min, install the APK from its link). Then
   `npx expo start --dev-client`.
5. **Dependencies — do this deliberately, with a build to check it.**
   `npx expo-doctor` on 2026-10-21 reported:
   - 12 Expo packages a patch behind SDK 57 (`expo` 57.0.23 → ~57.0.30,
     `expo-router`, `expo-sqlite`, `expo-camera` and others);
   - a second copy of React (19.3.0) on disk at the root beside the app's
     19.2.3, pulled in by `@expo/metro-runtime`. The Android bundle contains
     only one React (Metro resolves `mobile/node_modules` first), so this is
     a warning, not a crash;
   - `resolver.disableHierarchicalLookup: true` in `metro.config.js`, which is
     deliberate for the workspace and stays.

   **Trap:** `npx expo install --fix` in place left two copies of `expo`,
   `expo-modules-core`, `expo-asset` and `expo-constants` (root old, `mobile/`
   new), which a native build cannot tolerate, and `npm dedupe` failed on a
   peer conflict. It was reverted. Do it as its own change: bump the versions,
   regenerate the lockfile cleanly, confirm `expo-doctor` shows no native
   duplicates, and prove it with a real Android build before merging. Mind
   the junction trap below before deleting any `node_modules`.

`npx expo export --platform android` bundles cleanly (7.7 MB Hermes bytecode).
That is the only Android check made so far; nothing has run on a device.

---

## The Android punch list, most user-visible first

Every web/native split is a runtime `Platform.OS` / `typeof document` check;
there are no `.web.tsx`/`.native.tsx` files.

1. **Share card and stickers are browser canvas.** `shareCardFile` returns null
   off web (`src/platform/shareImage.ts`), so sharing falls back to text;
   `pickCardPhoto` returns "cancelled", so Add a photo does nothing silently;
   the depth cut-out (`src/platform/depth.ts`) is MediaPipe WebAssembly.
   PR #43 makes the sticker sheet say "only in the web app for now" instead of
   sitting empty. The real fix is redrawing the card natively —
   `@shopify/react-native-skia`, or React Native views captured with
   `react-native-view-shot` — plus `expo-image-picker` for the photo and
   `expo-media-library` to save. The biggest piece of work.
2. **Feed card images — fixed in PR #43.** They used bare `/api/...` paths and
   blob URLs; they now go through `proxyBase()` and use a data URL natively.
3. **No sounds.** Rest chime, PR sting, set tick and finish chord return null
   off web (`src/platform/chime.ts`); they are synthesised WAVs played through
   `HTMLAudioElement`. Native: `expo-audio` with the same samples written to
   files, and `expo-notifications` to schedule the rest-end alert so it fires
   with the phone locked (the web cannot).
4. **Google sign-in** needs the client id and SHA-1 above. Sessions persist in
   AsyncStorage natively (`src/social/client.ts`); Apple sign-in is iOS only.
5. **Health Connect steps** are offered on Android (`src/health/healthSync.ts`)
   but not implemented. The clearest reason to install the app over the web.
6. Works natively already, verify on a device: barcode (`expo-camera`), meal
   and body-fat photos, avatar cropper, backups and Hevy import
   (`expo-file-system`, `expo-document-picker`, `expo-sharing`), haptics,
   SQLite (same migrations as web), the Gemini proxy (absolute URL natively).
   The web barcode decoder's WebAssembly is still bundled; check the first
   build does not choke on it.
7. Web-only and correctly skipped natively: the stale-build reload, storage
   persistence, cache clearing. Over-the-air updates would need `expo-updates`
   (not installed).

Suggested order: dependencies and a first development build → sounds and the
locked-screen rest notification → Health Connect → the native share card →
Play Console internal testing. iPhone builds go through EAS from Windows, then
TestFlight; a local iOS build needs a Mac.

---

## Not yet verified anywhere

- **The iPhone share-card fix** (#42): a picked photo is now shrunk to the
  card's size before drawing, on the diagnosis that a full-resolution photo
  exceeded Safari's memory and the installed app was reloaded. No iPhone was
  available; ask the user who reported it ("mabutang nakog photo pero mo exit
  dayon") to try again.
- **The reload onto a new build** (#41) needs a real deploy to see; only the
  page parser is unit-tested.
- **The load-failure screens** (#40/#41) could not be forced in the preview.

---

## Decisions that are the owner's, still open

- **The Overview screen (`app/overview.tsx`) is orphaned** — nothing links to
  it. Keep and link it, or delete it.
- **Hevy imports show weights like 99.3 kg / 84.8 kg** ("`.1` weights"). Waiting
  on the owner's Hevy CSV header line and a few Lat Pulldown rows to see
  whether to snap imported values to whole or half pounds.
- **The owner's priority list** (AGENTS.md, "Where the current work is"): a
  Hevy-style share-card composer, subject segmentation, the feed showing the
  real card image. Native Android reorders this: the native share card comes
  first there.
- Unchanged from before: sign-in uploads the baseline to `user_metadata`
  (check the privacy policy against it); Home "Balanced" and "Food first" lay
  Today out identically.

## Known rough edges, carried forward

- Settings' "Goal weight (optional)" shows 0 when none is set.
- Trends' expenditure tile shows the raw confidence word ("insufficient").
- A red "Received `false` for a non-boolean attribute `collapsable`" banner in
  the dev server comes from a library, not this code, and is dev-only.
- Older dumbbell history may mix one-dumbbell and pair conventions.
- A squad can read as full because of a member hidden across a block — the
  accepted, documented leak.

---

## Traps

- **A recursive delete that follows links wipes the main checkout.** npm
  workspaces put junctions in `node_modules/@adaptive-macros/*` pointing at the
  real `mobile/`, `packages/engine` and `services/gemini-proxy`. On Windows
  delete `node_modules` with `cmd /c rmdir /s /q`, or robocopy with `/XJ`.
  This deleted the main working copy's packages once.
- **`CI=1 npx expo start` turns Metro's file watching off** ("reloads are
  disabled"), which is why edits looked stale in earlier sessions. Start the dev
  server without it to see changes.
- **Any test that reads a clock is a deploy risk**: a failed test skips the
  deploy while Supabase still applies a migration. Keep the fastest of several
  runs.
- **No Prettier config.** Running it rewrites whole files; match style by hand.
- **Previewing signed-out screens** needs two never-committed patches:
  `false && url && key` in `src/social/client.ts` and `false &&
  !settings.onboarded` in `src/components/AuthGate.tsx`.
- **The cloud container's `gcloud` has no credentials.** Deploys go through
  GitHub Actions, or PowerShell on the owner's machine.
