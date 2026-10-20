/**
 * How a dumbbell exercise is loaded, so the set row can say what its weight means.
 *
 * "32" on a dumbbell press could be one bell or the pair, and both conventions
 * are in the wild — import from one app, log by habit from another, and the
 * history quietly mixes them. Stating the convention on the row is cheaper than
 * a migration and stops new sets adding to the confusion. The weight is always
 * one dumbbell's, which is what is printed on it and what you pick up.
 *
 * Classified from the name, falling back to the catalogue's equipment, because
 * that is all the session knows about an exercise. A name we cannot place is
 * treated as an ordinary pair, the most common case.
 */

export type DumbbellLoad =
  /** One in each hand, both working together: bench press, curls. */
  | 'pair'
  /** A single bell held in both hands: goblet squat, pullover. */
  | 'single'
  /**
   * One side at a time — single-arm rows, split squats, lunges, alternating
   * curls — so the weight and reps logged are one side's, and the other side
   * is assumed to match.
   */
  | 'perSide';

const DUMBBELL = /\b(dumbbells?|db)\b/i;
// One bell held in both hands.
const SINGLE = /\b(goblet|pullover)\b/i;
// One side, then the other. "Dumbbell Row" and "Meadows Row" are one-arm
// movements by convention, so they count here even without saying so.
const PER_SIDE =
  /\b(split squat|lunges?|step[- ]ups?|single[- ]leg|one[- ]leg|single[- ]arm|one[- ]arm|alternating|alternate|concentration|meadows)\b|^dumbbell row$|^row \(dumbbell\)$/i;

export const dumbbellLoad = (exerciseName: string, equipment?: string | null): DumbbellLoad | null => {
  const name = exerciseName.trim();
  if (!DUMBBELL.test(name) && !/goblet/i.test(name) && !/dumbbell/i.test(equipment ?? '')) return null;
  if (SINGLE.test(name)) return 'single';
  if (PER_SIDE.test(name)) return 'perSide';
  return 'pair';
};

/**
 * The other side of what was typed, worked out, so nobody has to do the sum
 * in their head between sets: a pair's total, or both sides of a one-sided
 * movement. Null when there is nothing to add — no weight yet, or a single
 * bell, where the number typed is already the whole load.
 */
export const dumbbellBreakdown = (
  load: DumbbellLoad | null,
  weight: string,
  reps: string,
  unit: string,
): string | null => {
  // In whatever unit the session is in; nothing here converts.
  const each = Number.parseFloat(weight.replace(',', '.'));
  if (load === null || load === 'single' || !Number.isFinite(each) || each <= 0) return null;
  const shown = (n: number) => String(Math.round(n * 10) / 10);
  if (load === 'pair') return `= ${shown(each * 2)} ${unit.toLowerCase()} total, both dumbbells`;
  const r = Number.parseInt(reps, 10);
  const side = Number.isFinite(r) && r > 0 ? `${shown(each)} × ${r}` : shown(each);
  // Spelled out: a bare L and R read as abbreviations to decode, mid-set.
  return `Left ${side} · Right ${side}`;
};

/** Heading for the weight column: "LB EACH" makes clear a pair is not summed. */
export const weightColumnLabel = (unit: string, load: DumbbellLoad | null): string =>
  load === 'pair' || load === 'perSide' ? `${unit.toUpperCase()} EACH` : unit.toUpperCase();


/** One line under the target, in words, for anyone who does not read column headings. */
export const dumbbellNote = (load: DumbbellLoad): string => {
  switch (load) {
    case 'pair':
      return 'Log one dumbbell’s weight, not both added together.';
    case 'single':
      return 'Log the weight of the one dumbbell you hold.';
    case 'perSide':
      return 'Log one side. The other side is assumed to match.';
  }
};
