# Photo Meal Estimate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Photograph a meal, or pick a photo, and get the same reviewable estimate the text path already produces.

**Architecture:** The request-shaping logic moves into a pure `src/ai/mealRequest.ts` so it can be tested under the node harness. The two multimodal providers take an optional image; Ollama rejects one explicitly. `describe.tsx` grows a picker and a preview and feeds the estimate flow it already owns. The Cloud Run proxy is untouched — it forwards the body it is given.

**Tech Stack:** Expo SDK 57, React Native 0.86, expo-image-picker, expo-image-manipulator, Gemini `gemini-3.5-flash`, Anthropic SDK, vitest (`environment: 'node'`).

## Global Constraints

- `mobile/vitest.config.ts` runs `environment: 'node'`. A test importing `react-native` directly or transitively **fails to run**. No component tests, no tests of `mealPhoto.ts`.
- `SYSTEM_PROMPT` must be sent byte-identical when there is no image. The meal-estimation eval compares providers on it verbatim.
- Every `<Text>` and text style sets `fontFamily` from the `font` tokens. No hard-coded colours — all from `useTheme().colors`. Text on a filled control uses `colors.onFill`. Touch targets use `TOUCH_TARGET`.
- Two runtimes, one codebase: Android native, iOS as a PWA. Anything without a web implementation cannot ship.
- Resize: longest edge **1024 px**, JPEG **quality 0.7**, base64.
- Timeout: **60 s** when a request carries an image, **30 s** when it does not.
- Install dependencies with `npx expo install`, never a bare `npm install`, so SDK 57 picks the versions.
- Scope discipline: every changed line traces to this plan.
- Commit messages end with the two trailers in use on this branch.

---

### Task 1: The request builders, pure and tested

**Files:**
- Create: `mobile/src/ai/mealRequest.ts`
- Create: `mobile/src/ai/__tests__/mealRequest.test.ts`
- Modify: `mobile/src/ai/describeMeal.ts` (add `PHOTO_PROMPT_ADDENDUM`, `MealPhoto`, `PhotoUnsupportedError`)

**Interfaces:**
- Consumes: `SYSTEM_PROMPT` from `describeMeal.ts`.
- Produces: `MealPhoto`, `PHOTO_PROMPT_ADDENDUM`, `PhotoUnsupportedError`, `systemInstructionFor`, `geminiPartsFor`, `claudeContentFor`.

- [ ] **Step 1: Add the shared types and prompt to `describeMeal.ts`**

Beside `SYSTEM_PROMPT`:

```ts
/** A photo already shrunk and encoded, ready to send. */
export interface MealPhoto {
  base64: string;
  mimeType: string;
}

/**
 * Appended to SYSTEM_PROMPT only when an image is present.
 *
 * Kept separate rather than folded in because the meal-estimation eval compares
 * providers on SYSTEM_PROMPT verbatim; changing that prompt would silently
 * change what the eval measures.
 */
export const PHOTO_PROMPT_ADDENDUM = `
The user has sent a photograph of what they ate. Identify each food you can see and estimate the portion from what is on the plate, using the plate, cutlery or container as a size reference — say in the assumption what you judged the portion against.

If the text contradicts the photograph, the text wins: it is what the person says they ate, and the photograph may be of someone else's plate or of the food before they finished.

Where part of the meal is hidden, stacked or ambiguous, say so in the assumption and lower the confidence rather than guessing confidently.

If the photograph is not of food, set notFood.`;

export class PhotoUnsupportedError extends Error {
  constructor() {
    super('Photo estimates need Gemini or Claude. Change the estimate provider in Settings.');
    this.name = 'PhotoUnsupportedError';
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `mobile/src/ai/__tests__/mealRequest.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PHOTO_PROMPT_ADDENDUM, SYSTEM_PROMPT } from '../describeMeal';
import { claudeContentFor, geminiPartsFor, systemInstructionFor } from '../mealRequest';

const photo = { base64: 'QUJD', mimeType: 'image/jpeg' };

