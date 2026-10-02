/**
 * Rate of perceived exertion.
 *
 * The column has existed in `sets` since the schema was written and the Hevy
 * import has always parsed it, so a history imported from Hevy may already
 * carry these numbers — nothing has ever displayed them.
 *
 * The scale runs 6 to 10 in halves, which is what Hevy records and what the
 * strength-training literature uses. Below 6 the rating stops meaning
 * anything useful: nobody can tell a 3 from a 4, and a set that easy is a
 * warm-up, which this app already records as its own set type.
 */
export const RPE_SCALE = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export type Rpe = (typeof RPE_SCALE)[number];

/**
 * What each rating claims, in reps left in the tank.
 *
 * Shown beside the number when choosing, because "8" is meaningless until you
 * know it means two more were available, and a scale nobody can interpret gets
 * filled in at random — which is worse than leaving it empty.
 */
const REPS_IN_RESERVE: Record<string, string> = {
  '6': '4+ reps left',
  '6.5': '3–4 reps left',
  '7': '3 reps left',
  '7.5': '2–3 reps left',
  '8': '2 reps left',
  '8.5': '1–2 reps left',
  '9': '1 rep left',
  '9.5': '0–1 reps left',
  '10': 'nothing left',
};

/**
 * Renders a rating the way it is spoken: "8", not "8.0"; "8.5", not "8.50".
 *
 * Null is an em dash rather than an empty string, so an unrated set reads as
 * deliberately blank instead of looking like a rendering failure.
 */
export const formatRpe = (rpe: number | null): string =>
  rpe === null ? '—' : Number.isInteger(rpe) ? String(rpe) : rpe.toFixed(1);

/** The reps-in-reserve gloss, or null for a value off the scale. */
export const rpeMeaning = (rpe: number): string | null =>
  REPS_IN_RESERVE[formatRpe(rpe)] ?? null;
