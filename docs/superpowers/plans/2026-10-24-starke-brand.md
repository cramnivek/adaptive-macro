# Starke Fitness public rebrand

Approved identity: Starke Fitness (full name), Stärke (prose), STÄRKE (wordmark),
Keep building. (tagline). Keep the existing red, black and off-white system.
Final artwork: option A, upright STÄRKE wordmark with a red open Ä, round umlaut
dots and an inner upward arrow. Use the Ä alone as the app icon. The diagonal-cut
SF option B was superseded after comparison with RP Strength and is not shipped.

## Constraints

Keep bundled typefaces and existing light/dark theme roles. Keep compact Today
spacing. Preserve package IDs, OAuth scheme, EAS project, deployment URLs,
database names, persisted keys and personality IDs. No migrations, auth changes
or unrelated redesign. Do not apply any rejected star, S-only or ST artwork.

## Tasks

1. Centralize public naming, update visible prose and install/web metadata.
   Verify app identity remains unchanged with focused regression tests.
2. Store approved mark and wordmark paths once; use them for native SVG lockups,
   canvas signatures, PNG install icons, splash and PWA artwork.
3. Update Today and sign-in branding, share-card tagline and user-visible export
   names. Preserve photo customization, transparency and sharing behavior.
4. Update DESIGN.md. Verify small icon legibility, umlaut rendering, light/dark
   lockups and real generated card/sticker output in the browser.
5. Run tests, types and platform exports; review the diff. Commit on the feature
   branch, open a draft PR, deploy the verified web export and start an Android
   preview build. Report its status accurately; do not claim physical-device QA.

## Progress

- Public copy and install metadata prepared; naming/identity regression tests pass.
- SF option B superseded because of RP visual similarity; its geometry is removed.
- Option A Ä wordmark approved after the Strava comparison was corrected: Strava
  uses opposing shapes, rather than this Ä/dots/inner-arrow composition.
- Shared native/canvas vectors and install artwork implemented. Validation:
  1,877 tests pass; root typecheck passes; web and Android exports pass.
- Browser verification: guest sign-in/onboarding/Today at 393px width, accessible
  brand label, icon sizes 16–192px and circular mask, light/dark wordmarks, real
  workout/nutrition PNGs, four transparent sticker layouts and a photo composite.
  This does not establish physical-device validation.
- Independent code review found no functional defects; a stale sign-in comment
  was corrected. Release is in progress.
