# Visual identity and information architecture

Design, 2026-09-29.

## Problem

The app is competently built and looks like nothing. `src/theme.ts` holds real
dark and light palettes, `space` and `radius` scales, and `Screen`, `Card`,
`StatTile` and `Controls` apply them consistently. Touch targets are a
deliberate 44 px, inputs carry accessibility labels, safe-area insets are
measured rather than guessed. None of that is broken.

What it is, is the default. Navy `#0B1220` under a blue `#5B9DFF` accent,
hairline-bordered rounded cards, Ionicons `-outline` throughout, and the system
font on every screen — `grep` finds no `fontFamily` anywhere in `mobile/src` or
`mobile/app`. It is the shape a competent developer reaches for when no
decision has been made, and it reads that way.

Two structural problems sit alongside it.

**The seven-day data-loss warning is somewhere nobody looks.**
`needsHomeScreenInstall()` in `mobile/src/web/persistence.ts` is careful and
correct: it handles iPadOS reporting a desktop user agent, and it checks both
`navigator.standalone` and the `display-mode` media query because either alone
nags users who have already installed. It is called in exactly one place —
`mobile/app/(tabs)/settings.tsx:192`, the first card of Settings. An iOS user
who never opens Settings is never told that Safari deletes their diary after
seven days without use. They log a week of meals and lose them. The detection
is right and the placement makes it useless.

**Settings is a twelve-card blind scroll.** 536 lines on one screen: *Add to
your home screen · You · Goal · Macros · Units · Food data · Lifting history ·
Looking up restaurant food · Describing meals · Model tuning · Your data · Demo
data*. It mixes what you set once (height) with what you touch never (energy
per kg of tissue) and what you may want in a hurry (backup), with no grouping
and no index.

A smaller one: the Today screen puts seventeen tap targets above the first
logged item, twelve of them the same three unlabelled icons repeated once per
meal.

## Goals

A visual identity that is chosen rather than defaulted to, holding on both
shipping surfaces; the install warning where an iOS user will see it; and
Settings navigable by eye.

## Non-goals

- **Platform-native UI.** Android ships a native APK, iOS ships as a PWA
  through the Cloud Run site. `@expo/ui` renders SwiftUI on iOS and Jetpack
  Compose on Android and has no web implementation, so on this project the one
  platform it would flatter is the only one that cannot run it. It is in
  `package.json` at `~57.0.18` with zero imports; this design neither uses nor
  removes it.
- **Desktop or tablet layout.** Both targets are phones. The desktop browser
  view stays a phone column and is not addressed here.
- **New screens or routes.** Every change lands in a file that already exists.
- **Touching the engine, the database, or any behaviour that computes a
  number.** This design changes what things look like and where they live.
- **Rendering tests for components.** See Testing.

## The direction

Called *Instrument*. The premise is that this app measures rather than
motivates — its whole claim is that it derives expenditure from your own intake
and weight instead of trusting a formula — and the interface should say so. The
chrome is grey and recedes; the only colour in the interface is the data.

Mockups of the Today screen in this direction and two rejected ones
(*Almanac*, warm editorial; *Signal*, high-contrast athletic) are at
<https://claude.ai/artifact/QPGMWniU2WFbyqnLq8FT7q>. *Almanac* was rejected
because a warm-paper aesthetic is strongest in light mode and this app defaults
to dark (`isDark = scheme !== 'light'`). *Signal* was rejected as the category
default: doing it well still reads as one of many.

## The token layer

`src/theme.ts` becomes a directory so that the palettes can be tested without
dragging React Native into the test runner (see Testing). Import paths are
unchanged — every call site already writes `'../theme'` or `'../../src/theme'`,
which resolves to `index.ts`.

- **`src/theme/palette.ts`** — pure data and no imports: the `Palette`
  interface, the `dark` and `light` objects, `space`, `radius`.
- **`src/theme/index.ts`** — `import { useColorScheme } from 'react-native'`,
  the `useTheme` hook, and a re-export of everything in `palette.ts`.

This is the split the repo already uses where `importWorkouts.ts` is separated
from `runImport.ts`, and for the same reason.

### Colour

| Token | Dark | Light |
| --- | --- | --- |
| `background` | `#0E0E0F` | `#FAFAF8` |
| `surface` | `#171718` | `#FFFFFF` |
| `surfaceRaised` | `#1F1F21` | `#F1F1ED` |
| `border` | `#2A2A2D` | `#E2E2DC` |
| `text` | `#F4F4F2` | `#151516` |
| `textMuted` | `#A0A09C` | `#5E5E5A` |
| `textFaint` | `#8C8C91` | `#6E6E68` |
| `accent` | `#E9E9E6` | `#151516` |
| `onFill` | `#0E0E0F` | `#FAFAF8` |
| `protein` | `#6E9FB5` | `#3C6E88` |
| `carbs` | `#C8A45C` | `#8E6E26` |
| `fat` | `#B57A56` | `#8A4E32` |
| `positive` | `#6FB58A` | `#2E7D5B` |
| `warning` | `#C8A45C` | `#8E6E26` |
| `danger` | `#E06C60` | `#C0392B` |

