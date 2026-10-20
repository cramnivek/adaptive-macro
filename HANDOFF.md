# Handoff

State of play on **2026-10-20**. For how the repository works — layout,
commands, the security model, the rules — read [AGENTS.md](AGENTS.md) first;
this file is only what is in flight and what to do next. Earlier snapshots:
[docs/handoff-2026-10-01.md](docs/handoff-2026-10-01.md); the 2026-10-19 one is
this file's git history.

---

## Where things stand

**Merged and live since the 2026-10-19 snapshot:** PR #22 (squads private to
their members, automatic deploys), #24 (old code files kept across deploys),
#25 (optional account, one-step onboarding, leaner Settings, both sides of a
dumbbell set, a limit on squad-code guesses) and #26 (the routine screens, and
a barcode camera that focuses on the web). The database has every migration in
the repository, the last being `20261020120000_squad_join_limit.sql`.

**In flight:** branch `claude/updates-overview-y2g5ve`, after #26 — Left/Right
spelled out under one-sided sets, the sticker preview no longer cropped, the
routine editor's back arrow, reordering that keeps supersets together, the
barcode decoder served by the app, entering an unknown barcode from its label,
building a day more than once a week, and this file. See `git log origin/main..` on it for the exact list.

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
  exercise several places through the reorder sheet, and a superset as one.
- **Scan a barcode** (#26). Checked only against a simulated camera: the
  stream is 1920×1080 and a code in the box reads. Sharpness, focus and the 2×
  zoom (`scanZoom` in `src/platform/scanGeometry.ts`) need a real phone. The
  decoder's WebAssembly is served by the app itself, not jsDelivr. A barcode
  Open Food Facts lacks can be entered from the label and scans to it after.
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
- **Invite codes came from `Math.random`**, and nothing limited how often
  `join_squad` could be called. Fixed after this snapshot: codes come from
  `expo-crypto`, and `20261020120000_squad_join_limit.sql` allows twenty tries
  per person per hour, wrong guesses counted. To count them, an unknown code
  now returns null instead of raising — a raise would roll the logged attempt
  back.

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

- **Decided 2026-10-20: the account is optional again.** The sign-in screen
  offers "Use Ascend without an account", which sets `accountSkipped`, and
  `AuthGate` then stops sending a signed-out person to sign-in. The social
  screens already ask for an account on their own. AGENTS.md's "everything
  works signed out" is true again.
- **Sign-in uploads the baseline** — profile, starting weight, goal, units — to
  Supabase `user_metadata` (`social/baselineSync.ts`). The sign-in screen now
  says so. The privacy policy should be checked against it.
- **Decided 2026-10-20: the focus step left onboarding.** First run is one
  screen of numbers. The focus is still in Settings, still label-only, and the
  Today banner that promoted it is gone.
- **Home "Balanced" and "Food first" lay Today out identically.** The copy now
  admits it; the behaviour is unchanged.

### Known rough edges

- **Dumbbell weights are now labelled as one dumbbell's** (`src/dumbbellLoad.ts`),
  but older history may mix conventions — one Bulgarian split squat PR reads
  70 lb against sets logged at 32. Volume counts one dumbbell, not the pair.
- **Fixed: reordering split supersets.** `src/blockOrder.ts` moves a superset
  as one, gathers members that had drifted apart, and never drops an exercise
  inside another superset. The routine editor does not keep superset links at
  all — that was so before and is unchanged.
- **A deliberately typed lone `0` over a prefilled weight is put back** on blur,
  the cost of stopping a look-and-leave tap from zeroing a set. Clearing the
  field (BW) still works. Ticking a set straight from such a field also takes
  the old number: on iOS Safari the tick can land before the field's blur.
- **One-sided dumbbell work assumes both sides match.** One weight and rep
  count is logged, and the row shows `Left 105 × 13 · Right 105 × 13`; a pair shows its
  total. Sides that differ cannot be logged yet.
- **A squad can read as full because of a member you cannot see** across a
  block — the accepted leak, documented in the migration.

### Small, low-risk follow-ups

- Done on 2026-10-20: the unused feature-interest components are deleted
  (`features/featureInterests.ts` stays; settings still store the field), the
  sticker modal's `backgroundPosition` error is gone, an unknown stored card
  template falls back to the default, the workflow's actions run on Node 24,
  and the remaining generated-sounding default copy was reworded.
- Done: AGENTS.md describes squads and lists `20261020120000_squad_join_limit.sql`.

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
