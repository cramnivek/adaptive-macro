# Visual identity and information architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's default look with the *Instrument* direction — grey chrome, hairline rules instead of bordered cards, mono figures — and fix three information-architecture problems, the worst of which silently costs iOS users their diary.

**Architecture:** `src/theme.ts` splits into a `src/theme/` directory so the palettes become a pure module a node test can import; a contrast test then gates every palette change. `Card` is restyled in place from a bordered box into a rule-led section, so all ~30 call sites restyle from one file without changing. The three IA changes each land in a file that already exists, plus one new component.

**Tech Stack:** Expo SDK 57, React Native 0.86, `react-native-web` 0.21, expo-router 57, Vitest (node environment), `@expo-google-fonts/*` + `expo-font`.

Spec: `docs/superpowers/specs/2026-09-29-visual-identity-and-ia-design.md`
Mockups: <https://claude.ai/artifact/QPGMWniU2WFbyqnLq8FT7q>

## Global Constraints

- **Two runtimes, one codebase.** Android ships a native APK; iOS ships as a PWA from the Cloud Run site. Every change must hold in both. Do not reach for `@expo/ui` — it has no web implementation, and on this project iOS *is* web.
- **`expo-file-system` does not exist on web.** All file reading and writing goes through `mobile/src/platform/files.ts`.
- **Only pure modules are tested.** `mobile/vitest.config.ts` runs under `environment: 'node'` with `include: ['src/**/__tests__/**/*.test.ts']`. A test that imports `react-native` — directly or transitively — fails to run at all. Do not loosen the config; put logic on the testable side instead.
- **`MIGRATIONS` is append-only.** This plan touches no migration and no database code.
- **Touch targets stay ≥ `TOUCH_TARGET` (44).** Exported from `mobile/src/components/Controls.tsx`.
- **Do not reformat, refactor, or improve code this plan does not name.** Every changed line traces to a task below.
- **Commit after every task.** Every commit must leave `npm test` and `npm run typecheck` green.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

## Verification reality

Five of these seven tasks change only what is drawn. The codebase has no way to render a React Native component under node, and the handoff records three bugs that shipped past a green suite and were caught only in a real browser. So:

- **Tasks 2 and 3 carry real automated tests.** They are the only ones with pure logic.
- **Tasks 1 and 4–7 carry a written browser verification instead**, with assertions chosen so they cannot pass by accident. A check for a static label once reported a weigh-in as saved when nothing had been; do not repeat that.

The local verification loop, from `mobile/`:

```bash
npx expo start --web
```

`notify()` uses `window.alert` on web, so a failure can vanish into a dialog — watch for one.

---

### Task 1: The install notice moves to Today

`needsHomeScreenInstall()` is correct and is called in exactly one place: the first card of Settings. An iOS user who never opens Settings is never told that Safari deletes their diary after seven days without use. This task is independent of the rest of the plan and is the only one with a live consequence on the deployed site — do it first and it can merge alone.

**Files:**
- Create: `mobile/src/components/HomeScreenNotice.tsx`
- Modify: `mobile/app/(tabs)/index.tsx` (add the mount)
- Modify: `mobile/app/(tabs)/settings.tsx` (replace the inline card with the component)

**Interfaces:**
- Consumes: `needsHomeScreenInstall()` from `src/web/persistence` — `() => boolean`, already exported.
- Produces: `HomeScreenNotice` — `() => JSX.Element | null`. Renders `null` when an install is not needed, so callers mount it unconditionally.

- [ ] **Step 1: Create the component**

Create `mobile/src/components/HomeScreenNotice.tsx`:

```tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';
import { radius, space, useTheme } from '../theme';
import { needsHomeScreenInstall } from '../web/persistence';

/**
 * Warns an iOS browser user that their diary is on a seven-day timer.
 *
 * Safari deletes script-writable storage after seven days without use, and
 * that is what the diary lives on. A home-screen install is exempt. This used
 * to be the first card of Settings, which meant the people who needed it most
 * — anyone who opened the site and started logging — never saw it.
 *
 * It is deliberately not dismissible. The consequence is losing the diary, and
 * a banner that can be tapped away is one that will be, a week before it
 * matters. It disappears on its own once the install is detected.
 */
export const HomeScreenNotice = () => {
  const { colors } = useTheme();
  if (!needsHomeScreenInstall()) return null;

  return (
    <View style={[styles.banner, { backgroundColor: colors.surfaceRaised, borderColor: colors.danger }]}>
      <Ionicons name="warning-outline" size={18} color={colors.danger} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>Add this to your home screen</Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Safari deletes a website's saved data after seven days without use, and that includes your
          diary. Adding this to your home screen exempts it — tap Share, then Add to Home Screen, then
          open it from there from now on.
        </Text>
        <Text style={[styles.body, { color: colors.textMuted }]}>
          Until you do, save a backup from Settings if you have anything you would mind losing.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
    marginBottom: space.md,
  },
  text: { flex: 1, gap: space.xs },
  title: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 12, lineHeight: 17 },
});
```

