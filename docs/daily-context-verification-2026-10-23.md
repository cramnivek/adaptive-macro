# Daily logging and health-context verification

Feature branch: `codex/daily-logging-context`, based on the accepted photo/storage
fix branch. PR #53 is stacked on #52. No main merge, Supabase migration, or new
Cloud Run deployment was performed for these features.

## Checked

- Full local tests: 252 engine + 1,330 mobile + 155 proxy = **1,737 passed**.
- All workspace typechecks passed; mobile typecheck was repeated after the
  source-reconciliation fix. CI at `07df9fe` also passed install, typecheck and
  the full tests: https://github.com/cramnivek/adaptive-macro/actions/runs/39812309475 .
- Final web and Android exports passed. Android Hermes entry is
  `entry-309fd5b61061ab74d552c3856937e15a.hbc` (7.9 MB).
- Real SQLite tests cover saved estimate evidence, old/malformed optional
  metadata, backup/restore, sleep source corrections/deletions, older history,
  clearing, and refusing writes through a closed account handle.
- Pure tests cover sleep stage/overlap/date handling and sodium coverage,
  complete-day requirements, baseline, and weight/sodium display boundaries.
- Browser verification used a separate localhost guest profile and synthetic
  setup data. Desktop and a 393 px iframe showed all four meal-entry actions.
  Description, search, barcode and photo routes preserved `meal=lunch`;
  replacement navigation returned to the diary. The barcode permission-empty
  state retained Search by name instead. No camera permission was granted and
  no model request was made during this UI check.
- Independent code review found stale source-deleted sleep intervals. Two real
  SQLite reproductions failed before the fix and pass after it. Re-review found
  no remaining critical or important issues.

## Limits and pending device work

The generic premium web UI auditor reports 98 `affordance.actionless-button`
findings. Its action detector does not recognize the React Native `onPress`
handlers on these Button components. Canonical map resolution has no unresolved
findings, but this is **not a clean static audit** and is not evidence of native
accessibility. Button roles and the changed navigation were inspected in the
browser. Physical Android spacing, large-text behavior, and Garmin permission
and import still need device acceptance.

Android internal development build:
https://expo.dev/accounts/zeldrich/projects/adaptive-macros/builds/152e4045-0da2-4d57-82ff-8e98a0b103a2
was submitted using existing credentials and was still `IN_QUEUE` at the last
check. Its native source includes READ_SLEEP; JavaScript updates are served by
Metro. It is not an available APK or a successful native build yet. Existing
clients can receive the UI changes, but a client declaring READ_SLEEP must be
installed before the new permission can work.

Then enable Garmin sleep sharing into Health Connect, review Ascend permissions
in Account, and sync. Verify a known night against Garmin, deny sleep while
retaining steps/weight, repeat sync without duplicate duration, and check a
source correction. Garmin documents sleep stages among shared data:
https://support.garmin.com/en-GB/?faq=JToBEy0jfe6pIygark2Ui5 .

The micronutrient prompt now asks to omit unknown values rather than report
zero. This does not prove model accuracy or repair unknown historical zeros.
Weight context describes logged observations and possible water retention; it
does not diagnose causation, measure fat change, or modify engine targets.
