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
  /** A single bell, whether held in both hands or worked one arm at a time. */
  | 'single'
  /** One side at a time — split squats, lunges, alternating curls — so reps are per side. */
  | 'perSide';

const DUMBBELL = /\b(dumbbells?|db)\b/i;
// A single bell: held in both hands (goblet, pullover) or one arm at a time.
// "Dumbbell Row" and "Meadows Row" are one-arm movements by convention.
const SINGLE = /\b(goblet|pullover|concentration|single[- ]arm|one[- ]arm|meadows)\b|^dumbbell row$|^row \(dumbbell\)$/i;
const PER_SIDE = /\b(split squat|lunges?|step[- ]ups?|single[- ]leg|one[- ]leg|alternating|alternate)\b/i;

export const dumbbellLoad = (exerciseName: string, equipment?: string | null): DumbbellLoad | null => {
  const name = exerciseName.trim();
  if (!DUMBBELL.test(name) && !/goblet/i.test(name) && !/dumbbell/i.test(equipment ?? '')) return null;
  if (SINGLE.test(name)) return 'single';
  if (PER_SIDE.test(name)) return 'perSide';
  return 'pair';
};

/** Heading for the weight column: "LB EACH" makes clear a pair is not summed. */
export const weightColumnLabel = (unit: string, load: DumbbellLoad | null): string =>
  load === 'pair' || load === 'perSide' ? `${unit.toUpperCase()} EACH` : unit.toUpperCase();

export const repsColumnLabel = (load: DumbbellLoad | null): string => (load === 'perSide' ? 'REPS/SIDE' : 'REPS');

/** One line under the target, in words, for anyone who does not read column headings. */
export const dumbbellNote = (load: DumbbellLoad): string => {
  switch (load) {
    case 'pair':
      return 'Log one dumbbell’s weight, not both added together.';
    case 'single':
      return 'Log the weight of the one dumbbell you hold.';
    case 'perSide':
      return 'Log one dumbbell’s weight and the reps for one side.';
  }
};