- [ ] **Step 2: Mount it on Today**

In `mobile/app/(tabs)/index.tsx`, add to the imports:

```tsx
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
```

Then place it as the **first** child inside `<Screen title="Today" …>`, above the `styles.dateNav` `<View>`:

```tsx
    <Screen title="Today" subtitle={formatDateLong(selectedDate)}>
      <HomeScreenNotice />
      <View style={styles.dateNav}>
```

- [ ] **Step 3: Replace the Settings card with the same component**

In `mobile/app/(tabs)/settings.tsx`, delete this import:

```tsx
import { needsHomeScreenInstall } from '../../src/web/persistence';
```

and add:

```tsx
import { HomeScreenNotice } from '../../src/components/HomeScreenNotice';
```

Then replace the whole block that currently begins `{needsHomeScreenInstall() && (` and ends with the matching `)}` — the `Card title="Add to your home screen"` and its two `<Text>` children — with:

```tsx
      <HomeScreenNotice />
```

The copy now lives in one file. Do not leave a second copy behind.

- [ ] **Step 4: Typecheck**

Run from `mobile/`:

```bash
npm run typecheck
```

Expected: clean. If `needsHomeScreenInstall` is reported as unused in `settings.tsx`, the import in Step 3 was not removed.

- [ ] **Step 5: Verify in a browser**

`needsHomeScreenInstall()` returns false on a desktop browser, so the banner will not appear by itself. Force it, in the browser devtools console, by checking the two conditions the function reads — it needs an iOS user agent and no standalone flag. The reliable check is a device-emulation reload:

1. `npx expo start --web`, open the app.
2. Devtools → Toggle device toolbar → choose **iPhone** → **reload the page** (the user agent is only read on load).
3. Assert on the Today screen: the red-bordered banner is present, its heading reads "Add this to your home screen", and it is **above** the date navigation row.
4. Go to Settings. Assert the same banner appears there once, and that no card titled "Add to your home screen" exists — that would mean the old block survived.
5. Switch device emulation back to Desktop and reload. Assert the banner is gone from both screens.

Assert on the banner's own text, not on the screen rendering at all — a blank screen would pass a weaker check.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/HomeScreenNotice.tsx "mobile/app/(tabs)/index.tsx" "mobile/app/(tabs)/settings.tsx"
git commit -m "$(cat <<'EOF'
fix(web): warn about the seven-day storage rule where iOS users will see it

needsHomeScreenInstall() was called in exactly one place, the first card of
Settings. Anyone who opened the site and started logging without visiting
Settings was never told that Safari deletes their diary after seven days
without use, which is the failure the whole web deployment exists to avoid.

The copy moves into one component mounted on both Today and Settings, so there
is no second copy to drift. It is not dismissible: the consequence is losing
the diary, and it clears itself once the install is detected.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Split `theme.ts` so the palettes can be tested

`src/theme.ts` imports `useColorScheme` from `react-native` on line 1. Any test importing it fails to run at all, for the same reason a test importing `../db` does. Splitting the pure data out is the same move `importWorkouts.ts` already makes from `runImport.ts`.

This task changes **no values**. It is a pure move, so that the next task's failures mean something.

**Files:**
- Create: `mobile/src/theme/palette.ts` (the data, no imports)
- Create: `mobile/src/theme/index.ts` (the hook, re-exports everything)
- Delete: `mobile/src/theme.ts`

**Interfaces:**
- Produces: from `src/theme/palette` — `interface Palette`, `const dark: Palette`, `const light: Palette`, `const space`, `const radius`.
- Produces: from `src/theme` (i.e. `src/theme/index.ts`) — everything above re-exported, plus `useTheme(): { colors: Palette; isDark: boolean }`. **Every existing import path (`'../theme'`, `'../../src/theme'`) resolves to `index.ts` unchanged.**

- [ ] **Step 1: Create the pure module**

Create `mobile/src/theme/palette.ts` with the `Palette` interface, both palette objects, `space` and `radius` **copied verbatim from the current `src/theme.ts`** — same values, same comments. The file must have **no import statements at all**; that is the whole point of the split.

- [ ] **Step 2: Create the hook module**

Create `mobile/src/theme/index.ts`:

```ts
import { useColorScheme } from 'react-native';
import { dark, light, type Palette } from './palette';

export * from './palette';

export const useTheme = (): { colors: Palette; isDark: boolean } => {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return { colors: isDark ? dark : light, isDark };
};
```

- [ ] **Step 3: Delete the old file**

```bash
git rm mobile/src/theme.ts
```

- [ ] **Step 4: Confirm nothing imported the old path directly**

```bash
cd mobile && grep -rn "theme'" src app --include=*.tsx --include=*.ts | grep -v node_modules
```

Expected: every hit ends in `'../theme'`, `'../../src/theme'` or similar — a directory path, which now resolves to `index.ts`. If any hit reads `'../theme.ts'` with the extension, change it to drop the extension.

- [ ] **Step 5: Verify the move broke nothing**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: typecheck clean, 257 tests pass. Any drop in the test count means a test file stopped being collected.

