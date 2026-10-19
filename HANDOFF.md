# Handoff

State of play on **2026-10-19**. For how the repository works — layout,
commands, the security model, the rules — read [AGENTS.md](AGENTS.md) first;
this file is only what is in flight and what to do next. It goes stale the
moment branch `claude/updates-overview-y2g5ve` merges. The 2026-10-01 snapshot
it replaced is [docs/handoff-2026-10-01.md](docs/handoff-2026-10-01.md).

---

## Where things stand

Branch `claude/updates-overview-y2g5ve` is **five commits ahead of `main`, not
merged, not deployed**. Nothing on it is live, and nothing on it has reached the
database.

1,483 tests pass (`npm test`: engine 207, mobile 1,133, gemini-proxy 143) and
`npm run typecheck` is clean, both run on the branch head.

| Commit | What |
| --- | --- |
| `3980858` | Workout screen: floating rest timer and Finish, a tap no longer zeroes a set, dumbbell loading labels, rack hint honest about plates, reorder by tap-to-place |
| `016ec8d` | Sign-in redesign; its privacy copy made true |
| `bd09b62` | Onboarding and focus picker: plain copy, the app's own colours, Home banner's nested-button bug |
| `7438ef2` | **Squad access migration** — the only commit that touches the database |
| `ad26918` | GitHub Actions: test every PR, deploy `main` to Cloud Run |

---

## Do these, in this order

**1. The one-time Google setup for automatic deploys.** PowerShell commands
under "Deploying from GitHub" in
[services/gemini-proxy/README.md](services/gemini-proxy/README.md). They end by
printing three values.

**2. Add those three as GitHub repository *variables*** (Settings → Secrets and
variables → Actions → Variables): `GCP_PROJECT_ID`,
`GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_DEPLOY_SERVICE_ACCOUNT`. Variables, not
secrets; none is a credential.

**3. Only then, open a PR from the branch and merge it.** The merge makes
Supabase apply `20261019120000_squad_access.sql` to production and the workflow
deploy the matching app from the same push.

> **Do not merge before step 2.** The deploy job skips itself until the
> variables exist. The migration would go live without the app that matches it,
> and **joining a squad stays broken** until someone deploys by hand: the old
> app finds a squad by reading it, which the migration forbids, and the new app
> joins through `join_squad`, which only the migration creates. Deploying the
> new app *before* the migration fails the same way in reverse.

**4. Watch the workflow run** (Actions → Test and deploy). Its last step checks
`/_health` is the text `ok`, the served entry file is the one it built,
`/api/nonsense` is 404 and a token-less `POST /api/gemini` is 401. It has never
run for real — the first merge is its first test.

**5. Check the database side by hand:**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$SUPABASE_URL/rest/v1/rpc/in_squad" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" -d '{}'     # 404: private schema
curl -s -X POST "$SUPABASE_URL/rest/v1/rpc/join_squad" \
  -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" -d '{"code":"X"}'  # refused: signed out
```

and the existing `can_see` check in AGENTS.md, which must still be 404.

**6. On a phone, from the home-screen app:**

- Join a squad with its code; a wrong code says no squad has it.
- Log a workout: Finish and the rest timer float at the bottom and step aside
  while typing; tapping a weight and leaving it keeps the number; move an
  exercise several places through the reorder sheet.
- Sign out, sign in by email code — iOS should offer the code above the keyboard.
- **Continue with Google from the installed app.** Unverified, and the one that
  may not work: if sign-in finishes in Safari, the installed app (separate
  storage) stays signed out. If so, hide the Google button when running
  standalone on iOS and leave the email code.

---

## Found this session, and still open

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
- AGENTS.md's applied-migration list stops at 2026-10-14 and its test counts are
  from then; it does not mention squads or that sign-in is required.

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
