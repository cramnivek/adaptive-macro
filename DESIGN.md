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

# Stärke design context

Stärke is a local-first food and lifting log, used on a phone during meals and
between sets. Preserve the existing product identity: calm, rule-led nutrition
sections and a darker, louder training palette with a large readable timer.
Expression belongs in training figures; routine logging should stay compact.
The 24 October brand revision uses red consistently across all tabs: primary
actions and active navigation belong to one Stärke identity. Training increases
contrast and figure size rather than introducing a separate brand palette.
Avoid a marketing dashboard, decorative health scores, or inferred precision.

The approved public identity is Starke Fitness for installation, Stärke in
ordinary prose, STÄRKE in the wordmark, and Keep building. as the tagline.
The approved artwork is the upright STÄRKE wordmark with a red open Ä, round
umlaut dots and an inner upward arrow (option A). The Ä alone is the install icon.
Keep the other letters upright; do not restore the rejected SF/ST monograms,
italic sliced lettering, star, or weight equipment. The palette stays red, black
and off-white. Before presenting or releasing a changed logo, compare its
silhouette, lettering, stroke treatment and overall impression with current
official fitness-brand artwork, including RP Strength, and relevant competitors
such as Hevy, Strong, MacroFactor, Strava, Gymshark and adidas. Record the actual
comparison set and concerns; visual screening does not establish trademark
availability or legal clearance. Repeat the comparison when the mark changes.
`mobile/src/brand.ts` owns the names;
`mobile/assets/brand/artwork.json` owns the mark and wordmark geometry. BrandLockup
renders the same paths as canvas exports and `tools/make-icons.py`.
The generated SVG and PNGs are outputs, not independent designs. Use the existing
red, black and off-white palette: app icons are off-white Ä on brand.mark red;
in-app lockups follow theme foreground and accessible red roles in either mode.
Do not rename persisted keys, app identifiers, OAuth schemes or the EAS project
when changing public branding. No other screen layout or font changes follow
from this rebrand.

The canonical runtime owners are `mobile/src/theme/palette.ts`,
`mobile/src/theme/sessionTheme.ts`, and `mobile/src/theme/motion.ts`. This file
describes those existing tokens; it does not generate a competing token system.
`palette.ts` owns `brand.red` (`#D92D22`) and white `brand.onRed`, shared by
ordinary primary Buttons and the session palette. The slightly brighter
`brand.mark` (`#E8352A`) remains available for artwork. Theme-specific
`colors.brand.text` is `#F28278` in dark mode and `#B72D25` in light mode, with
`brand.surface` at `#28191A` and `#FCECE9`. These roles preserve contrast for
small labels and icons; do not reuse a red text accent as a white-label fill.
Neutral `accent` remains for existing neutral controls, and nutrient, warning
and error colors retain their data meanings.
Use `useTheme` for light/dark colors. Do not hard-code the dark values above into
new components. Existing shared Button, Card, Screen and native router modals own
the new meal and health views. The approved quiet daily companion direction keeps
these fonts and the dark foundation, with restrained feature colors alongside the shared red actions. The existing
typography stays unchanged.

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

Today gives its compact macro summary a neutral featured surface: calorie
balance first, then three short macro columns that wrap for larger text. The
large ring remains available to other summary callers. Food logging and the
diary follow immediately; target arithmetic, sharing and completeness sit behind
Food details, and supporting health/activity cards behind More for today.
Training routine shortcuts and weight summaries stay in their own tabs.
Meal entry groups photo/description
under AI meal estimate and keeps barcode/search secondary. Train home reserves
the strongest surface for starting/resuming; active workout controls and timers
retain their high-contrast treatment. Social artwork, settings permissions and
data-management actions retain their established behavior.

Keep real controls at least 44 points, retain readable numbers at arm's length,
and reserve safe areas exactly once. Screen's default top inset applies to
headerless pages; a native stack header already reserves it. Keep the workout
Finish action above the bottom safe area. Today has a small `STÄRKE` vector wordmark
beside its existing header controls, without another row or a system-status-bar
overlay. Other tabs keep their descriptive titles; shared cards keep branding.
Featured meal, sleep, steps, weight and training marks use the bundled SVG
BrandGlyph family: simple instrument-like outlines with a restrained red detail.
Keep ordinary navigation icons familiar and avoid network-loaded illustrations.

The approved Trends hierarchy is compact period/range controls, solid red focus
tabs, then the selected report immediately. Changing focus returns to those
controls. Overview uses bold factual type, an aligned recorded-days map for food,
weight and training, three compact period facts and check-ins. Keep the weight
chart on Body, energy on Food and training bars on Training. Show gaps explicitly;
partial food logs use an outline and never become zero intake. Longer periods
group actual recorded days; historical arrows stay inside fetched history.
Secondary Body reports and calculation notes use disclosures. Saved check-ins
remain accessible. Weight movement stays neutral.

Check-ins open a full-screen manual recap with five chapters: period, food,
body, training and the next step from the review. Bold Space Grotesk figures
carry the expression; use the shared BrandLockup. Keep progress, Skip to summary,
Close and Back/Next visible, without autoplay. The full summary retains review
generation, eligibility, science, prior reviews and explicit adjustment preview
and Apply. Bind saved advice and applied state to their period key. Recorded
weight averages use actual weigh-ins; estimates must say they are estimates.
Use full years in saved recap dates and let large text scroll without clipping.

Use existing native-driver press/entrance motion, around 90-220 ms, without
delaying actions or data writes. New diary rows settle into place; chart-view
changes briefly transition and personal records get a short flourish. Share one
platform Reduce Motion subscription. When enabled, stop movement, reveal content
and values immediately, and omit celebration particles. Add no sounds or loops.

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

Food reuse offers selectable individual items with their previously logged
amounts. Local usual-food suggestions describe observed logging frequency,
never a prediction or model-generated recommendation. Keep the list short and
require an explicit Add; opening a repeat suggestion must not copy a meal.