- [ ] **Step 6: Commit**

```bash
git add -A mobile/src/theme mobile/src/theme.ts
git commit -m "$(cat <<'EOF'
refactor(theme): split the palettes out of the react-native import

theme.ts imports useColorScheme on its first line, so a node test importing it
fails to run at all — the same wall a test importing ../db hits. The palettes,
space and radius move to src/theme/palette.ts, which imports nothing; the hook
stays in src/theme/index.ts and re-exports it, so every '../theme' call site is
untouched.

No values change. This is the split that lets the next commit's contrast test
exist.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The contrast test, then the new palette

TDD proper: the test is written first and **fails against the current palette** — and not only on the values this plan replaces. Dark `textFaint` `#5D6A80` on `background` `#0B1220` is 3.44:1, under the 4.5 body text needs. That is a pre-existing accessibility bug, and the test is what turns it from invisible into a failing assertion.

**Files:**
- Create: `mobile/src/theme/__tests__/palette.test.ts`
- Modify: `mobile/src/theme/palette.ts` (add `onFill` to `Palette`, new values, new `radius` values)
- Modify: ten call sites that hardcode `'#FFFFFF'` (listed in Step 5)

**Interfaces:**
- Consumes: `dark`, `light`, `Palette` from `../palette`.
- Produces: `Palette` gains `onFill: string` — the foreground for text and icons on **any** filled control, `accent` or `danger`. Both fills are light in dark mode and dark in light mode, so a fixed white foreground is wrong on both.

- [ ] **Step 1: Write the failing test**

Create `mobile/src/theme/__tests__/palette.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { dark, light, type Palette } from '../palette';

/** WCAG 2.1 relative luminance of an #RRGGBB colour. */
const luminance = (hex: string): number => {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const int = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff)
  );
};

/** WCAG contrast ratio between two #RRGGBB colours, 1 to 21. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const GROUNDS = ['background', 'surface', 'surfaceRaised'] as const satisfies readonly (keyof Palette)[];
const TEXTS = ['text', 'textMuted', 'textFaint'] as const satisfies readonly (keyof Palette)[];
const MARKS = ['protein', 'carbs', 'fat', 'positive', 'warning', 'danger'] as const satisfies readonly (keyof Palette)[];

describe('contrast helper', () => {
  it('scores black on white at 21:1 and a colour against itself at 1:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#5B9DFF', '#5B9DFF')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['dark', dark],
  ['light', light],
] as const)('%s palette', (_name, palette) => {
  // Body text. WCAG AA is 4.5:1 below 24px, and nothing in this app's chrome
  // is above 24px except the screen title and the calorie figure.
  it.each(TEXTS.flatMap((text) => GROUNDS.map((ground) => [text, ground] as const)))(
    '%s reads on %s at 4.5:1',
    (text, ground) => {
      expect(contrast(palette[text], palette[ground])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('onFill reads on both filled controls at 4.5:1', () => {
    expect(contrast(palette.onFill, palette.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.onFill, palette.danger)).toBeGreaterThanOrEqual(4.5);
  });

  // Bar fills and ring strokes are graphics, not text: AA asks 3:1.
  it.each(
    MARKS.flatMap((mark) => (['background', 'surface'] as const).map((ground) => [mark, ground] as const)),
  )('%s shows as a mark on %s at 3:1', (mark, ground) => {
    expect(contrast(palette[mark], palette[ground])).toBeGreaterThanOrEqual(3);
  });

  // The macro colours are told apart by lightness as well as hue, so they stay
  // distinguishable to a red-green colour-blind reader.
  it('separates the three macro colours by lightness', () => {
    const levels = [palette.protein, palette.carbs, palette.fat].map(luminance).sort((a, b) => a - b);
    expect(levels[1] / levels[0]).toBeGreaterThanOrEqual(1.2);
    expect(levels[2] / levels[1]).toBeGreaterThanOrEqual(1.2);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
cd mobile && npx vitest run src/theme/__tests__/palette.test.ts
```

Expected: FAIL. Two distinct kinds of failure, and both should be present:
- `Property 'onFill' does not exist` — the token does not exist yet.
- `dark palette > textFaint reads on background at 4.5:1` — received ≈ 3.44.

If only the first appears, the test is not exercising the palette; check the `describe.each`.

- [ ] **Step 3: Add `onFill` to the interface and apply the new values**

In `mobile/src/theme/palette.ts`, add to `interface Palette`, directly below `accent`:

```ts
  /** Foreground for text and icons on a filled control — accent or danger. */
  onFill: string;
```

Replace the two palette objects' values with these. Leave every key's order and the interface's other members alone:

