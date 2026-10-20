import type { Sex } from '@adaptive-macros/engine';
import { z } from 'zod';
import { ALLOWANCE_USED_MESSAGE, SIGN_IN_AGAIN_MESSAGE, fetchGemini, isPersonalLimit } from '../api/gemini';
import type { MealPhoto } from './describeMeal';

/**
 * A body-fat range read from two photographs, for people who have never been
 * measured and would otherwise get only the BMI-based guess.
 *
 * Purpose-built photo models (with standardised poses and a validation set
 * scanned by DXA) get within about 2–2.5 points. Gemini has no such
 * validation, so this asks for a range rather than a figure, keeps the
 * observations it based the range on, and is offered below a tape measurement
 * rather than in place of one.
 *
 * The photographs go to Gemini once and are not kept: nothing here writes
 * them anywhere, and the proxy passes the request straight through.
 */

const MODEL = 'gemini-3.5-flash';

/** Two images upload before the model starts, often on mobile data. */
const TIMEOUT_MS = 60_000;

export interface BodyContext {
  sex: Sex;
  age: number;
  heightCm: number;
  /** The weight trend when there is one; null leaves weight out of the prompt. */
  weightKg: number | null;
}

/**
 * The instruction is long because the failure modes are specific: a narrow
 * range claims precision a photograph cannot carry, and a photo of a minor or
 * of loose clothing should get no figure at all. Language is constrained
 * because the person reading the reply is looking at their own body.
 */
export const BODY_FAT_INSTRUCTION = `You estimate body fat percentage from two photographs of one adult: a front view and a side view. They are usually mirror selfies taken at home, often bare-chested or in a sports bra, sometimes in trousers.

People store fat in different places: some mostly around the abdomen, others on the hips, thighs, arms or back. Look at every region you can see and weigh them together; do not judge from the abdomen alone. When a region is covered, such as legs in trousers, estimate from what is visible, say in "basis" what was covered, and widen the range to reflect it rather than declining.

Return a range, lowPct to highPct, that a careful visual assessment can honestly support. Visual estimates are rarely better than ±3 points, so the range should normally be 5 to 8 points wide, and wider when lighting, pose or clothing hide the body's outline. Use the sex, age, height and weight given as context.

In "basis", give two to four short, neutral observations about what you saw that set the range, covering the regions that mattered, such as how defined the abdomen is, the outline of the waist in the side view, the shape of the hips and thighs, or muscle definition in the arms and shoulders. Describe; do not judge. Never comment on attractiveness, health, or anything other than body composition, and ignore the face and background.

Set "usable" to false, leave the numbers at 0, and say in "reason" in one sentence how to retake the photos, only when one of these is true: the photos do not show a person; they show more than one person; the torso from shoulders to waistband is not visible in either photo; loose clothing covers the torso; the two photos are not a front and a side view of the same person. A phone held in front of part of the body, a mirror's frame, or covered legs are not reasons to decline. If the person may be under 18, set "usable" to false and say only that this estimate is for adults.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    usable: { type: 'boolean' },
    reason: { type: 'string' },
    lowPct: { type: 'number' },
    highPct: { type: 'number' },
    basis: { type: 'array', items: { type: 'string' } },
  },
  required: ['usable', 'reason', 'lowPct', 'highPct', 'basis'],
} as const;

const ResponseSchema = z.object({
  usable: z.boolean(),
  reason: z.string(),
  lowPct: z.number(),
  highPct: z.number(),
  basis: z.array(z.string()),
});

export type BodyFatPhotoResult =
  | { usable: true; lowPct: number; highPct: number; basis: string[] }
  | { usable: false; reason: string };

const UNREADABLE = 'Gemini replied in a form this app could not read. Try again.';

/**
 * Photos in underwear or swimwear can trip Gemini's own safety filter, which
 * answers with no text at all. Saying "could not read" would send people round
 * the same loop; what helps is knowing it refused and what to change.
 */
export const DECLINED_BY_FILTER = 'Gemini declined to read those photos. Try again in fitted sportswear, such as shorts and a sports top.';

/** True when Gemini blocked the prompt or stopped its reply on safety grounds. */
export const blockedBySafety = (payload: any): boolean =>
  Boolean(payload?.promptFeedback?.blockReason) ||
  ['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'IMAGE_SAFETY'].includes(payload?.candidates?.[0]?.finishReason);

/**
 * Checks the reply is a range that can describe a person, and nothing more.
 * The range itself is the model's reading and is shown as given; a reply that
 * is out of bounds or backwards is refused rather than repaired, because a
 * repaired range would be the app's figure presented as the model's.
 */
export const parseBodyFatReply = (text: string): BodyFatPhotoResult => {
  let raw: z.infer<typeof ResponseSchema>;
  try {
    raw = ResponseSchema.parse(JSON.parse(text));
  } catch {
    throw new Error(UNREADABLE);
  }
  if (!raw.usable) {
    return { usable: false, reason: raw.reason.trim() || 'Those photos could not be read. Try again in better light.' };
  }
  if (!(raw.lowPct >= 3 && raw.highPct <= 60 && raw.lowPct < raw.highPct)) throw new Error(UNREADABLE);
  return {
    usable: true,
    lowPct: raw.lowPct,
    highPct: raw.highPct,
    basis: raw.basis.map((line) => line.trim()).filter(Boolean),
  };
};

export const bodyFatRequestBody = (front: MealPhoto, side: MealPhoto, context: BodyContext): string => {
  const facts = [
    `Sex: ${context.sex}`,
    `Age: ${context.age}`,
    `Height: ${Math.round(context.heightCm)} cm`,
    ...(context.weightKg != null ? [`Weight: ${context.weightKg.toFixed(1)} kg`] : []),
  ].join('\n');
  return JSON.stringify({
    systemInstruction: { parts: [{ text: BODY_FAT_INSTRUCTION }] },
    contents: [
      {
        parts: [
          { text: 'Front view:' },
          { inlineData: { mimeType: front.mimeType, data: front.base64 } },
          { text: 'Side view:' },
          { inlineData: { mimeType: side.mimeType, data: side.base64 } },
          { text: facts },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
  });
};

/** Marks an error raised on purpose, so the transport catch passes it through. */
class BodyFatResponseError extends Error {}

export const estimateBodyFatFromPhotos = async (
  front: MealPhoto,
  side: MealPhoto,
  context: BodyContext,
  apiKey: string,
): Promise<BodyFatPhotoResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let payload: any;
  try {
    const { response, route, rejectedSession } = await fetchGemini(MODEL, apiKey, {
      signal: controller.signal,
      body: bodyFatRequestBody(front, side, context),
    });
    if (
      rejectedSession ||
      (route.viaProxy && response.status === 401 && response.headers.get('x-auth') === 'expired')
    ) {
      throw new BodyFatResponseError(SIGN_IN_AGAIN_MESSAGE);
    }
    if (isPersonalLimit(response, route)) throw new BodyFatResponseError(ALLOWANCE_USED_MESSAGE);
    if (!response.ok) throw new BodyFatResponseError(`The estimate service returned ${response.status}.`);
    payload = await response.json();
  } catch (error) {
    if (error instanceof BodyFatResponseError) throw error;
    if ((error as Error)?.name === 'AbortError') throw new Error('The estimate took too long. Try again.');
    throw new Error('Could not reach the estimate service. Check your connection.');
  } finally {
    clearTimeout(timer);
  }

  if (blockedBySafety(payload)) throw new Error(DECLINED_BY_FILTER);
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
    : '';
  return parseBodyFatReply(text);
};
