# Compact Today and selective food repeat

**Goal:** Show macros and food logging at first glance, and let people reuse individual foods from their own recent diary.

**Design:** Keep Ascend's existing fonts, themes and semantic macro colors. Replace Today's wrapped large ring with a compact calorie line and three short macro columns. Remove the duplicated date label. Put Log a meal and the diary immediately after the summary; make per-meal add controls quiet 44-point actions. Put target arithmetic, sharing and completeness controls behind Food details, and activity/sleep/check-in cards behind More for today below the diary. The user's follow-up explicitly removes the workout/routine shortcut and weight summary from Today; those remain in their own tabs. No smaller touch targets, hidden nutrition numbers, new illustrations or network-dependent suggestions.

**Repeat:** Open a previous day's foods with individual selection, none selected initially; meal-level select-all remains an explicit convenience. A meal's repeat shortcut opens this picker instead of copying immediately. Offer up to three usual foods for the selected meal in Log a meal, ranked by distinct logged days then recency over the preceding 28 days. Reuse the latest logged amount and disclose it. Omit foods already present in that meal. Suggestions are local history, not an AI inference, and saving always requires an explicit tap. Existing source data and dates remain unchanged.

**Owners:** MacroProgress owns the business-named compact summary variant. Today owns disclosure state/order. Repeat and Log a meal reuse Controls/Tappable/Expo Router. AppStore and SQLite own copying selected source entry IDs transactionally; an empty selection copies nothing. History reads must discard stale date/account results; failures have retry feedback.

## Tasks

- [x] Add tested selected-entry copy support, local usual-food ranking and a selectable repeat picker.
- [x] Add compact macro variant and food-first Today layout with secondary details disclosed on demand.
- [x] Verify ranking/copy invariants, full tests/types/exports and actual components at narrow phone widths, both themes and missing/error states.
- [ ] Publish a focused PR and verified web deployment; build an Android preview from the final commit.

**Scope:** No engine target changes, migrations, account behavior changes, native dependency updates, social redesign or workout editor changes. Existing shared controls remain canonical rather than introducing a parallel native control system.

## Verification and follow-up

The full workspace suite passed with 1,823 tests; updated onboarding/copy/ranking tests also passed after the final onboarding change. A further ranking cap test verifies the three-item limit without mutating source history. Workspace typechecks and web/Android exports pass. The obsolete Home screen order question was removed from setup and the mission picker because Today no longer uses it; stored preferences remain compatible. Today's duplicate active-workout banner is removed; the existing floating resume control remains.

Actual Today/Log a meal/Repeat components were exercised with fixture diary/database boundaries at 320 and 393 points in light/dark themes. Verified detail expansion, no automatic meal copy, initially empty selection, one selected food copied, a suggested food added and then excluded, and suggestion-history error/retry. SQLite tests verify source isolation, preserved portions/micros, independent IDs and rollback. Browser fixture evidence does not establish physical Android behavior. The requested lower-cost worker and reviewer reached their usage limit; the parent completed inspection and verification without switching to Astra for implementation/review.