```ts
const dark: Palette = {
  background: '#0E0E0F',
  surface: '#171718',
  surfaceRaised: '#1F1F21',
  border: '#2A2A2D',
  text: '#F4F4F2',
  textMuted: '#A0A09C',
  textFaint: '#8C8C91',
  accent: '#E9E9E6',
  onFill: '#0E0E0F',
  protein: '#6E9FB5',
  carbs: '#C4A05A',
  fat: '#B57A56',
  positive: '#6FB58A',
  warning: '#C4A05A',
  danger: '#E06C60',
};

const light: Palette = {
  background: '#FAFAF8',
  surface: '#FFFFFF',
  surfaceRaised: '#F1F1ED',
  border: '#E2E2DC',
  text: '#151516',
  textMuted: '#5E5E5A',
  textFaint: '#666660',
  accent: '#151516',
  onFill: '#FAFAF8',
  protein: '#3C6E88',
  carbs: '#8A6A22',
  fat: '#8A4E32',
  positive: '#2E7D5B',
  warning: '#8A6A22',
  danger: '#C0392B',
};
```

Also change `radius` — key names stay, so no call site changes:

```ts
export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;
```

`space` is untouched.

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd mobile && npx vitest run src/theme/__tests__/palette.test.ts
```

Expected: PASS, all cases. These values were hand-computed; if a pair fails, **darken the offending colour until it clears rather than lowering the threshold.** The threshold is the requirement.

- [ ] **Step 5: Replace all ten hardcoded whites**

Each is text or an icon sitting on a filled control, and each becomes invisible now that `accent` is near-white in dark mode. Replace `'#FFFFFF'` with `colors.onFill` in each:

| File | The expression to change |
| --- | --- |
| `src/components/Controls.tsx` | `variant === 'subtle' ? colors.text : '#FFFFFF'` |
| `src/components/Controls.tsx` | `{ color: active ? '#FFFFFF' : colors.textMuted }` |
| `src/components/EditEntrySheet.tsx` | `option === meal ? '#FFFFFF' : colors.text` |
| `src/components/LogFoodSheet.tsx` | `option === meal ? '#FFFFFF' : colors.text` |
| `app/(tabs)/index.tsx` | `<Ionicons name="add" size={18} color="#FFFFFF" />` |
| `app/describe.tsx` | `option === meal ? '#FFFFFF' : colors.text` |
| `app/progression.tsx` | `active ? '#FFFFFF' : colors.text` |
| `app/quick-add.tsx` | `option === meal ? '#FFFFFF' : colors.text` |
| `app/repeat.tsx` | `date === chosenDate ? '#FFFFFF' : colors.text` |
| `app/repeat.tsx` | `on ? '#FFFFFF' : colors.text` |

`Controls.tsx`'s `Button` needs no third branch — `onFill` is defined against `danger` as well as `accent`, which the test asserts:

```tsx
  const textColor = variant === 'subtle' ? colors.text : colors.onFill;
```

The `index.tsx` icon needs `colors` in scope; it already is.

**`src/theme/palette.ts`'s `surface: '#FFFFFF'` is the light palette's own value, not a hardcode. Leave it.**

- [ ] **Step 6: Confirm no hardcoded whites survive**

```bash
cd mobile && grep -rn "#FFFFFF\|'white'" src app --include=*.tsx --include=*.ts | grep -v __tests__
```

Expected: exactly one hit — `src/theme/palette.ts`, the light `surface`.

- [ ] **Step 7: Full suite and typecheck**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: clean, and the test count rises from 257 by the number of generated cases.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/theme mobile/src/components mobile/app
git commit -m "$(cat <<'EOF'
feat(theme): the Instrument palette, gated by a contrast test

The chrome goes grey and the accent becomes a neutral — near-white on dark,
near-black on light — so the macro colours are the only chroma on screen.

That breaks a fixed white foreground, which ten call sites hardcoded on filled
controls, so Palette gains onFill: the foreground for accent and danger alike,
both of which are light in dark mode and dark in light mode.

The test came first and caught a bug older than this change: dark textFaint on
the old background was 3.44:1, under the 4.5 body text needs. Every text pair
now clears 4.5:1, every bar fill and ring stroke clears 3:1, and the three
macro colours are separated by lightness rather than hue alone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Bundle the two typefaces

Mono numerals are the direction's signature — they make columns of weights, macros and calories line up, and they are what stops the interface reading as generic. The app already reaches halfway there, with `fontVariant: ['tabular-nums']` in six places.

**Deviation from the spec, deliberate:** the spec says three TTFs are committed as assets. Use the `@expo-google-fonts/*` packages instead — they ship the same TTFs through npm with exact, typed export names, and keep binaries out of a public repo. Same bytes at runtime.

**Files:**
- Modify: `mobile/package.json` (three dependencies, via `expo install`)
- Modify: `mobile/src/theme/palette.ts` (add the `font` export)
- Modify: `mobile/app/_layout.tsx` (load the fonts, gate first paint)

**Interfaces:**
- Produces: from `src/theme` — `const font: { ui: string; uiStrong: string; figure: string }`, the three family names no screen should spell out.

- [ ] **Step 1: Install the packages**

From `mobile/`:

```bash
npx expo install expo-font @expo-google-fonts/space-grotesk @expo-google-fonts/ibm-plex-mono
```

`expo install` rather than `npm install` — it picks the versions matching SDK 57.

- [ ] **Step 2: Add the `font` token**

Append to `mobile/src/theme/palette.ts` (it stays import-free — these are plain strings):

```ts
/**
 * Family names, so no screen spells out a font.
 *
 * Figures get a mono face because most of this app is columns of numbers, and
 * proportional digits make a weight history jump about as it scrolls.
 */
