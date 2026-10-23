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
the new meal and health views. No palette or typography rebrand is authorized.

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