`onFill` is new and is not optional. It is the foreground colour for text and
icons on **any** filled control — `accent` or `danger` — because in this
palette both fills are light in dark mode and dark in light mode, so a fixed
white foreground is wrong on both. The accent itself stops being a mid-blue and
becomes near-white on dark, near-black on light, a neutral so that the macro
colours are the only chroma on screen. Ten places currently hardcode
`'#FFFFFF'` as the text colour on a filled control, and every one of them
becomes white-on-near-white in dark mode:

```
src/components/Controls.tsx:22       Button, primary and danger variants
src/components/Controls.tsx:234      Segmented, active item
src/components/EditEntrySheet.tsx:88 meal chip, selected
src/components/LogFoodSheet.tsx:104  meal chip, selected
app/(tabs)/index.tsx:153             add-to-meal button icon
app/describe.tsx:226                 meal chip, selected
app/progression.tsx:128              range chip, active
app/quick-add.tsx:119                meal chip, selected
app/repeat.tsx:86                    date chip, selected
app/repeat.tsx:120                   meal chip, selected
```

Each reads `colors.onFill` instead — including `Controls.tsx:22`, whose ternary
covers `primary` (accent fill) and `danger` (danger fill) together. Because
`onFill` is defined against both, that line stays a two-way swap rather than
growing a third branch.

`src/theme.ts:39`'s `surface: '#FFFFFF'` is the light palette's own value, not a
hardcode, and stays.

The values in the table above are the starting point, not a verified set. They
were chosen by eye against the mockups; the contrast test in step 2 is the
arbiter, and any pair it fails gets darkened at step 3 rather than waived.

### Shape

`radius` keeps its key names and changes values only — `sm` 8 → 4, `md` 12 → 6,
`lg` 16 → 8, `pill` unchanged — so no call site changes. `space` is untouched.

### Type

Two faces, loaded through `expo-font` so that the Android APK and the iOS PWA
get the same design:

- **Space Grotesk** at 400 and 600, for all UI text.
- **IBM Plex Mono** at 500, for every figure.

Mono numerals are the direction's signature: they make columns of weights,
macros and calories line up, and they are what stops the interface reading as
generic. The app already reaches halfway there — `fontVariant: ['tabular-nums']`
appears in six places.

`expo-font` is a new dependency and the three TTFs are new committed assets,
roughly 210 KB in total. On Android that bundles into the APK and costs nothing
at runtime; on the iOS PWA it is one fetch from Cloud Run, cached thereafter.
`useFonts` goes in `mobile/app/_layout.tsx`, and the tree renders null until it
resolves — a font swap mid-paint is worse than a beat of nothing.

A `font` export in `palette.ts` names the two families so no screen spells a
font name:

```ts
export const font = {
  ui: 'SpaceGrotesk_400Regular',
  uiStrong: 'SpaceGrotesk_600SemiBold',
  figure: 'IBMPlexMono_500Medium',
} as const;
```

Figures adopt `font.figure` at the six `tabular-nums` sites above, plus the
calorie ring value, the macro bar values, `StatTile`'s value, and the entry
kcal column.

## `Card` becomes a section

This is the change that makes the direction visible, and the largest diff in
one file.

`src/components/Card.tsx` stops painting a `surface` background and a border.
It becomes: an uppercase, letter-spaced micro-label title; the subtitle and the
`right` slot on the same line; a hairline rule filling the remaining width; then
children, separated from the next section by `space.xl` rather than a box.

The props — `title`, `subtitle`, `right`, `children`, `style` — do not change,
so all of its call sites compile untouched and the whole app restyles from one
file. `StatTile` keeps its `surfaceRaised` fill, which is what gives the stat
rows their weight now that nothing around them is boxed.

`Screen`'s header grows: title to `font.uiStrong` at 28 px with tighter
tracking, subtitle in `textMuted`. Its padding and safe-area handling are
correct and stay exactly as they are.

## Information architecture

### The install notice

A new `src/components/HomeScreenNotice.tsx` holds the copy and the
`needsHomeScreenInstall()` call in one place, and returns null when the call is
false. It mounts twice:

- **`app/(tabs)/index.tsx`**, above the meal sections, using the banner shape
  already there for `usingSeedEstimate` but bordered in `danger` rather than
  `warning`. Today is the screen every user lands on.
- **`app/(tabs)/settings.tsx`**, where the card is now, so the instructions
  remain findable on purpose rather than only by accident.

It is not dismissible. The consequence is losing the diary, and a banner that
can be tapped away is a banner that will be, a week before it matters. It
disappears on its own the moment the install is detected.

