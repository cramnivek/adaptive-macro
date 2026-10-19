# Ascend — context for whoever works on this next

Written for an agent arriving with no history: what this is, where things live,
what will bite you, and what counts as done here. If you read one section, read
**Before you touch anything**.

Last verified 2026-10-14 against `main` at `2ed42fd`. Commands were run, not
remembered: 1,150 tests pass (`npm test`) and `npm run typecheck` is clean.

---

## Before you touch anything

**1. A push to `main` changes a live production database.** Supabase's GitHub
integration applies every new file under `supabase/migrations/` the moment it
lands on `main`. There is no staging copy and no review step. Real people's
workouts are in that database. Treat a migration the way you would treat a
deployment, because it is one.

**2. An applied migration is frozen.** Never edit a file under
`supabase/migrations/` that has already run — even a comment. Write a new one.
The applied set as of today:

```
20261011120000_accounts_and_posts.sql    profiles, posts, delete_account
20261012120000_harden_posts.sql          shape checks on a post's JSON
20261012130000_follows_blocks_likes.sql  follows, blocks, likes, can_see
20261012140000_feed.sql                  feed_posts view, feed_page RPC
20261012150000_reports_and_filter.sql    reports, hiding, word filter, blocked list
20261014120000_word_filter_boundaries.sql short words match whole words only
```

**3. The security model is subtle and the tests are the specification.**
`mobile/src/social/__tests__/social-rls.test.ts` runs the real migrations against
real Postgres (PGlite) as real roles. If you change anything about who can see
what, that file is where you prove it. 63 of the tests are there for this.

**4. Do not "simplify" the block rules.** They look redundant and are not. See
*The one rule that matters* below.

**5. Windows.** This is the owner's machine. `gcloud` works from PowerShell and
fails from Git Bash (`Python was not found`). Deploys run from PowerShell.

---

## What the app is

**Ascend** — a local-first nutrition and lifting tracker with an adaptive TDEE
engine, plus a social layer. Expo (SDK 57) + React Native 0.86, shipped as a web
PWA today; the native targets build but are not released.

Three things make it unusual, and each constrains how you change it:

- **Local-first.** Your food, weight and lifting history live in SQLite on the
  device, not on a server. There is no account needed to use the app. The social
  layer is bolted on top and is entirely optional — everything still works signed
  out, and nothing in the core app may come to depend on being signed in.
- **The engine decides, not a formula.** `packages/engine` estimates expenditure
  from the gap between intake and weight trend (Kalman-filtered), so targets
  adapt. It is pure, has no I/O, and is tested on its own.
- **Honest numbers.** The app would rather say "I assumed a medium apple" than
  print a confident wrong figure. Estimates carry their assumptions and a
  confidence. Do not round a doubt away.

---

## Layout

```
packages/engine        pure TDEE / trend / targets maths, no I/O        166 tests
mobile                 the Expo app                                     851 tests
  app/                 expo-router screens (file-based routes)
  src/db/              SQLite schema + queries; migrations by user_version (v1..v8)
  src/social/          everything Supabase: api, feed, errors, session, types
  src/ai/              meal estimation prompts and parsing
  src/platform/        web-only pieces (the share card canvas lives here)
  src/components/      shared UI
  src/theme/           palette, spacing, type; `sessionTheme` is the loud one
services/gemini-proxy  Cloud Run: holds API keys, serves the web build 133 tests
supabase/migrations    the live database's history
evals, tools           eval harness and scripts
```

`@adaptive-macros/engine` is imported by the app; it never imports back.

---

## Commands

From the repo root:

```bash
npm test            # all three workspaces
npm run typecheck   # all three workspaces
npm run web         # Expo dev server (Metro) on 8081
```

From `mobile/`: `npx vitest run path/to/one.test.ts` for a single file,
`npx tsc --noEmit -p .` for types alone.

