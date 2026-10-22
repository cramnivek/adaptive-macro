# Daily Logging and Recovery Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put meal logging within clear reach, reclaim workout space, import Garmin sleep, and explain supported sodium/weight observations.

**Architecture:** Keep the existing Expo screens and SQLite account isolation. Separate sleep normalization and weight-context decisions into pure modules; compose their results into the diary without changing the adaptive engine.

**Tech Stack:** Expo SDK 57, React Native, TypeScript, expo-sqlite, react-native-health-connect, Vitest.

## Global Constraints

- No Supabase migrations or model-default changes.
- Keep data local and account-separated; preserve backup compatibility.
- Match existing visual styles and keep touch targets at least 44 pt.
- Missing sodium remains unknown rather than zero.
- Append local SQLite migrations only.

### Task 1: Compact header and labelled meal entry

**Files:** `mobile/src/components/Screen.tsx`, `mobile/app/session.tsx`, `mobile/app/(tabs)/index.tsx`.

**Interface:** Add `topInset?: boolean` to Screen, default true; the session with a native header passes false. The diary chooser navigates to existing `/describe`, `/scan`, and `/search` routes with its current `meal`.

- [ ] Check header composition and use `paddingTop: (topInset ? insets.top : 0) + space.md` without changing other screens.
- [ ] Replace per-meal icons with a labelled entry action and the existing modal/sheet convention. Photo uses `{ meal, capture: 'camera' }`; description uses `{ meal }`.
- [ ] Exercise chooser navigation, back/dismiss, long meal labels, and narrow layout in the running app or browser. Use native inspection for spacing; do not add screen tests.

### Task 2: Optional sleep import and view

**Files:** `mobile/src/health/healthConnect.ts`, `healthConnectRules.ts`, new sleep normalization/query/component files, `mobile/src/db/schema.ts`, database backup/restore/clear paths, `mobile/src/components/HealthConnectSection.tsx`, `mobile/app.json`.

**Interface:** Export `SleepSummaryCard` without props, using the selected diary date from the existing store and refreshing on Health Connect sync. The parent task inserts it in the diary. Keep sleep persistence and migrations owned by this task until finished.

- [ ] Write pure tests for overnight dates, offsets, overlapping and duplicate intervals, missing stages, and repeat import; run the focused test and observe failure.
- [ ] Implement normalization and append the sleep schema. Test real SQLite upsert, round-trip backup/restore, old backup compatibility, and account-local clearing.
- [ ] Request SleepSession only as an optional read permission; independently gate reads by granted record type. Existing steps/weight access remains useful without sleep.
- [ ] Implement the summary and seven-day view with explicit empty, unavailable, and source states. Add READ_SLEEP to app configuration and identify the required native rebuild.
- [ ] Run focused tests and mobile typecheck; report exact files and any device-only acceptance checks.

### Task 3: Deterministic sodium and weight context

**Files:** New `mobile/src/health/weightContext.ts`, its pure tests, and a `WeightContextCard.tsx` component. Read existing diary and weight queries without adding schema or changing engine math.

**Interface:** Export `WeightContextCard` without props, keyed to selected diary date and existing refresh state. Pure logic accepts dated weight and daily sodium observations with explicit completeness and coverage.

- [ ] Write and run failing tests for missing sodium, incomplete days, inadequate baseline, no rise, ordinary sodium, and a supported high-sodium/weight-rise case.
- [ ] Use at least three qualifying baseline days from the previous seven days, excluding the preceding day being explained. Show a comparison only when weight rises at least 0.5% versus the most recent weigh-in within three days and prior-day sodium exceeds baseline median by at least 1,000 mg. These are display heuristics, not clinical thresholds.
- [ ] Return observed amounts and cautious copy: sodium may contribute through water retention; this does not identify the cause or measure fat change. Require explicit complete-day status and known sodium for all foods.
- [ ] Implement the card with existing styling and query paths, then run focused tests and typecheck. No API request or target changes.

### Task 4: Preserve saved estimate uncertainty and integrate

**Files:** `packages/engine/src/types.ts`, `mobile/app/describe.tsx`, food queries/schema in `mobile/src/db/index.ts` and `schema.ts`, backup/restore allowlists, the diary's food-details surface, `mobile/app/(tabs)/index.tsx`.

**Interface:** Food has optional `estimate: { confidence: 'low' | 'medium' | 'high'; assumption: string }`. Use optional metadata for old records and backups; persist it as nullable JSON in a new local migration after the sleep task's migration.

- [ ] Add meaningful food save/read and backup compatibility tests, run them to observe failure, then implement the optional metadata.
- [ ] In describe save, carry `draft.item.confidence` and `draft.item.assumption` into the food. Display those fields when opening that food from the diary.
- [ ] Insert sleep and weight-context cards without moving existing repeated/recent-meal actions or changing nutrition calculations.
- [ ] Review diffs for unrelated changes and verify full tests, all typechecks, web export, and Android export.
- [ ] Commit the feature changes separately from the accepted fixes, push a reviewable branch, and report native rebuild/device acceptance requirements without claiming unrun device tests.
