# Handoff

State of play on **2026-10-22**. For how the repository works — layout,
commands, the security model, the rules — read [AGENTS.md](AGENTS.md) first;
this file is only what is in flight and what to do next. Earlier snapshots are
this file's git history (the 2026-10-21 one was written for starting Android)
and [docs/handoff-2026-10-01.md](docs/handoff-2026-10-01.md).

---

## Where things stand

**Nothing is in flight.** PRs #43–#50 merged on 2026-10-22 and the deploy of
`main` at `7d2a285` passed every step; checked from outside: `/_health` is
`ok`, `/api/nonsense` 404, a token-less `POST /api/gemini` 401, serving
`entry-b356a116…`. 1,681 tests pass (engine 252, mobile 1,274, proxy 155) and
`npm run typecheck` is clean.

**The database** is unchanged by this round: the last migration is still
`20261020160000_post_lift_records.sql`. Everything below is app code.

**The Android app runs** as an EAS development build on the owner's phone
(OPPO, Android), with JavaScript from Metro on this PC
(`npx expo start --dev-client`, the phone on the same Wi-Fi). The installed
build has every native module the app now uses: `expo-audio`,
`react-native-webview`, `expo-splash-screen`, `react-native-health-connect`
(plus `expo-build-properties`, SDK 36). A new build is needed only for native
changes. Builds are signed with the EAS keystore whose SHA-1 is
`AC:01:65:3C:7E:E4:63:B7:A3:E9:7E:B8:E5:D4:1F:E1:01:C5:8D:8A`; an Android OAuth
client for it exists in Google Cloud project `gen-lang-client-0349703929`, and
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set in all three EAS environments.
Google's consent screen is in **Testing** with the owner as the only test user,
so nobody else can sign in with Google until it is published.

---

## What changed on 2026-10-21/22, in short

