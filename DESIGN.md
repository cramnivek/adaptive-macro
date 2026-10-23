---
colors:
  background: "#0E0E0F"
  surface: "#171718"
  surfaceRaised: "#1F1F21"
  text: "#F4F4F2"
  accent: "#E9E9E6"
typography:
  sans:
    fontFamily: "SpaceGrotesk_400Regular"
  display:
    fontFamily: "SpaceGrotesk_700Bold"
  mono:
    fontFamily: "IBMPlexMono_500Medium"
rounded:
  md: "12px"
  lg: "16px"
  xl: "20px"
spacing:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    minHeight: "44px"
  card:
    variant: "section"
---

# Ascend design context

Ascend is a local-first food and lifting log, used on a phone during meals and
between sets. Preserve the existing product identity: calm, rule-led nutrition
sections and a darker, louder training palette with a large readable timer.
Expression belongs in training figures; routine logging should stay compact.
Avoid a marketing dashboard, decorative health scores, or inferred precision.

The canonical runtime owners are `mobile/src/theme/palette.ts`,
`mobile/src/theme/sessionTheme.ts`, and `mobile/src/theme/motion.ts`. This file
describes those existing tokens; it does not generate a competing token system.
Use `useTheme` for light/dark colors. Do not hard-code the dark values above into
new components. Existing shared Button, Card, Screen and native router modals own
the new meal and health views. The approved quiet daily companion direction keeps
these fonts and the dark foundation, with restrained feature colors rather than
a palette or typography rebrand.

Featured cards use sentence-case 14-point semibold headings, optional 18-point
Ionicons, a soft surface and a quiet border. Ordinary history/list sections keep
their compact rule-led headings. The neutral featured surface is `colors.surface`
so controls and chart tracks using `surfaceRaised` remain visible inside it.

`Palette.features` owns explicit light/dark accent, surface and note colors:
sleep uses lilac (`#D3C9F4` dark, `#665088` light), food uses sage (`#BAD5BD`,
`#3C6244`), activity/check-ins use blue (`#BFD4E3`, `#3F647D`), and conditional
salt guidance uses peach (`#EFC9A8`, `#795334`). These identify a subject, not a
good/bad outcome. Weight increases do not acquire a warning color. Macro,
success, error and destructive-action colors retain their existing meanings.

AdviceNote owns the small labelled next-step panel. Use one useful action, with
"For tonight" for sleep-duration guidance and "Next step" for missing data or
salt-related guidance. Small outline icons provide recognition; no bitmap assets,
extra font families, network image loads or decorative motion are needed.

Today gives its macro summary a neutral featured surface. Its macro bars wrap
below the calorie ring on narrow layouts. Meal entry groups photo/description
under AI meal estimate and keeps barcode/search secondary. Train home reserves
the strongest surface for starting/resuming; active workout controls and timers
retain their high-contrast treatment. Social artwork, settings permissions and
data-management actions retain their established behavior.

Keep real controls at least 44 points, retain readable numbers at arm's length,
and reserve safe areas exactly once. Screen's default top inset applies to
headerless pages; a native stack header already reserves it. Keep the workout
Finish action above the bottom safe area. Use existing motion/reduced-motion
handling; add no decorative animations for these features.

English labels name actions: Log a meal, Take a photo, Describe your meal, Scan a
barcode, Search foods. Show uncertainty beside estimates and distinguish absent
health data from a measured zero. Follow the phone's locale for times and numbers.

Health summaries lead with an interpretation and one practical next step.
Sleep distinguishes recorded duration from sleep quality and missing recording
detail from too little recorded sleep. Weight leads with its weekly average;
a daily salt-related observation must name the individual weigh-in it concerns.
Put import metadata, comparison arithmetic and data requirements behind Details.
An empty food log offers meal-logging guidance without a nutrition score or grade.
Sleep's seven-day bars show recorded duration, not sleep quality. Missing days
have a dash and recorded zero remains zero. Keep data marks opaque in both
themes; faded lilac fails graphic contrast on the light surface. Dates and exact
durations remain available to assistive technology and in Details.
