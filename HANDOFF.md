# Handoff

State of play on **2026-10-20**. For how the repository works — layout,
commands, the security model, the rules — read [AGENTS.md](AGENTS.md) first;
this file is only what is in flight and what to do next. Earlier snapshots:
[docs/handoff-2026-10-01.md](docs/handoff-2026-10-01.md); the 2026-10-19 one is
this file's git history.

---

## Where things stand

**Nothing is in flight.** Everything is merged, live and checked. `main` is
`e219229` (PR #22), the app is the one the first automatic deploy built
(`entry-35d4f1ac…`), and the database has every migration in the repository,
the last being `20261019120000_squad_access.sql`.

1,483 tests pass (`npm test`: engine 207, mobile 1,133, gemini-proxy 143) and
`npm run typecheck` is clean, on `main`.

**Deploys are automatic now.** A push to `main` runs
`.github/workflows/deploy.yml`: test, build, deploy to Cloud Run, verify. Its
first real run, on the merge of PR #22, passed every step. The Google side signs
in by Workload Identity Federation — no key stored anywhere — and trusts only
pushes to `main` of this repository, identified by GitHub's numeric IDs
(repository `1374033579`, owner `54169123`), not the name. The deploy account
holds `run.sourceDeveloper`, `serviceUsageConsumer`, and `serviceAccountUser` on
the one runtime account. Manual deploys from PowerShell still work.

**The squad hole is closed.** Before PR #22, any signed-in user could read
every squad with its invite code, every member list and every cheer, and join
any squad without the code — production had run an earlier draft of the squads
migration. Read from `pg_policies` after the merge, every squad table now allows
reading only inside the squad and never across a block, and joining only goes
through `join_squad`. From outside: `in_squad`, `can_see` and
`check_squad_capacity` over `/rpc` are 404, and a signed-out `join_squad` is
refused. The one real squad and its two members came through intact.

---

## Do these

**On a phone, from the home-screen app** — the one check nothing here can make:

- Join a squad with its code; a wrong code says no squad has it.
- Log a workout: Finish and the rest timer float at the bottom and step aside
  while typing; tapping a weight and leaving it keeps the number; move an
  exercise several places through the reorder sheet.
- Sign out, sign in by email code — iOS should offer the code above the keyboard.
- **Continue with Google from the installed app.** Unverified, and the one that
  may not work: if sign-in finishes in Safari, the installed app (separate
  storage) stays signed out. If so, hide the Google button when running
  standalone on iOS and leave the email code.

The squad policies were proved against real Postgres as real roles by
`social-rls.test.ts`, on both versions of the schema. They could not be proved
against production as a signed-in stranger: the read-only database connection
may not switch roles. Joining with a second account from the phone is that proof.

---

## Found on 2026-10-20

- **One timing test could have decided a deploy.** `exerciseSearch`'s speed
  test timed a single call against 25 ms; it passed alone and failed under the
  full suite. Since a failed test skips the deploy while Supabase applies the
  migration anyway, it now keeps the fastest of ten runs. **Any test that reads
  a clock is a deploy risk here**; prefer the fastest of several runs.
- **A stored card template the app does not know crashes the finish sheet.**
  `TEMPLATES[settings.cardTemplate].place` throws for an unknown id, and
  `withDefaults` in `state/settings.ts` passes the stored value through
  unchecked. Only the person's own storage can set it, so it is a crash, not an
  exploit. The fix is to fall back to `DEFAULT_TEMPLATE` there.
- **A recursive delete that follows links will wipe the main checkout.** npm
  workspaces put junctions in `node_modules/@adaptive-macros/*` that point at
  the real `mobile/`, `packages/engine` and `services/gemini-proxy`. Deleting a
  worktree or a copy of the repo with `robocopy /MIR` from an empty folder
  followed them and deleted the main working copy's packages on 2026-10-20.
  Tracked files came back with `git restore`; the git-ignored
  `mobile/.env.local` did not and was rebuilt from known values. On Windows,
  delete `node_modules` with `cmd /c rmdir /s /q` (it does not traverse
  junctions) before removing anything else, or pass robocopy `/XJ`.
- **Automatic deploys were losing the previous build's code files.** The
  keeper found old files only through the live index.html, and files kept by
  one deploy are not linked from it, so the docs-only deploy of PR #23 logged
  "Kept 0 of 8" and dropped the pre-PR-#22 build's files (its entry now 404s).
  Fixed after this snapshot: every deploy now publishes `/code-files.json`,
  each file with the date it first went live, and the next deploy keeps every
  listed file younger than 30 days. The deploy also no longer passes
  `--allow-unauthenticated`, which only produced "Setting IAM policy failed";
  public access survives deploys on its own.
- **Invite codes come from `Math.random`**, six characters from 32, about a
  billion combinations, and nothing limits how often `join_squad` can be
  called. Fine for a group of friends; worth `crypto.getRandomValues` and a rate
  limit before squads are something strangers use.

---

## Found on 2026-10-19, and still open

### Production had drifted from the repository

Production ran an **earlier draft** of `20261018120000_training_squads.sql`; the
file was edited after it was applied, breaking the "an applied migration is
frozen" rule. The live database therefore had **no six-member limit, no
one-squad-per-person index, and cheers readable and writable by anyone**. The
squad-access migration repairs all three and was written to land on either
version. Production's real version is saved as
`mobile/src/social/__tests__/fixtures/training_squads_as_applied.sql`, and
`freshDatabase(asApplied)` in `postgres.ts` swaps it in, so the tests prove the
fix against both.

**Before writing any migration, compare against what production actually ran**,
not the file:

```sql
select version, md5(array_to_string(statements, E'\n'))
  from supabase_migrations.schema_migrations order by version;
```

The 2026-10-14 and 2026-10-18 profile migrations were checked and match.

### Decisions that are the owner's, not yet made

- **The app now requires sign-in** (`AuthGate.tsx`, PR #19). AGENTS.md still says
  nothing in the core app may depend on being signed in. One of the two needs
  to change; nothing records which was intended.
- **Sign-in uploads the baseline** — profile, starting weight, goal, units — to
  Supabase `user_metadata` (`social/baselineSync.ts`). The sign-in screen now
  says so. The privacy policy should be checked against it.
- **The onboarding "focus" step changes labels only.** The lose / maintain /
  gain choice on step 2 is what sets targets. Either make the focus do something
  or drop it from first run and leave it in Settings.
- **Home "Balanced" and "Food first" lay Today out identically.** The copy now
  admits it; the behaviour is unchanged.

### Known rough edges

- **Dumbbell weights are now labelled as one dumbbell's** (`src/dumbbellLoad.ts`),
  but older history may mix conventions — one Bulgarian split squat PR reads
  70 lb against sets logged at 32. Volume counts one dumbbell, not the pair.
- **Reordering can split a superset**; the sheet does not move a group together.
- **A deliberately typed lone `0` over a prefilled weight is put back** on blur,
  the cost of stopping a look-and-leave tap from zeroing a set. Clearing the
  field (BW) still works.
- **A squad can read as full because of a member you cannot see** across a
  block — the accepted leak, documented in the migration.

### Small, low-risk follow-ups

- Delete `FeatureInterestPicker`, `FeatureInterestModal` and
  `FeatureInterestOnboardingBanner` (and `features/featureInterests.ts` if
  nothing else uses it): not mounted anywhere, and still in the old
  multi-colour look.
- `TransparentStickerModal.tsx` logs `Invalid style property of "backgroundPosition"`
  on every web load.
- A few default-voice strings still read as generated, e.g. "Smart food lookup"
  in `app/search.tsx`. The gymrat voice's emoji are deliberate; leave those.
- AGENTS.md's migration list, test counts and deploy rule were brought up to
  date on 2026-10-20. It still does not describe squads, and still says the
  core app works signed out — which waits on the sign-in decision above.

---

## Traps met this session

- **Metro does not pick up file changes in the cloud container.** A change is
  invisible in the browser until the dev server is killed and restarted with
  `--clear`.
- **There is no Prettier config.** Running Prettier rewrites a whole file to
  double quotes and 80 columns; it was reverted once. Match the surrounding
  style by hand.
- **Previewing a screen locally needs two temporary patches**, never committed:
  `false && url && key` in `src/social/client.ts` (the app has live Supabase
  fallbacks compiled in, so sign-in is otherwise required) and
  `false && !settings.onboarded` in `src/components/AuthGate.tsx` (to skip
  onboarding). Playwright-core with `/opt/pw-browsers/chromium-1194` at 390×844
  worked for screenshots.
- **The cloud environment's `gcloud` has no credentials.** Its preset access
  token is a placeholder that Google rejects. Deploys go through GitHub Actions
  or PowerShell on the owner's machine.
- **The build needs no `.env.local`.** The source's compiled-in public values
  (Supabase URL and publishable key, proxy token) are the ones the live bundle
  carries, checked on 2026-10-19.
- **`expo export` takes about 40 seconds** and `typecheck` passes without the
  generated `router.d.ts`, so CI runs both.