export const font = {
  ui: 'SpaceGrotesk_400Regular',
  uiStrong: 'SpaceGrotesk_600SemiBold',
  figure: 'IBMPlexMono_500Medium',
} as const;
```

- [ ] **Step 3: Load them and gate first paint**

In `mobile/app/_layout.tsx`, add the imports:

```tsx
import { useFonts } from 'expo-font';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { SpaceGrotesk_400Regular, SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk';
import { View } from 'react-native';
```

Inside `RootLayout`, above the existing `useEffect`:

```tsx
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_600SemiBold,
    IBMPlexMono_500Medium,
  });
```

And immediately before the existing `return (`:

```tsx
  // The fonts are local on native but a network fetch on the iOS PWA's first
  // cold load. Painting the background colour rather than nothing means a slow
  // connection shows an empty app in the right colour — on a dark-default app
  // a white flash is the most visible failure there is.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }
```

`colors` is already in scope from the `useTheme()` call at the top of the component. Do not move the `useFonts` call below the early return — hooks must run unconditionally.

- [ ] **Step 4: Typecheck**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: both clean. No test covers this; the gate is Step 5.

- [ ] **Step 5: Verify in a browser**

The fonts are not applied to any screen yet — that is Task 5. This step proves they *load*, which is the part that can white-screen the app.

1. `npx expo start --web`.
2. Assert the app renders its normal Today screen. A permanently blank screen in the background colour means `fontsLoaded` never became true — check the export names against the package's own `index.d.ts`; a typo there fails silently.
3. Devtools → Network → filter **Font**. Assert three font files were fetched and each returned 200.
4. Devtools → Console. Assert no `fontFamily` warnings.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/theme/palette.ts mobile/app/_layout.tsx
git commit -m "$(cat <<'EOF'
feat(theme): bundle Space Grotesk and IBM Plex Mono

Figures get a mono face, which is the direction's whole signature: most of this
app is columns of numbers, and proportional digits make a weight history jump
about as it scrolls. The app already half-reached for it, with tabular-nums in
six places.

They arrive through @expo-google-fonts rather than as committed TTFs — same
bytes at runtime, no binaries in a public repo, and typed export names.

First paint is gated on the load and renders the background colour rather than
nothing: on native the files are local, but on the iOS PWA's first cold load
this is a network fetch, and a white flash on a dark-default app is the most
visible failure available.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `Card` becomes a section, and figures go mono

The change that makes the direction visible. `Card`'s props do not change, so its ~30 call sites compile untouched and the whole app restyles from one file.

**Files:**
- Modify: `mobile/src/components/Card.tsx` (rewritten)
- Modify: `mobile/src/components/Screen.tsx` (header typography)
- Modify: `mobile/src/components/StatTile.tsx`, `mobile/src/components/MacroProgress.tsx` (figures)
- Modify: the six `tabular-nums` sites (listed in Step 4)

**Interfaces:**
- Consumes: `font` from `../theme` (Task 4).
- Produces: nothing new. `CardProps` is unchanged: `title`, `subtitle`, `right`, `children`, `style`.

- [ ] **Step 1: Check whether any caller depends on the card's box**

```bash
cd mobile && grep -rn "<Card" src app --include=*.tsx | grep "style="
```

Note every hit. A caller passing `style={{ backgroundColor: … }}` or padding was styling the old box and needs looking at in Step 6. If there are no hits, the rewrite is free.

- [ ] **Step 2: Rewrite `Card.tsx`**

Replace `mobile/src/components/Card.tsx` entirely:

```tsx
import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { font, space, useTheme } from '../theme';

interface CardProps {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
}

/**
 * A titled section of a screen.
 *
 * This was a filled, bordered card. On screens that are mostly numbers a stack
 * of boxes competes with the figures for attention, and the border is the
 * first thing a reader stops seeing. It is now a rule-led section: a small
 * uppercase heading, a hairline running out to whatever sits on the right, and
 * the content below it.
 *
 * The props did not change, so every call site survived the switch untouched.
 */
export const Card = ({ title, subtitle, right, children, style }: CardProps) => {
  const { colors } = useTheme();
  return (
    <View style={[styles.section, style]}>
      {(title || right) && (
        <View style={styles.header}>
          {title && <Text style={[styles.title, { color: colors.text }]}>{title}</Text>}
          <View style={[styles.rule, { backgroundColor: colors.border }]} />
          {right}
        </View>
      )}
      {/* Below the heading rather than beside it: several callers pass a whole
          sentence here, which would be truncated on a phone by an inline slot. */}
      {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  section: { marginBottom: space.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  subtitle: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: space.xs },
});
```

- [ ] **Step 3: Screen header typography**

In `mobile/src/components/Screen.tsx`, add `font` to the theme import and change only the two style entries:

```tsx
  title: { fontFamily: font.uiStrong, fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontFamily: font.ui, fontSize: 14, marginTop: 2 },
```

Drop `fontWeight: '700'` from `title` — the weight now comes from the family, and leaving both makes the renderer synthesise a faux-bold on top of a real one. Its padding and safe-area handling are correct; do not touch them.

- [ ] **Step 4: Figures adopt the mono face**

Add `fontFamily: font.figure` beside the existing `fontVariant: ['tabular-nums']` at each of these, importing `font` where it is not already imported:

| File | Style key |
| --- | --- |
| `src/components/EditEntrySheet.tsx` | `preview` |
| `src/components/LogFoodSheet.tsx` | `preview` |
| `src/components/MacroProgress.tsx` | `barValue` |
| `app/(tabs)/index.tsx` | `entryKcal` |
| `app/(tabs)/weight.tsx` | `rowValue` |
| `app/describe.tsx` | `macros` |

Then the two figures that have no `tabular-nums` yet — add **both** properties to each:

| File | Style key |
| --- | --- |
| `src/components/MacroProgress.tsx` | `ringValue` |
| `src/components/StatTile.tsx` | `value` |

As with `Screen`, remove `fontWeight` from any of these that carries one; `IBMPlexMono_500Medium` is already the weight.

- [ ] **Step 5: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: both clean.

- [ ] **Step 6: Verify in a browser — every screen**

This is the task that restyles the whole app, so every screen needs looking at. The contrast test catches unreadable text; it does not catch a layout that only held together because a card had a border.

1. `npx expo start --web`, devtools device toolbar → **iPhone**.
2. Walk **Today, Weight, Train, Trends, Settings**, then open each modal: Add food, Quick add, Repeat a day, Describe a meal, New food, Scan, Routines, Workout, Progression, Import workouts.
3. On each, assert: no text is clipped or overlapping; section headings read as small uppercase labels with a rule running right; and every number is in the mono face — compare a `1` against a `7`, which are unmistakably different in IBM Plex Mono.
4. Specifically check `StatTile` rows on **Trends** and **Progression**: they keep their `surfaceRaised` fill and are now the only filled things on those screens, which is what should give them their weight.
5. Specifically check `LineChart` on **Trends** and **Progression**: it takes its colours as props from its callers, so it follows the palette, but its gridlines and axis labels were drawn against navy. Assert they are legible on near-black.
6. Toggle the OS to light mode and repeat steps 3–5. Both schemes ship.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components mobile/app
git commit -m "$(cat <<'EOF'
feat(ui): cards become sections, and every figure goes mono

A screen that is mostly numbers does not want a stack of boxes: the borders
compete with the figures, and a border is the first thing a reader stops
seeing. Card keeps its props and loses its fill and outline, becoming a small
uppercase heading with a hairline running out to whatever sits on its right.
Because the props did not change, all thirty-odd call sites restyled without
being touched.

The subtitle moved below the heading rather than beside it — several callers
pass a whole sentence, which an inline slot would truncate on a phone.

Figures take IBM Plex Mono, tabular, so a column of weights stops shifting
about as it scrolls.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Settings becomes seven collapsible sections

536 lines and twelve cards on one blind scroll, mixing what you set once with what you touch never. Seven closed headings is a map; twelve open cards is a scroll.

No new routes: on the iOS PWA every avoided push is an avoided full-page navigation.

**Files:**
- Modify: `mobile/app/(tabs)/settings.tsx` only

**Interfaces:**
- Consumes: `Card` from Task 5 (used *inside* sections, unchanged).
- Produces: nothing exported. `Section` is local to this file — one disclosure row plus a conditional body, used seven times in one file, which does not earn a place in `src/components`.

- [ ] **Step 1: Add the local `Section` component**

In `mobile/app/(tabs)/settings.tsx`, below the existing `NumberSetting` component, add:

```tsx
/**
 * A settings group that stays shut until asked for.
 *
 * Twelve cards on one scroll meant hunting by thumb for a setting you already
 * knew the name of. Closed headings put the whole map on one screen.
 */
const Section = ({
  title,
  subtitle,
  initiallyOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  initiallyOpen?: boolean;
  children: React.ReactNode;
}) => {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);

  return (
    <View style={{ marginBottom: space.md }}>
      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        style={({ pressed }) => [
          styles.sectionHeader,
          { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          {subtitle && <Text style={[styles.note, { color: colors.textFaint }]}>{subtitle}</Text>}
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.textMuted}
        />
      </Pressable>
      {open && <View style={{ paddingTop: space.md }}>{children}</View>}
    </View>
  );
};
```

Add to the imports at the top of the file:

```tsx
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { font, space, useTheme } from '../../src/theme';
import { TOUCH_TARGET } from '../../src/components/Controls';
```

(`Pressable` joins the existing `react-native` import; `space` and `useTheme` are already imported — add `font` to that line rather than duplicating it. `TOUCH_TARGET` joins the existing `Controls` import alongside `Button, Field, Segmented`.)

And to the `StyleSheet.create` at the bottom:

```tsx
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { fontFamily: font.uiStrong, fontSize: 15 },
```

- [ ] **Step 2: Regroup the twelve cards into seven sections**

Wrap the existing `<Card>` blocks in `<Section>`s, moving nothing but their position in the tree. **Do not edit the contents of any card** — every `Field`, `Segmented`, `NumberSetting`, `Button` and its handler stays exactly as it is.

| `<Section>` | `initiallyOpen` | Wraps the existing cards |
| --- | --- | --- |
| `You` | `true` | `You` |
| `Goal` | — | `Goal`, `Macros` |
| `Units` | — | `Units` |
| `Food data` | — | `Food data`, `Looking up restaurant food`, `Describing meals` |
| `Your data` | — | `Your data`, `Lifting history` |
| `Advanced` | — | `Model tuning` |
| `Demo data` | — | `Demo data` (keep its `{__DEV__ && …}` guard **outside** the `Section`) |

`<HomeScreenNotice />` stays where Task 1 put it — first child of `<Screen>`, **outside** and above every `Section`. It is a warning, not a setting.

Where a `Section` absorbs several cards, the inner `Card` components stay as they are, so each keeps its own heading inside the open section. `Goal` opens to show a `Goal` card and a `Macros` card; that is the intended nesting, not a redundancy to flatten.

- [ ] **Step 3: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: both clean.

- [ ] **Step 4: Verify in a browser**

1. `npx expo start --web`, device toolbar → **iPhone**, go to Settings.
2. Assert seven headings are visible **without scrolling**, except the last one or two. That is the point of the task; if it still takes several flicks to see the map, the sections are not closed.
3. Assert `You` is open and the other six are closed.
4. Open each of the seven in turn. Assert every setting from the original twelve cards is reachable, and that each still **works** — not merely renders. Concretely: open `Goal`, change `Rate`, and assert the target on the Today screen moves. A check that a label is on screen would pass against a dead control.
5. Assert the `Demo data` section is present (a dev build) and that its three buttons are inside it.
6. Assert `Your data` contains backup, restore **and** the Hevy import button, and that `Import from Hevy` still routes to the import screen.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(tabs)/settings.tsx"
git commit -m "$(cat <<'EOF'
feat(settings): twelve cards become seven collapsible sections

536 lines on one blind scroll, mixing what you set once (height) with what you
touch never (energy per kg of tissue) and what you may want in a hurry
(backup). Closed headings put the whole map on one screen instead.

The merges follow what the settings are for rather than what they configure:
Macros folds into Goal because protein and minimum fat are goal parameters;
restaurant lookup and meal description fold into Food data because all three
decide where nutrition numbers come from; and the Hevy import folds into Your
data, next to backup and restore, because that is what it is.

No new routes — on the iOS PWA every avoided push is a full-page navigation
avoided. Section is local to this file: one disclosure row used seven times
does not earn a place in src/components.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Today's meal actions, twelve targets to eight

Three icon buttons per meal across four meals is twelve targets whose glyphs do not explain themselves — a sparkle and a barcode are guesses. The common path (search) keeps its single tap; the two rarer actions gain words.

**Files:**
- Create: `mobile/src/components/MealActionsSheet.tsx`
- Modify: `mobile/app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Meal` from `@adaptive-macros/engine`; `MEAL_LABELS` from `src/format`.
- Produces: `MealActionsSheet` — props `{ meal: Meal | null; onClose: () => void; onDescribe: (meal: Meal) => void; onScan: (meal: Meal) => void }`. A `null` `meal` means closed, matching how `EditEntrySheet` takes a `null` entry.

- [ ] **Step 1: Create the sheet**

Create `mobile/src/components/MealActionsSheet.tsx`, following `EditEntrySheet`'s `Modal` + backdrop + bottom-sheet shape:

```tsx
import type { Meal } from '@adaptive-macros/engine';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_LABELS } from '../format';
import { font, radius, space, useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Controls';

interface MealActionsSheetProps {
  meal: Meal | null;
  onClose: () => void;
  onDescribe: (meal: Meal) => void;
  onScan: (meal: Meal) => void;
}

/**
 * The two less-used ways to add food to a meal.
 *
 * These were icon buttons on every meal card — a sparkle and a barcode, four
 * times over, which is twelve targets on one screen and two glyphs nobody
 * reads the same way twice. Behind one overflow they can afford words.
 */
export const MealActionsSheet = ({ meal, onClose, onDescribe, onScan }: MealActionsSheetProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={meal !== null} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            paddingBottom: insets.bottom + space.lg,
          },
        ]}
      >
        {meal && (
          <>
            <Text style={[styles.title, { color: colors.text }]}>Add to {MEAL_LABELS[meal]}</Text>

            <Pressable onPress={() => onDescribe(meal)} style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name="sparkles-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Describe it in words</Text>
                <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                  Write or dictate what you ate and get macros back.
                </Text>
              </View>
            </Pressable>

            <Pressable onPress={() => onScan(meal)} style={[styles.row, { borderColor: colors.border }]}>
              <Ionicons name="barcode-outline" size={20} color={colors.text} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.text }]}>Scan a barcode</Text>
                <Text style={[styles.rowHint, { color: colors.textFaint }]}>
                  Point the camera at the packaging.
                </Text>
              </View>
            </Pressable>

            <View style={{ height: space.md }} />
            <Button label="Cancel" variant="subtle" onPress={onClose} />
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
  },
  title: { fontFamily: font.uiStrong, fontSize: 16, marginBottom: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: TOUCH_TARGET + 12,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontFamily: font.ui, fontSize: 15 },
  rowHint: { fontFamily: font.ui, fontSize: 12, marginTop: 2 },
});
```

- [ ] **Step 2: Replace the three-icon row on Today**

In `mobile/app/(tabs)/index.tsx`, add the import:

```tsx
import { MealActionsSheet } from '../../src/components/MealActionsSheet';
```

Add the state, beside the existing `editing` state:

```tsx
  const [mealActions, setMealActions] = useState<Meal | null>(null);