describe('systemInstructionFor', () => {
  it('is byte-identical to SYSTEM_PROMPT without a photo', () => {
    // The eval compares providers on this prompt verbatim.
    expect(systemInstructionFor(undefined)).toBe(SYSTEM_PROMPT);
  });

  it('appends the photo addendum with one', () => {
    expect(systemInstructionFor(photo)).toBe(`${SYSTEM_PROMPT}\n${PHOTO_PROMPT_ADDENDUM}`);
  });
});

describe('geminiPartsFor', () => {
  it('sends text alone when there is no photo', () => {
    expect(geminiPartsFor('  two eggs  ', undefined)).toEqual([{ text: 'two eggs' }]);
  });

  it('puts the image first, because the text is context for it', () => {
    expect(geminiPartsFor('two eggs', photo)).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
      { text: 'two eggs' },
    ]);
  });

  it('still sends a text part when the description is empty', () => {
    // A photo with no words is the common case; parts[1] must still exist.
    expect(geminiPartsFor('', photo)).toEqual([
      { inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } },
      { text: '' },
    ]);
  });
});

describe('claudeContentFor', () => {
  it('is a plain string without a photo, as it is today', () => {
    expect(claudeContentFor('two eggs', undefined)).toBe('two eggs');
  });

  it('is an image block followed by a text block with one', () => {
    expect(claudeContentFor('two eggs', photo)).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
      { type: 'text', text: 'two eggs' },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd mobile && npx vitest run src/ai/__tests__/mealRequest.test.ts`
Expected: FAIL, cannot resolve `../mealRequest`.

- [ ] **Step 4: Write `mealRequest.ts`**

```ts
import { PHOTO_PROMPT_ADDENDUM, SYSTEM_PROMPT, type MealPhoto } from './describeMeal';

/**
 * The system prompt for a request, with the photo instructions only when they apply.
 *
 * Without a photo this returns SYSTEM_PROMPT itself, not a copy with the same
 * characters — the test asserts identity because the eval compares providers on
 * that prompt verbatim.
 */
export const systemInstructionFor = (photo: MealPhoto | undefined): string =>
  photo ? `${SYSTEM_PROMPT}\n${PHOTO_PROMPT_ADDENDUM}` : SYSTEM_PROMPT;

/**
 * Gemini's parts array. The image leads, because the words are context for the
 * picture rather than the other way round.
 */
export const geminiPartsFor = (description: string, photo: MealPhoto | undefined) => [
  ...(photo ? [{ inlineData: { mimeType: photo.mimeType, data: photo.base64 } }] : []),
  { text: description.trim() },
];

/** The same two cases in Anthropic's shape. A plain string when there is no image. */
export const claudeContentFor = (description: string, photo: MealPhoto | undefined) =>
  photo
    ? [
        {
          type: 'image' as const,
          source: { type: 'base64' as const, media_type: photo.mimeType, data: photo.base64 },
        },
        { type: 'text' as const, text: description.trim() },
      ]
    : description.trim();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd mobile && npx vitest run src/ai/__tests__/mealRequest.test.ts && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/ai/mealRequest.ts mobile/src/ai/__tests__/mealRequest.test.ts mobile/src/ai/describeMeal.ts
git commit -m "feat(ai): shape a meal request that may carry a photograph"
```

---

### Task 2: Both multimodal providers take an optional photo

**Files:**
- Modify: `mobile/src/ai/geminiDescribe.ts`
- Modify: `mobile/src/ai/describeMeal.ts` (`describeMeal`, `estimateMeal`, `describeErrorMessage`)
- Modify: `mobile/src/ai/__tests__/mealRequest.test.ts` (add the Ollama rejection test)

**Interfaces:**
- Consumes: Task 1's `systemInstructionFor`, `geminiPartsFor`, `claudeContentFor`, `MealPhoto`, `PhotoUnsupportedError`.
- Produces: `estimateMeal(description, config, photo?)`, `describeMealWithGemini(description, apiKey, photo?)`, `describeMeal(description, apiKey, model?, photo?)`.

- [ ] **Step 1: Write the failing test for the Ollama rejection**

Append to `mobile/src/ai/__tests__/mealRequest.test.ts`:

```ts
import { PhotoUnsupportedError } from '../describeMeal';
import { estimateMeal } from '../describeMeal';

const ollamaConfig = {
  provider: 'ollama' as const,
  geminiApiKey: '',
  anthropicApiKey: '',
  ollamaHost: 'http://localhost:11434',
  ollamaModel: 'llama3',
};

describe('estimateMeal with a photo', () => {
  it('refuses the local provider, which cannot see', async () => {
    // Failing deep inside an Ollama call would name the mechanism, not the problem.
    await expect(estimateMeal('', ollamaConfig, photo)).rejects.toBeInstanceOf(
      PhotoUnsupportedError,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd mobile && npx vitest run src/ai/__tests__/mealRequest.test.ts`
Expected: FAIL — `estimateMeal` does not take a third argument, so it dispatches to Ollama and tries to reach localhost.

- [ ] **Step 3: Thread the photo through `estimateMeal`**

In `describeMeal.ts`, replace the body of `estimateMeal` with:

```ts
export const estimateMeal = async (
  description: string,
  config: {
    provider: 'gemini' | 'ollama' | 'anthropic';
    geminiApiKey: string;
    anthropicApiKey: string;
    ollamaHost: string;
    ollamaModel: string;
  },
  photo?: MealPhoto,
): Promise<DescribeResult> => {
  if (config.provider === 'ollama') {
    // Checked here rather than inside the Ollama path so the refusal is a
    // sentence about the provider, not a parse failure three layers down.
    if (photo) throw new PhotoUnsupportedError();
    const { describeMealWithOllama } = await import('./ollama');
    return describeMealWithOllama(description, config.ollamaHost, config.ollamaModel);
  }
  if (config.provider === 'anthropic') {
    return describeMeal(description, config.anthropicApiKey, DEFAULT_MODEL, photo);
  }
  const { describeMealWithGemini } = await import('./geminiDescribe');
  return describeMealWithGemini(description, config.geminiApiKey, photo);
};
```

- [ ] **Step 4: Give `describeMeal` the photo**

Change its signature and the two lines that build the request:

```ts
export const describeMeal = async (
  description: string,
  apiKey: string,
  model: string = DEFAULT_MODEL,
  photo?: MealPhoto,
): Promise<DescribeResult> => {
```

and inside the `client.messages.parse` call:

```ts
    system: systemInstructionFor(photo),
    messages: [{ role: 'user', content: claudeContentFor(description, photo) }],
```

Import `claudeContentFor` and `systemInstructionFor` from `./mealRequest`.

- [ ] **Step 5: Give the Gemini path the photo and the longer timeout**

In `geminiDescribe.ts`, replace the `TIMEOUT_MS` constant and use the builders:

```ts
/** A text estimate is a short generation. */
const TIMEOUT_MS = 30_000;
/**
 * An image request also has to upload a few hundred kilobytes, often on mobile
 * data, before the model starts. Thirty seconds spends the whole budget on the
 * upload and reports a timeout that is really a slow connection.
 */
const PHOTO_TIMEOUT_MS = 60_000;
```

```ts
export const describeMealWithGemini = async (
  description: string,
  apiKey: string,
  photo?: MealPhoto,
): Promise<DescribeResult> => {
  const route = routeFor(MODEL, apiKey);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), photo ? PHOTO_TIMEOUT_MS : TIMEOUT_MS);
```

and the body:

```ts
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstructionFor(photo) }] },
        contents: [{ parts: geminiPartsFor(description, photo) }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: MEAL_RESPONSE_SCHEMA,
        },
      }),
```

- [ ] **Step 6: Surface the refusal in `describeErrorMessage`**

Add, before the existing `MissingApiKeyError` branch:

```ts
  if (error instanceof PhotoUnsupportedError) return error.message;
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `cd mobile && npm run typecheck && npm test`
Expected: clean, and the suite grows by the new cases only.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/ai
git commit -m "feat(ai): let Gemini and Claude estimate a meal from a photograph"
```

---

### Task 3: Take the photo, and show it

**Files:**
- Create: `mobile/src/ai/mealPhoto.ts`
- Modify: `mobile/app/describe.tsx`
- Modify: `mobile/src/components/MealActionsSheet.tsx`
- Modify: `mobile/app/(tabs)/index.tsx` (pass the new action through)
- Modify: `mobile/package.json` (via `npx expo install`)

**Interfaces:**
- Consumes: Task 1's `MealPhoto`, Task 2's `estimateMeal(description, config, photo?)`.
- Produces: `takeMealPhoto()`, `chooseMealPhoto()`, both `Promise<MealPhoto | null>` — `null` when the user cancels.

- [ ] **Step 1: Install the dependencies**

```bash
cd mobile && npx expo install expo-image-picker expo-image-manipulator
```

Expected: both resolve to SDK 57-compatible versions and land in `dependencies`.

- [ ] **Step 2: Write `mealPhoto.ts`**

```ts
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { MealPhoto } from './describeMeal';

/**
 * Long enough to tell rice from couscous, small enough not to be billed for pixels.
 *
 * Gemini charges an image by tiling it, so a twelve-megapixel photo costs several
 * times what this does and adds nothing: identifying the food and judging the
 * portion against the plate is plate-level work.
 */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.7;

/**
 * Shrinks and re-encodes, returning base64.
 *
 * base64 rather than a file path because the web build has no filesystem: on web
 * the camera hands back base64 already, and one representation that behaves the
 * same on both runtimes is worth more than the few bytes saved.
 */
const prepare = async (uri: string, width: number, height: number): Promise<MealPhoto> => {
  // Constrain the LONGEST edge. Resizing a 3000x4000 portrait by width alone
  // leaves it 1024x1365, which is taller than the budget and billed for it.
  const resize = width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE };
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize }], {
    compress: JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  return { base64: result.base64 ?? '', mimeType: 'image/jpeg' };
};

/** `null` when the user backs out, which is not an error. */
const firstAsset = async (
  result: ImagePicker.ImagePickerResult,
): Promise<MealPhoto | null> => {
  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  return prepare(asset.uri, asset.width, asset.height);
};

export const takeMealPhoto = async (): Promise<MealPhoto | null> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera access is off for this app. You can still describe the meal.');
  }
  return firstAsset(await ImagePicker.launchCameraAsync({ quality: 1 }));
};

