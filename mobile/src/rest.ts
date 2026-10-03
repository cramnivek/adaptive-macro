/**
 * The rest between sets.
 *
 * A lifting app spends more of its time counting rest than counting anything
 * else, and this one had no concept of it at all.
 */

/** What one tap of the adjuster is worth. */
export const REST_STEP_SECONDS = 15;

/**
 * Bounds on the stored default.
 *
 * Thirty seconds is about the floor for anything that counts as rest; ten
 * minutes is past the point where a timer is helping rather than nagging, and
 * someone resting longer than that is not watching a countdown for it.
 */
export const MIN_REST_SECONDS = 30;
export const MAX_REST_SECONDS = 600;

/** Nudges the rest length by whole steps, held inside the bounds. */
export const adjustRest = (seconds: number, steps: number): number => {
  const next = Math.round(seconds / REST_STEP_SECONDS) * REST_STEP_SECONDS + steps * REST_STEP_SECONDS;
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, next));
};

/**
 * Clock face for a countdown: "2:00", "0:45".
 *
 * Minutes are not padded and seconds always are, which is how a clock reads
 * and how anyone would say it out loud. Negative input is floored at zero —
 * the timer reaching zero is the end of the count, not the start of a debt.
 */
export const formatRest = (seconds: number): string => {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
};
