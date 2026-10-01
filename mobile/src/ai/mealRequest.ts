import { type MealPhoto, PHOTO_PROMPT_ADDENDUM, SYSTEM_PROMPT } from './describeMeal';

/**
 * Shapes what gets sent for a meal estimate, with or without a photograph.
 *
 * Separate from the two provider modules so it can be tested: `vitest.config.ts`
 * runs `environment: 'node'`, and anything reaching React Native fails to run at
 * all. The providers themselves cannot be tested here; the decision about what
 * goes in the request can, and that is where this feature can quietly go wrong.
 */

/**
 * The system prompt for a request, carrying the photo instructions only when
 * there is a photo.
 *
 * Without one this returns `SYSTEM_PROMPT` itself rather than a copy with the
 * same characters, and a test asserts that identity: the meal-estimation eval
 * compares providers on that prompt verbatim, so a stray newline here would
 * change what the eval measures without anything appearing to break.
 */
export const systemInstructionFor = (photo: MealPhoto | undefined): string =>
  photo ? `${SYSTEM_PROMPT}\n${PHOTO_PROMPT_ADDENDUM}` : SYSTEM_PROMPT;

/**
 * Gemini's `parts` array.
 *
 * The image leads and the text follows, because the words are context for the
 * picture rather than the other way round. The text part is sent even when it
 * is empty — a photo with nothing typed is the ordinary case.
 */
export const geminiPartsFor = (description: string, photo: MealPhoto | undefined) => [
  ...(photo ? [{ inlineData: { mimeType: photo.mimeType, data: photo.base64 } }] : []),
  { text: description.trim() },
];

/**
 * The same two cases in Anthropic's shape.
 *
 * A plain string when there is no image, which is exactly what the text path
 * sends today, so adding this changes nothing for it.
 */
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
