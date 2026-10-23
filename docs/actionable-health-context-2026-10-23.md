# Actionable sleep and weight summaries

Sleep and weight now lead with an interpretation and a next step, with data
requirements and import metadata behind Details. The same components are used
on Today and Weight. Existing theme, targets and account isolation are preserved.

Sleep distinguishes enough recorded time, a fully observed short recording,
missing data and incomplete recording. CDC's minimum duration reference is
eight hours for ages 13–17 and seven hours for adults; no adult default is
applied to unsupported/unknown ages. Duration is not a quality/recovery score.
At least three fully observed dates are needed for a recent average; counts
are shown and missing dates are excluded. Naps and split sessions can contribute
to each waking date, so the summary does not promise uninterrupted sleep.

New local SQLite migration v17 preserves known awake/sleep intervals. Exact
interval unions determine coverage before minutes are rounded for display.
Older rows and backups keep unknown coverage until a refreshed import supplies
it. Real SQLite tests cover v16 upgrade, new backup round-trip and legacy rows.
No applied migration was edited, and there is no Supabase migration.

Weight prioritizes its weekly average and regular weigh-in advice. A salt
explanation appears only when the existing complete-data rules pass, and names
the dated individual reading and value rather than implying it explains the
weekly change. It suggests comparing subsequent readings instead of cutting
calories because of one jump. Missing salt values remain unknown; eligibility
and arithmetic are available in Details.

An empty food log now shows “Log a meal to see your nutrition summary” rather
than a low nutrition score and “Needs focus.” No scoring-engine formula changed.

## Verification

- All 1,780 tests pass: engine 252, mobile 1,373, proxy 155.
- All workspace typechecks and Android/web exports pass.
- Regression coverage includes age boundaries, missing/partial coverage, a
  20-second recording gap, recent-date windows, duplicate stage unions, local
  migration and backups. The coverage failures were observed before their fixes.
- Actual components, real app fonts and 393/320-point content widths were checked
  in the browser for adequate/short/partial/missing sleep, load failure, eligible
  salt context, missing salt evidence and expanded/collapsed details, with dark
  and light themes. Empty
  nutrition has no score. Service and native-storage boundaries were mocked;
  this does not establish physical Android layout or import acceptance.
- Astra reviewed the changes; its rounded-coverage finding was fixed and the
  re-review has no remaining important findings.

GitHub CI at `62c5d1f` also passes. The source is available through the development
server. Standalone APK build `5978853e-9eb1-4826-bc34-04ea2ac488cd` is in progress,
with the matching `62c5d1f` source metadata:
https://expo.dev/accounts/zeldrich/projects/adaptive-macros/builds/5978853e-9eb1-4826-bc34-04ea2ac488cd

The previously shared APK embeds older JavaScript. Native
installation and device acceptance remain separate from export verification.
There is no new production web deployment or main merge for this feature pass.

References: [CDC sleep guidance](https://www.cdc.gov/sleep/about/index.html),
[American Heart Association sodium guidance](https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/sodium/effects-of-excess-sodium-infographic).