- **One log per account (#45).** Each account has its own SQLite file on the
  device, and so does using the app without one (`src/db/accountDatabase.ts`).
  The original file went to whoever opened the app first after it shipped. An
  account opening to a completely empty log is offered the log kept without an
  account, once (`src/db/moveLog.ts`): moved, not copied, only into an empty
  log, with a clear left owed finished on the next launch. **AGENTS.md does
  not describe this yet.**
- **Backups (#44, #47)** carry every table, weigh-ins with their `created_at`
  and body measurements and steps included; a test compares the migrations'
  tables with what a restore writes. A restore reloads the store itself.
- **Android parity (#48, #43):** sounds through `expo-audio`; the story card
  drawn by the same canvas code in a webview (`CardDrawerDom.tsx`, an Expo DOM
  component); card images fetched by absolute URL as data URLs; a launch screen
  held until the first screen; the status-bar strip.
- **Avatars (#48):** the profile was cached before the server accepted it, so a
  failed save looked saved. Cached only after success now, and a load sends the
  server anything only the device kept.
- **Health Connect (#48, Android, read-only):** steps (per-day aggregate) and
  weigh-ins, five years, syncing on open, on return and every 15 minutes;
  hand-entered values are never replaced. Trends' steps follow the period.
- **Check-ins (#49):** a week earns one with food on 5 days and 3 weigh-ins
  (20/12 a month, 65/39 a quarter); the week can end on any day
  (`checkInWeekEndsOn`, engine `checkInWeekFor(today, weekEndsOn)`). A locked
  week shows the last check-in; the weekly coach is given its last advice and
  whether it was applied, the week's steps, and waist and body fat.
- **Onboarding (#49):** full screen, one question a screen, no Skip (Health
  Connect has "Not now"); nothing preselected — the old defaults were the
  owner's own answers. People already set up get a one-time catch-up
  (`onboardingVersion`) that confirms age and height. The focus choice now
  changes Today's layout.
- **Food logging (#46, #50):** USDA Foundation foods that state energy only as
  Atwater values (2047/2048) are no longer dropped (57 of 101 were); search
  rows lead with the serving; ½/×1/×2/×3 of a serving; Smaller / As estimated
  / Larger on estimated items.

---

## Do these

**On the phone, from Metro on `main`** (close and reopen the app):

- The onboarding catch-up: age and height prefilled, focus, coach voice,
  check-in day, Health Connect; nothing stuck behind the launch screen.
- Trends → weekly coach: the 12–18 Oct week should now be earned; a locked
  week shows the previous check-in.
- Food: serving-first search rows, the ×2 count, the size buttons on a photo
  estimate.
- The launch screen, sounds and a story card drawing itself, on the current
  build.

**On the web**, signed in as the owner: the "Move your earlier log into this
account?" offer should appear if the log was left under "no account" by #45.
The owner's body fat went missing on the web and is expected there.

**Measure the food estimates.** The description eval (`evals/meal-estimation`)
last ran on 2026-09-23, before `a0a8dd7` (2026-10-18) added 32 micronutrients
to the prompt, so the shipped prompt is unmeasured; it needs `GEMINI_API_KEY`
on this machine. Photos have no eval at all. The plan agreed with the owner:
about 15 of their own meals, each component weighed, then photographed; the
reference is arithmetic from USDA values, and the eval scores portion error and
calorie error apart. That decides whether to move nutrient numbers from the
model to the database (the model naming foods and grams only).

---

## Decisions that are the owner's, still open

- **Body fat from Health Connect** (a smart scale) is not imported: where a
  scale's reading ranks against entered, tape and photo (`chooseBodyFat`)
  feeds the expenditure estimate.
- **The monthly and quarterly reviews** do not get the steps, body data and
  last-advice context the weekly one now has.
- **Real sync of the log across devices** (Supabase, per account) would end
  "my data is on the other device", and reverses the local-first design and
  puts health data on a server. Not started; a decision, not a fix.
- **Publishing Google sign-in** needs the consent screen's Branding page
  completed (name, support email, privacy policy link).
- **The Overview screen (`app/overview.tsx`) is orphaned** — keep and link it,
  or delete it.
- **Hevy imports show weights like 99.3 kg / 84.8 kg**: waiting on the owner's
  Hevy CSV header and a few Lat Pulldown rows.
- **The owner's priority list** in AGENTS.md (card composer, segmentation, the
  feed's real card image) is unchanged by this round.

## Still to do on Android

- **The rest-end alert with the phone locked:** sounds play while the app is
  open only; `expo-notifications` would schedule the rest end.
- **Stickers and the card photo/depth cut-out** are still browser-only (the
  sticker sheet says so natively). The story card itself draws natively now.
- **Health Connect's "privacy policy" link** opens the app's home screen, not
  the privacy page; a Play Store release needs it to open the privacy page.
- **Dependencies** are still a patch behind SDK 57 (`expo` 57.0.23 → ~57.0.30
  and others). `expo install --fix` in place duplicated native modules once and
  was reverted; do it as its own change, proved by a real build.
- **Play Store:** none of this is released; a release needs a second Android
  OAuth client with Play's app-signing SHA-1.

## Known rough edges, carried forward

- Settings' "Goal weight (optional)" shows 0 when none is set.
- Trends' expenditure tile shows the raw confidence word ("insufficient").
- Older dumbbell history may mix one-dumbbell and pair conventions.
- A squad can read as full because of a member hidden across a block — the
  accepted, documented leak.
- Someone signing in on a shared device can be offered the log kept there
  without an account. Reviewed and accepted: they can already open it with
  "Continue without an account".

---

## Traps

- **Metro serves the working tree.** Switching branches on this PC changes the
  code on the phone at once; restart Metro with `--clear` after installing
  packages or switching branches. `CI=1` turns its file watching off.
- **Stacked PRs keep their base.** A PR opened onto another branch is not
  retargeted to `main` when that branch merges; `gh pr edit N --base main`
  before merging it, or it lands on the old branch.
- **Two fixes for the same thing can merge without a conflict and both apply.**
  #43 and #48 each added the proxy address to card-image URLs; merged, it went
  on twice. Read the merged result, not just the conflict markers.
- **The browser that Claude in Chrome drives is not on this PC**, so
  `localhost` does not reach it; over the LAN address the web build cannot open
  its storage (not a secure context). Screens are checked on the phone.
- **A recursive delete that follows links wipes the main checkout.** npm
  workspaces put junctions in `node_modules/@adaptive-macros/*`; on Windows
  delete `node_modules` with `cmd /c rmdir /s /q`, or robocopy with `/XJ`.
- **Any test that reads a clock is a deploy risk:** a failed test skips the
  deploy while Supabase still applies a migration. `exerciseSearch`'s speed
  test now takes the fastest of 30 runs against 100 ms.
- **No Prettier config.** Running it rewrites whole files; match style by hand.
- **Shell escaping:** template literals and regexes passed through `node -e`
  in Git Bash get mangled; edit files with the Edit tool instead.
- **`gcloud` works from PowerShell only** on this machine; deploys go through
  GitHub Actions anyway.
