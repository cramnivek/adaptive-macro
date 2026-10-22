# Daily logging and recovery context

Approved direction: the owner's 2026-10-22 confirmation covers the compact workout
header, prominent AI meal entry, Garmin sleep through Health Connect, and cautious
weight-fluctuation context. These are four independently verifiable changes.

## Workout header

The native stack already draws the status-bar inset and back header. The workout
screen must not reserve that top inset a second time inside `Screen`. Keep the
safe area for screens without native headers. Keep workout controls, a readable
elapsed timer, and the fixed Finish workout action. Do not redesign exercise rows.

## Meal entry and estimates

Replace the diary's row of unexplained icons with a prominent labelled Log a meal
action. Its chooser offers Take a photo and Describe your meal first, followed by
barcode and food search. Existing recent-food and repeated-meal paths remain
available without a model call. Keep the selected meal when navigating.

AI results remain editable drafts: food, portion, confidence, and assumptions are
visible before saving. Retain the estimate's confidence and assumption with its
saved food so a later diary inspection can distinguish an estimate. Old records
and backups without this optional metadata remain valid. No new model or API call.

## Garmin sleep through Health Connect

Extend the existing read-only Android integration with optional SleepSession
permission. Refusing sleep must not break steps or weight. Show a recent nightly
summary and seven-day view in the diary, with source and missing nights explicit.
Read the recent 30 days of sleep and store locally per account. Bind the sleep
write to the database selected before native reads begin. Handle midnight, timezone offsets, duplicate
records, overlapping records, repeat sync, and sessions with missing stages.
Do not label a session's whole time in bed as measured sleep when stages are
missing. Preserve sleep through backup/restore and clear it with account-local
data. No cloud health upload or target-engine change. Add READ_SLEEP to native
configuration; the installed Android client needs a compatible native rebuild
before it can request that new manifest permission. Cloud Run cannot update it.

## Weight-fluctuation context

Use deterministic comparisons of weigh-ins and logged sodium, without a model
request. Only surface a sodium-related explanation when a weight rise coincides
with sodium above the person's recent logged baseline and the comparison days
have complete logs and known sodium for every contributing food. State the
observed amounts, dates, and that water retention is a possible contributor.
Never quantify fat versus water, diagnose a cause, or change calorie targets.
Missing sodium remains unknown rather than zero. Sparse evidence produces no
personal attribution. Sleep import initially stands on its own: it does not
establish a causal explanation for a weight change or a readiness score.

## Verification and delivery

Use pure-module and real SQLite tests for imports, overlap rules, nutrient
coverage, metadata, migrations, and backups. Do not add a component-test harness
for spacing or entry buttons. Run full tests, workspace typechecks, Android and
web exports, and inspect the changed screens in the available development client
or browser. Match existing visual styles and keep touch targets at least 44 pt.
Append local SQLite migrations only; no Supabase migration is needed. Publish
reviewable code separately from the already accepted photo/storage fixes.
