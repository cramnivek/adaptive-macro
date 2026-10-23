# Warmer daily design implementation plan

**Goal:** Apply the approved quiet daily companion concept to the core daily flows, using the existing fonts, native components and theme.

**Architecture:** Extend the existing Card's featured treatment and palette with a small set of semantic accents. Reuse one advice panel for sleep and weight guidance; keep dense history lists rule-led. No added packages, bitmap downloads, data changes or new scoring.

**Tech stack:** Existing Expo 57, React Native, Ionicons, Space Grotesk and IBM Plex Mono.

## Design and boundaries

The user approved the lilac sleep, weekly-average weight and clearly separated next-step concept, then requested the same philosophy elsewhere. Today and food logging use a soft neutral focal surface and a restrained nutrition accent. Sleep uses lilac; salt explanations use peach only when the existing evidence permits them. Missing data stays missing. Training's landing page gets calmer featured headers; the active logger, timer, navigation and exported share-card artwork remain unchanged.

## Tasks

- [x] Add light/dark semantic colors and optional icon/tone treatment to the existing featured Card. Keep ordinary list sections compact. Add a reusable labelled advice panel.
- [x] Apply the approved sleep and weekly-weight design. Show the seven-day sleep pattern without inventing a score; keep data requirements and history in existing Details controls.
- [x] Apply the same hierarchy to Today, meal entry, weight entry and Train home. Preserve every action, error state, permission control and persistence path.
- [x] Update DESIGN.md with accepted visual roles and boundaries. Run workspace types/tests and platform exports. Inspect real components at narrow widths in dark/light themes, including missing/error states, then obtain an Astra review.

Visual-only changes use rendered verification instead of implementation-mirroring tests. Existing health calculation and database tests remain the behavioral specification.

## Verification evidence

- Workspace test command passed: engine 252, mobile 1,381, proxy 155 (1,788 total). Eight new cases check foreground contrast on both surfaces for all four feature accents in light/dark mode.
- Workspace typechecks and web/Android exports passed. The workspace typecheck command is authoritative; invoking root `npx tsc -p mobile` selects a different compiler and reports unrelated DOM library mismatches.
- Browser inspection used real meal-entry/describe/Train components and real summary components with the actual fonts, at 393/320-point content widths in dark/light. SQLite, router, native permissions and other service boundaries were mocked. Checked food form input/enabled action, expanded sleep details, empty nutrition, missing sleep and eligible salt guidance. This does not prove physical-device layout, Dynamic Type or native behavior.
- Astra found a light-mode graphic-contrast defect in faded historical bars; opaque marks and selected-day label emphasis resolve it. Focused re-review found no important remaining issue.
- No packages, bitmap assets, network image requests, schema migrations or calculation changes.