```

In the `right={…}` slot of each meal `<Card>`, replace the **three** `Pressable`s with **two** — the overflow first, the add button last so the primary action stays where the thumb already expects it:

```tsx
              <View style={styles.mealActions}>
                <Pressable
                  onPress={() => setMealActions(meal)}
                  style={[styles.iconButton, { backgroundColor: colors.surfaceRaised }]}
                  accessibilityLabel={`More ways to add to ${MEAL_LABELS[meal]}`}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => router.push({ pathname: '/search', params: { meal } })}
                  style={[styles.iconButton, { backgroundColor: colors.accent }]}
                  accessibilityLabel={`Search for a food to add to ${MEAL_LABELS[meal]}`}
                >
                  <Ionicons name="add" size={18} color={colors.onFill} />
                </Pressable>
              </View>
```

- [ ] **Step 3: Mount the sheet**

Beside the existing `<EditEntrySheet …/>` at the end of the `<Screen>`:

```tsx
      <MealActionsSheet
        meal={mealActions}
        onClose={() => setMealActions(null)}
        onDescribe={(meal) => {
          setMealActions(null);
          router.push({ pathname: '/describe', params: { meal } });
        }}
        onScan={(meal) => {
          setMealActions(null);
          router.push({ pathname: '/scan', params: { meal } });
        }}
      />