export const chooseMealPhoto = async (): Promise<MealPhoto | null> =>
  firstAsset(await ImagePicker.launchImageLibraryAsync({ quality: 1 }));
```

`quality: 1` at the picker and the real compression in the manipulator: compressing
twice would lose detail for nothing.

**Check the installed API before writing this.** `expo-image-manipulator` also exposes a
newer context API (`manipulate(uri)` → `renderAsync()` → `saveAsync()`) alongside
`manipulateAsync`, and which of the two is current depends on the version `npx expo
install` resolves. Read the installed package's types after step 1 and use whichever it
offers; if both exist, prefer the context API, since `manipulateAsync` is the older
shape. The typecheck in step 7 catches a wrong guess, but reading first is cheaper.

- [ ] **Step 3: Add the photo to `describe.tsx`**

State, beside the existing `text`:

```tsx
  const [photo, setPhoto] = useState<MealPhoto | null>(null);
```

The picker controls, directly above the existing `Field` for the description:

```tsx
      {photo ? (
        <View style={styles.photoRow}>
          <Image
            source={{ uri: `data:${photo.mimeType};base64,${photo.base64}` }}
            style={styles.photoPreview}
          />
          <Button label="Remove" variant="subtle" onPress={() => setPhoto(null)} />
        </View>
      ) : (
        <View style={styles.photoRow}>
          <Button label="Take a photo" variant="subtle" onPress={() => void pick(takeMealPhoto)} />
          <Button label="Choose a photo" variant="subtle" onPress={() => void pick(chooseMealPhoto)} />
        </View>
      )}