### Settings

Twelve cards become seven collapsible sections, all closed but the first. No
new routes: on the iOS PWA every avoided push is an avoided full-page
navigation, and a phone gets the whole map in roughly one screen-height instead
of a long blind scroll.

| Section | Absorbs |
| --- | --- |
| You | sex, age, height, activity |
| Goal | direction, rate, goal weight, **protein, minimum fat** |
| Units | — |
| Food data | country, USDA key, **Gemini key, meal description** |
| Your data | backup, restore, **Hevy import** |
| Advanced | model tuning |
| Demo data | unchanged, development builds only |

The groupings in bold are merges. *Macros* folds into *Goal* because protein
and minimum fat are goal parameters. *Looking up restaurant food* and
*Describing meals* fold into *Food data* because all three are about where
nutrition numbers come from. *Lifting history* folds into *Your data* because
what remains in it is the Hevy import, which is a data import sitting next to
backup and restore. The `HomeScreenNotice` sits above all sections, outside the
accordion.

The section component is local to `settings.tsx`. It is one disclosure row plus
a conditional body, used seven times in one file, and does not earn a place in
`src/components`.

### Today's meal actions

Each meal card carries three icon buttons — describe, scan, search — which
across four meals is twelve targets whose glyphs do not explain themselves.
This becomes two per meal:

- **`+`** goes to search, which is the common path, so the frequent action
  costs the same number of taps it does today.
- **`⋯`** opens a sheet offering *Describe in words* and *Scan a barcode* as
  labelled rows.

Twelve targets become eight, and the two rarer actions gain words. The sheet
follows `EditEntrySheet` and `LogFoodSheet`, which already establish the
pattern in this codebase.

## Testing

The contrast of a palette is exactly the kind of thing a rewrite breaks
silently, and this design has never had a check for it. Splitting `theme.ts`
makes one possible.

`mobile/vitest.config.ts` includes `src/**/__tests__/**/*.test.ts` — the whole
of `src`, not a list of directories. A test therefore needs no config change;
it needs an import that does not pull in React Native, which is what
`palette.ts` provides. (A test importing today's `src/theme.ts` would fail to
run at all, for the same reason one importing `../db` does: `react-native`
cannot be parsed under node.)

`src/theme/__tests__/palette.test.ts` adds a WCAG relative-luminance helper and
asserts, for both palettes:

- `text`, `textMuted` and `textFaint` clear **4.5:1** on `background`,
  `surface` and `surfaceRaised`.
- `onFill` clears **4.5:1** on both `accent` and `danger`.
- `protein`, `carbs`, `fat`, `positive`, `warning` and `danger` clear **3:1**
  on `background` and `surface` — they are bar fills and ring strokes, not
  text.

No component rendering tests. `mobile/vitest.config.ts` runs under node, and
loosening it to render React Native components is the trap the handoff already
documents. Everything visual is verified in a browser against the deployed
build, which is how three bugs that passed a green suite were caught.

## Risks

**The whole app restyles at once.** Changing `Card` and the palette together
touches every screen in one commit's worth of effect. The contrast test catches
unreadable text; it does not catch a layout that only looked right because a
card had a border. Each screen needs looking at in the running app.

**`StatTile` and `LineChart` were drawn against the old palette.**
`LineChart.tsx` takes colours as props from its callers, so it follows, but its
gridlines and axis labels want checking against a near-black ground rather than
navy.

**The font gate can white-screen the app.** `useFonts` returning null until
resolved is correct on native, where the files are local. On the iOS PWA the
fetch is over the network on a cold first load. The gate must render the
background colour rather than nothing, so a slow connection shows an empty app
in the right colour instead of a white flash — on a dark-default app that flash
is the most visible possible failure.

**The accordion can hide a setting someone is looking for.** Seven closed
headings is a better map than twelve open cards, but only if the headings name
things the way a user would search for them. *Advanced* holding model tuning is
the one most likely to be wrong.

## Order of work

1. **`HomeScreenNotice` onto Today.** Independent of everything else, smallest
   diff, live data-loss risk on the deployed site. Ship it first.
2. **Split `theme.ts` into `theme/`** with the old values intact, and add the
   contrast test. It should pass against the current palette before the palette
   changes, so that a failure afterwards means something.
3. **New palette values and `onFill`,** including all ten `'#FFFFFF'` sites.
   The test from step 2 gates this.
4. **`expo-font`, the three TTFs, the `_layout.tsx` gate,** and `font.ui` on
   `Screen` and `Card`.
5. **`Card` becomes a section,** and figures adopt `font.figure`.
6. **Settings accordion and regrouping.**
7. **Today's meal actions.**

Steps 1 and 2 are safe to merge alone. Steps 3 through 5 are one visual change
and should land together or not at all — a half-applied palette is worse than
either end of it.
