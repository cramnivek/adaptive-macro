# Compact Trends and bold check-in recap implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the independent presentation tasks below.

**Goal:** Implement Marc's approved compact Trends preview and bold, manually navigated check-in recap.

**Architecture:** Keep the existing calculations, review requests, eligibility, storage keys and adjustment handlers. Add a pure period-map model and a small presentation component for Trends. Add a recap presentation before the existing review summary, which remains reachable directly through Skip to summary.

**Tech Stack:** Existing Expo 57, React Native, TypeScript, bundled Space Grotesk, theme tokens, SVG and the existing native-driver Animated entrance helper.

## Global constraints

- Red, near-black and off-white Stärke identity; existing BrandLockup and bundled typefaces.
- Full red selected tabs, at least 44-point controls, readable large text, theme-aware colors.
- Missing data is not zero intake or failed exercise. Weight changes use neutral color and do not imply fat loss.
- No new dependencies, database migrations, health algorithms, authentication changes or persisted-key changes.
- Preserve weekly/monthly/quarterly review eligibility, saved reviews, loading/error paths, science details and explicit adjustment preview/Apply.
- Motion is brief, manual and silent; existing reduced-motion preference settles immediately. Reuse the existing motion stack rather than expanding dependencies.
- Preserve untracked user documents. No merge to main.

## Task 1: Trends period navigation and overview

**Files:** mobile/app/(tabs)/trends.tsx; mobile/src/components/Screen.tsx; new mobile/src/trendsOverview.ts, mobile/src/components/TrendsOverview.tsx and mobile/src/__tests__/trendsOverview.test.ts.

**Interfaces:** buildPeriodMap({from,to,foodDates,leftOutFoodDates,weightDates,trainingDates,maxColumns}) returns date buckets with unique-day counts per subject. periodWindow(today,days,offset,historyDays=365) returns bounded from/to/maxOffset. Screen gains an optional scrollRef; existing callers are unchanged.

- [x] Test inclusive boundaries, repeated same-day records, incomplete food days, missing versus recorded days, and historical-window bounds.
- [x] Implement the pure model and run its focused Vitest tests.
- [x] Put timeframe/range/focus controls before subject content. Reset scroll immediately on focus changes. Use solid red selected pills.
- [x] Replace Overview's duplicate weight chart and accordion stack with a compact recorded-days map and three factual period figures. Each map row opens its subject tab.
- [x] Keep the weight chart on Body, the food/energy chart on Food and training bars on Training. Keep detailed reports in their subject, with secondary Body reports behind an explicit disclosure.

## Task 2: Check-in recap presentation

**Files:** mobile/src/components/WeeklyReviewModal.tsx; new mobile/src/components/CheckInRecap.tsx, mobile/src/checkInRecap.ts and mobile/src/__tests__/checkInRecap.test.ts.

**Interfaces:** CheckInRecap consumes existing weekly or monthly extracted metrics, units and onSummary. It does not fetch or write data. The modal owns its presentation mode and preserves its original summary callbacks and content.

- [x] Test truthful chapter facts for weekly/monthly/quarterly, missing food/weight and unit formatting.
- [x] Create five manual chapters: period, food, body, training, next period. Bold display type and large figures, progress segments and persistent Skip to summary, Close and Back/Next.
- [x] Integrate as a full-screen modal presentation when a saved/generated review exists. Preserve locked, ready, loading, error, previous-review and review-mode paths.
- [x] Reset chapter/summary state on open or period/mode changes; support replay from summary. Use the existing reduced-motion-aware entrance helper, no autoplay or sound.
- [x] Run focused tests and typecheck. Review both requirements and adjustment safety.

## Task 3: Verification and release preparation

**Files:** DESIGN.md; scoped verification artifacts under .superpowers/trends-recap/.

- [x] Update design context for the approved navigation and recap.
- [x] Run root tests/typecheck and web/Android exports.
- [x] Browser-check phone widths, empty/populated periods, each focus tab, range paging, recap navigation/skip/replay, weekly/monthly modes and reduced motion. Keep honest limits if a live AI request cannot be exercised.
- [x] Obtain an independent code review, address actionable findings, commit and attach a draft stacked PR. Report what is implemented and what remains pending; do not imply physical phone validation.

## Verification record

Root tests: 1,894 passed (252 engine, 1,465 mobile, 177 proxy). Root typecheck and web/Android exports passed. Browser checks used 393px and 320px viewports, real guest navigation and isolated fictional recap fixtures; the temporary fixture route was removed before production exports. Independent review has no outstanding findings. No physical-device validation or live AI review request was performed.