```

with:

```tsx
  const pick = async (source: () => Promise<MealPhoto | null>) => {
    setError(null);
    try {
      const chosen = await source();
      if (chosen) setPhoto(chosen);
    } catch (e) {
      setError((e as Error).message);
    }
  };
```

Styles:

```tsx
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  photoPreview: { width: 72, height: 72, borderRadius: radius.md },
```

Import `Image` from `react-native`, `MealPhoto` from `../src/ai/describeMeal`, and both
pickers from `../src/ai/mealPhoto`.

- [ ] **Step 4: Let a photo alone be enough to estimate**

Two places gate on empty text and **both** must change, or the photo path looks broken.

`run()` (`describe.tsx:78`):

```tsx
    if (!text.trim() && !photo) return;
```

and pass the photo:

```tsx
      const result = await estimateMeal(text, { /* unchanged */ }, photo ?? undefined);
```

The button (`describe.tsx:234`):

```tsx
          disabled={busy || (!text.trim() && !photo) || !ready}
```

- [ ] **Step 5: Open the camera when asked to**

Read the param beside the existing `meal` one:

```tsx
  const params = useLocalSearchParams<{ meal?: string; capture?: string }>();
```

and once on mount:

```tsx
  useEffect(() => {
    if (params.capture === 'camera') void pick(takeMealPhoto);
    // Mount only: re-running on a param identity change would reopen the camera
    // behind the user every time this screen re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 6: Add the third row to `MealActionsSheet`**

Add `onPhotograph: (meal: Meal) => void` to the props, destructure it, and add a row
between Describe and Scan, copying the existing rows' markup exactly — same
`styles.row`, same label and sublabel shape:

```tsx
            <Pressable onPress={() => onPhotograph(meal)} style={[styles.row, { borderColor: colors.border }]}>
```

with label `Photograph it` and the sublabel `Estimate the macros from a picture`.

In `mobile/app/(tabs)/index.tsx`, beside `onDescribe`:

```tsx
        onPhotograph={(meal) => {
          setMealActions(null);
          router.push({ pathname: '/describe', params: { meal, capture: 'camera' } });
        }}
```

- [ ] **Step 7: Typecheck, test, and export for web**

```bash
cd mobile && npm run typecheck && npm test && npx expo export --platform web
```

Expected: all clean. The export is the check that matters here — it is the first
thing that proves the two new native modules resolve in the web build, which is how
this reaches iOS.

- [ ] **Step 8: Verify in a browser**

Serve the staged build through the real proxy, because Metro does not serve
`/api/gemini` and the feature will look broken against a dev server:

```bash
cd mobile && rm -rf dist && npx expo export --platform web
cd .. && rm -rf services/gemini-proxy/web && cp -r mobile/dist services/gemini-proxy/web
cd services/gemini-proxy && npm run build
PORT=8081 GEMINI_API_KEY=<from mobile/.env.local> PROXY_TOKEN=<from mobile/.env.local> WEB_ROOT=$(pwd)/web node dist/index.js
```

1. Today → a meal's `…` → **Photograph it**. Assert the camera or file picker opens.
2. Choose a photo of food. Assert the preview appears and Estimate becomes enabled with no text typed.
3. Estimate. Assert items come back naming the foods actually in the picture, each with an assumption that references what the portion was judged against.
4. **Record the input-token count** from the response. This is the cost-per-photo figure the spec says to measure rather than guess.
5. Add a line of text contradicting the photo and re-estimate. Assert the text wins.
6. Remove the photo. Assert Estimate disables again with no text.
7. A photo that is not food. Assert `notFood` is honoured rather than items being invented.

- [ ] **Step 9: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/ai/mealPhoto.ts mobile/app/describe.tsx mobile/src/components/MealActionsSheet.tsx "mobile/app/(tabs)/index.tsx"
git commit -m "feat(describe): estimate a meal from a photograph"
```

---

## After the plan

Record the measured input-token cost per photo in `HANDOFF.md`, beside the 26.5-second
enrichment measurement, so the next person has a number rather than an assumption.

Deploy together with the relevance-aware food lookup (`fd0ea21`, `a0b23fd`), which is
committed and unshipped. The staging recipe is in `HANDOFF.md`; a routine deploy must
not pass `--set-env-vars`, and `gcloud` on this machine needs `CLOUDSDK_PYTHON`
pointed at `AppData\Local\Programs\Python\Python312\python.exe`.
