# Ascend touched-workflow contract

This records the 2026-10-22 meal-entry and local health-context changes. Existing
business and privacy rules remain in AGENTS.md; visual owners are in DESIGN.md.

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
| --- | --- | --- | --- | --- |
| Toast | `mobile/src/dialog.ts` | Existing notify/confirm callers | notify, confirm | Existing workflow tests and runtime feedback |
| CRUD | Expo Router and SQLite query layer | AGENTS.md and this contract | create, edit, remove | Query tests, backups, navigation checks |

## Changed workflows

| Workflow | Owner | Behavior and verification |
| --- | --- | --- |
| Navigation and modal dismissal | Expo Router stack in `mobile/app/_layout.tsx` | Preserve the selected meal. Replace the Log a meal chooser with the selected logging route, so completing or cancelling that route returns to the diary. Verify all four choices and back. |
| Buttons | `mobile/src/components/Controls.tsx`, `Tappable.tsx` | Visible action labels and real 44-point targets; reuse shared primary/subtle styles. |
| Food edits and evidence | `EditEntrySheet.tsx` | Grams remain editable. Show original estimate confidence/assumptions only for the entry's matching cached food. Save metadata in SQLite and backups. |
| Feedback and destructive confirmation | `mobile/src/dialog.ts` and existing callers | Retain the app's shared notify/confirm behavior; no new browser alerts. |
| Sleep import | Health Connect native permission screen and `healthConnect.ts` | Read only granted types. Sleep refusal leaves steps/weight useful. Local storage follows account selection; backups carry sleep. Native READ_SLEEP needs an updated build. |
| Health context states | `SleepSummaryCard.tsx`, `WeightContextCard.tsx` | Hide stale account/date results. Sleep has loading, failure and explicit missing-night states. Insufficient sodium evidence produces no personal attribution. |
| Weekly perspective | `WeightContextCard.tsx`, Weight tab | Always show the recorded seven-day average and coverage. Missing days are excluded; week-to-week change needs three readings per week. Explain sodium gaps instead of hiding the card. |
| Sleep permission review | `HealthConnectSection.tsx` | Request SleepSession specifically; do not treat an existing steps grant as success. Show permission state and settings access; refresh on return from Android settings. |
| Transparent stickers | `TransparentStickerModal.tsx`, `StickerDrawerDom.tsx`, `shareImage.ts` | Android draws in Expo DOM and shares a cache PNG with alpha. Web retains clipboard/export. Ignore stale renders and surface failures; destination app controls import. |

No model call is needed to open the chooser, repeat a meal, import sleep, or
compare sodium with weight. An AI estimate is an editable draft and is only saved
through the existing explicit save action. Known zero and unavailable nutrients
are distinct. Health context never changes adaptive-engine targets.

Pure logic, SQLite migrations, query behavior and backup compatibility use the
existing Vitest harness. Spacing and navigation use real runtime inspection; no
component-test harness is introduced. Static design audits do not establish
native permission, keyboard, or physical-phone behavior.