**The typecheck trap.** `mobile/.expo/types/router.d.ts` is generated, git-ignored,
and written *only* by the Metro dev server. If typecheck suddenly complains about
route strings (`/people`, `/profile`, …), the file is stale: run
`CI=1 npx expo start --web --port 8199`, wait until it mentions the route, kill it.
`expo export` does not write it.

---

## The one rule that matters

> A post is readable by its author, by an approved follower, or by anyone signed
> in when the author is public — and in every case only when neither party has
> blocked the other.

It is written **once**, as `private.can_see(author uuid)`, and the posts, likes
and profiles policies all call it so the logic cannot drift apart.

Three things sit in schema `private` — `can_see`, `visible_profile`,
`blocked_between` — for one reason: PostgREST exposes functions in exposed
schemas over `/rest/v1/rpc/`, and in `public` these would let anyone ask *"has
this person blocked me?"* directly. The first review of that migration found
three such oracles. **Nothing that can answer that question may live in a schema
the Data API serves.** Verify after any change:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "$SUPABASE_URL/rest/v1/rpc/can_see" -H "apikey: $PUBLISHABLE_KEY" -d '{}'   # must be 404
```

Related invariants, each with tests:

- A blocked follow **does nothing quietly** — a trigger drops the row rather than
  raising — so a refusal cannot be told from a success.
- The blocked list reads a **snapshot** written when you blocked someone, never
  their live profile. Reading it live would let anyone read a profile across a
  block by blocking back; hiding the row instead would announce the block.
- Two leaks are accepted and documented in the migrations: a username still
  reports as taken by an account that has blocked you (every username system must
  say a name is taken), and the block snapshot refreshes if you unblock and block
  again.
- A trigger function needs no `execute` grant. Supabase grants one to every new
  function and its advisor then reports each as reachable over `/rpc`; the
  migrations revoke them. Keep doing that.

---

## Supabase, concretely

Project `eigtmrtavtpzzjzfcskc`, Postgres 17.11. The app uses the **publishable
(anon) key only**, from `mobile/.env.local` (git-ignored) as
`EXPO_PUBLIC_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPABASE_URL`. The service-role
key is not used anywhere and must never enter the repo or a bundle.

- **Auth** is a six-digit code by email through the owner's Gmail SMTP. The
  templates deliberately contain the code and no link: a link opens Safari, not
  the installed PWA.
- **"Automatically expose new tables" must stay ON** in the dashboard. The
  migrations create tables and rely on Supabase's default grants plus RLS; they
  issue no grants of their own. Turning it off lands new tables ungranted and
  every social call fails with "permission denied".
- `blocked_words` has RLS and deliberately **no policies**, so nobody can read or
  write the list. It ships empty; the filter matches nothing until the owner adds
  words in the dashboard.
- Reports are writable and never readable by users. Three distinct reporters hide
  a post from everyone but its author, by trigger.

---

## Deploying

Once its one-time setup is done, a push to `main` deploys itself:
`.github/workflows/deploy.yml` runs the tests, builds, deploys and verifies,
from the same push that makes Supabase apply any new migration. Setup and
details are under "Deploying from GitHub" in `services/gemini-proxy/README.md`.
The manual steps below still work and are the fallback.

One Cloud Run service serves both the API and the exported web app from a single
origin, so there is no CORS. The web build is **not committed** — stage it first
or you deploy whatever `web/` happened to hold.

```bash
cd mobile && rm -rf dist && npx expo export --platform web
mkdir -p ../keep && cp -r ../services/gemini-proxy/web/_expo/static/js/web/. ../keep/
rm -rf ../services/gemini-proxy/web && cp -r dist ../services/gemini-proxy/web
cp -n ../keep/* ../services/gemini-proxy/web/_expo/static/js/web/ ; rm -rf ../keep
```

That `keep` dance matters: a page open across a deploy asks for code files by
their old names, so the previous build's chunks are kept alongside the new ones.
Then, **from PowerShell**:

```powershell
cd services\gemini-proxy
gcloud run deploy gemini-proxy --source . --region asia-southeast1 `
  --allow-unauthenticated --timeout 120 --quiet
```

`GEMINI_API_KEY`, `PROXY_TOKEN`, `USDA_API_KEY` and `SUPABASE_URL` are already set
on the service and survive a deploy. `--set-env-vars` **replaces the whole set** —
use `--update-env-vars` to change one.

**Verify the body of `/_health`, not its status.** Every path that does not look
like an asset falls back to `index.html` with a 200, so a broken build still
answers `/_health` — with HTML. It must be the text `ok`. Then check the entry
hash being served matches the one you built, and that `/api/nonsense` is 404 while
a token-less `POST /api/gemini` is 401. More in
`services/gemini-proxy/README.md`.

---

## How work is done here

- **Scope.** Change what the task requires and nothing adjacent. Match the
  surrounding style even where you would write it differently. Mention
  pre-existing problems rather than fixing them in passing.
- **Simplicity.** The minimum that solves the problem. No speculative
  abstractions, no configurability nobody asked for, no error handling for
  impossible cases.
- **Comments say why, in full sentences.** This codebase is unusually heavily
  commented and the comments explain decisions, not mechanics — why a trigger
  returns null, why a scrim has three passes. Match that. A comment restating the
  code is worse than none.
- **Errors are one sentence**, mapped through `mobile/src/social/errors.ts`, and
  never reveal why something failed when the reason could be a block.
- **Touch targets are at least 44 points.** `hitSlop` is ignored by
  react-native-web, so give a small control real height. `TOUCH_TARGET` lives in
  `src/components/Controls`.
- **Tests cover pure modules and the database, not screens.** There is no
  component-test harness and adding one is a decision, not a detail. If you want
  to test logic inside a screen, move the logic out — that is why `feedRules.ts`
  and `shareCard.ts` exist.
- **Verify before claiming.** Run the command and read the output. "Should work"
  is not a result.

Commits are written in prose that explains the decision, not a changelog line.
Look at `git log` before writing one.

---

## Things that have already cost someone a day

- **`display: none` on a file input** stops several phone browsers opening the
  picker at all. Park it off-screen instead.
- **HEIC.** Phone photographs often are, and plenty of browsers refuse to decode
  them. Any image path must say so rather than failing silently.
- **A promise with no `catch` in a React effect** swallows the failure and leaves
  the previous state on screen, which users report as "nothing happens".
- **`canvas.filter`** needs Safari 16.4+; so does `ctx.letterSpacing`. Both
  degrade silently, which is why the card does not depend on either for
  legibility.
- **The model allowlist** in `services/gemini-proxy/src/geminiProxy.ts` must stay
  in lockstep with `MODEL` in `mobile/src/api/gemini.ts` and
  `mobile/src/ai/geminiDescribe.ts`, or every lookup fails with a message that
  never says the word "model".
- **`PROXY_TOKEN` is in the client bundle** by design — the browser needs it.
  Rate limits cap what an extracted token is worth; they are not a security
  boundary. Per-user limits key on the verified Supabase JWT instead.

---

## Where the current work is

`docs/superpowers/specs/` holds design documents, `docs/superpowers/plans/` the
implementation plans written from them. The two most recent describe the social
feature that shipped on 2026-10-14. `HANDOFF.md` is a snapshot from 2026-10-01
and is out of date; this file supersedes it.

Open threads, in the owner's priority order: a Hevy-style share-card composer
(transparent overlay, drag, resize, choose which blocks show); subject
segmentation so the type can sit behind the person; the feed showing the real
card image, uploaded when there is a photo and drawn from the post's data when
there is not. The last of those brings user-uploaded photographs, which no word
filter can inspect — reporting and hiding become the only defence, and that is a
decision to make deliberately rather than discover.
