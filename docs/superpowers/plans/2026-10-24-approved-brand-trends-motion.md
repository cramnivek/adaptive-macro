# Approved Ascend brand, Trends and motion implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task by task. The user approved the visual previews and requested implementation on 24 October.

**Goal:** Ship the approved shared red identity, compact Today with an in-header wordmark, focused Trends and restrained accessible motion, including the pending local-day correction.

**Architecture:** Extend existing theme, Screen, Tappable, FadeIn and chart components. Trends keeps its existing local database calculations, check-in schedules and every detailed report, changing hierarchy rather than the engine. No new dependencies, migrations or account behavior.

**Tech stack:** Expo 57, React Native 0.86, existing Animated and SVG components, Vitest, Cloud Run, EAS preview APK.

## Global constraints

- Red primary actions `#D92D22`, white text; red active navigation uses theme contrast roles. Existing nutrient and error meanings stay intact.
- Wordmark `ASCEND ///` belongs in Today's existing header, never the system status bar or another header row. Preserve Settings and 44-point controls.
- Never insert prototype sample values into the app. Use existing derived period metrics and confidence/coverage rules. Missing data is not zero; no speculative sleep-quality or sodium-causality claims.
- Existing health data, manual history selection, check-in schedules, saved reviews and detailed reports remain accessible. A chart-period change must not silently apply a goal or request AI.
- Motion is short, interruptible and never delays persistence or navigation. Reduce Motion suppresses movement. Reuse the current native-driver opacity/transform infrastructure; no per-frame React state or new sound.
- Work on current `codex/local-day-and-today-density`, retaining its authorized uncommitted changes. Do not stage unrelated user documents or merge main.

### Task 1: Focus Trends around the selected period

**Files:** `mobile/app/(tabs)/trends.tsx`; optional pure summary helper under `mobile/src/` and associated Vitest test.

- [ ] Read the approved concept at `.superpowers/design-journal-preview/trends-review.md` and inspect existing derived metrics/render groups in Trends.
- [ ] Replace the stacked overview with compact Week/Month/Year controls, the actual covered range, a factual summary and three figures: period weight-trend change, average counted intake, workouts. Retain explicit insufficient-data wording.
- [ ] Add Food to Overview/Body/Training focus controls. Show one main chart for each focus (weight, energy/intake, or training), reusing LineChart/WeeklyBars. Keep changes neutral in color and permit explicit deeper inspection.
- [ ] Put Body & weight, Food & energy, Training & muscles detail behind accessible disclosure controls in Overview; preserve all existing report content, methods, steps editing and check-in history. Filter views reveal their relevant details. Keep the check-in action after the main chart with existing ready/locked/saved logic.
- [ ] Reuse `FadeIn` around the main chart with a key derived from timeframe and focus for a brief native-driver transition; do not animate the numerical engine or trigger network calls.
- [ ] If adding summary logic, first test missing data, zero workouts, singular/plural and period inputs with Vitest, then implement only the needed logic. Run relevant existing period tests and mobile typecheck.
- [ ] Report changed files, test evidence, retained flows and any limitations; no commits while root edits other files.

### Task 2: Complete shared branding and motion

**Files:** Today, optional BrandWordmark component; `mobile/src/theme/motion.ts`, `Tappable.tsx`, `LineChart.tsx`, `PRCelebration.tsx`; DESIGN.md.

- [ ] Keep the pending tested date observer and theme/density edits; add a small accessible wordmark beside the Today title through Screen's existing action slot. Keep layout wrapping safe at narrow widths and large text.
- [ ] Audit existing press, entrance, chart and record motion. Make reduced motion suppress scale/translation/particles and settle values immediately; stop animations on teardown or a superseding target.
- [ ] Keep regular feedback around 90-220 ms. Use the existing set check feedback and shorten the PR flourish without removing the readable record result. Do not touch audio handling.
- [ ] Update DESIGN.md with approved wordmark placement, Trends hierarchy and motion behavior, preserving canonical token ownership.

### Task 3: Review, verify and deliver

- [ ] Review combined diff against the approved previews and user data boundaries; run root tests, root typecheck and web/Android export. Browser-verify actual Today/Trends with clearly isolated fixture data and I/O boundaries, including empty coverage, disclosures, date rollover and narrow width.
- [ ] Commit only requested changes, push branch, create a stacked draft PR against `codex/bound-photo-estimate-latency`, attach it to this chat, and inspect checks. Do not merge main.
- [ ] Stage exported web while retaining live chunks, deploy Cloud Run using PowerShell, verify exact health text, entry hash/assets, unknown API 404 and tokenless Gemini 401. Record evidence.
- [ ] Start one EAS Android preview build from the committed source. Confirm the source SHA and finished APK, or install a quiet completion heartbeat if still running. Never imply physical-device validation.

## Verification before release

Approved by the user after the Today and Trends previews, motion discussion and
in-header wordmark decision. No new native dependencies or database migrations.

1,871 root tests passed (engine 252, mobile 1,442, proxy 177), root typecheck
passed, web export passed. Independent lower-cost code review passed spec and
quality checks after correcting period bins, missing-data copy and disclosures.
Browser checks used actual AppProvider, Today, Trends and charts with mocked
database/auth boundaries and fictional records. Verified selected-period changes,
empty history, compact wordmark/44-point Settings at 320 px, diary entrance
settling, local-day resume and preservation of deliberately selected history.
Physical-device validation is not claimed.