```

Closing before navigating, not after: leaving the modal mounted across a route change puts a sheet over the screen you just opened.

- [ ] **Step 4: Typecheck and test**

```bash
cd mobile && npm run typecheck && npm test
```

Expected: both clean. If `Meal` is reported as an unused type import, it is already imported at the top of `index.tsx` — do not add a second.

- [ ] **Step 5: Verify in a browser**

1. `npx expo start --web`, device toolbar → **iPhone**, Today screen.
2. Count the icon buttons on the meal rows. Assert **eight**, two per meal.
3. Tap `+` on Lunch. Assert the Add food screen opens **and that it is scoped to lunch** — add something and assert it lands under Lunch, not Snack. The route param is the thing that breaks silently here.
4. Tap `⋯` on Dinner. Assert the sheet says "Add to Dinner", and that both rows show their explanatory line.
5. From that sheet tap **Describe it in words**. Assert the describe screen opens, the sheet is gone behind it, and going back leaves Today with no sheet on top.
6. Repeat step 5 for **Scan a barcode**.
7. Tap `⋯`, then tap the dimmed area above the sheet. Assert it closes and nothing navigates.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/MealActionsSheet.tsx "mobile/app/(tabs)/index.tsx"
git commit -m "$(cat <<'EOF'
feat(today): two actions per meal instead of three

Three icon buttons across four meals is twelve targets on one screen, and two
of the three glyphs are guesses — a sparkle and a barcode do not say "write
what you ate" and "point the camera at the packaging" to anyone who has not
already been told.

The add button keeps its single tap, because searching is the common path.
Describe and scan move behind an overflow, where they can afford words. Twelve
targets become eight.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## After the plan

The web build is **not** committed. Deploying these changes means staging the export into `services/gemini-proxy/web/` — `web/`, never `dist/`, which `.gcloudignore` excludes — and the steps in the handoff's *Deploying* section. A routine deploy must **not** pass `--set-env-vars`.

Two checks that only real hardware can answer, both of which this plan makes more urgent rather than less:

- **iOS, installed.** Safari → Add to Home Screen → log a weight → fully close → reopen. Task 4 introduces a network font fetch on first cold load, and Task 1's banner is the one thing on the deployed site that only an iOS browser ever renders. Neither has been seen on a real iPhone.
- **Migration v3 against a device holding v2 data.** Untouched by this plan, still outstanding.

`HANDOFF.md` should be updated once these land — it currently states that Settings holds the four lifting entries, which commit `ba14592` already made untrue.
