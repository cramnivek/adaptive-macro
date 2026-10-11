/**
 * Building a routine for someone, rather than reading one they were given.
 *
 * The shape of each day is decided here, not by the model: a push day is a
 * horizontal press, a vertical press, a second chest movement, side delts and
 * triceps, every time. Left to itself a model writes a plausible list that can
 * be three chest presses and no shoulders; given the slots, it only has to
 * choose a movement for each, which is the part it is good at.
 *
 * The answer comes back in the import's shape, so the same rules — merging,
 * clamping, matching names against the log — and the same review screen apply.
 */

export const ROUTINE_FOCUSES = ['push', 'pull', 'legs', 'upper', 'lower', 'full'] as const;
export type RoutineFocus = (typeof ROUTINE_FOCUSES)[number];

export const FOCUS_LABEL: Record<RoutineFocus, string> = {
  push: 'Push',
  pull: 'Pull',
  legs: 'Legs',
  upper: 'Upper',
  lower: 'Lower',
  full: 'Full body',
};

/** Each slot is one exercise, in the order it is done. Compounds come first. */
const SLOTS: Record<RoutineFocus, string[]> = {
  push: [
    'a horizontal chest press (compound)',
    'a vertical overhead press (compound)',
    'a second chest movement at a different angle',
    'a side-delt raise',
    'a triceps exercise',
  ],
  pull: [
    'a vertical pull (compound)',
    'a horizontal row (compound)',
    'a second row or pulldown variation',
    'a rear-delt exercise',
    'a biceps curl',
  ],
  legs: [
    'a squat pattern (compound)',
    'a hip hinge (compound)',
    'a single-leg exercise',
    'a hamstring curl',
    'a calf raise',
  ],
  upper: [
    'a horizontal chest press (compound)',
    'a horizontal row (compound)',
    'a vertical overhead press',
    'a vertical pull',
    'a triceps exercise',
    'a biceps curl',
  ],
  lower: [
    'a squat pattern (compound)',
    'a hip hinge (compound)',
    'a single-leg exercise',
    'a hamstring curl',
    'a calf raise',
  ],
  full: [
    'a squat or single-leg exercise (compound)',
    'a hip hinge (compound)',
    'a press, horizontal or overhead',
    'a row or pull-down',
    'a core exercise',
  ],
};

export const EQUIPMENT_OPTIONS = ['gym', 'dumbbells', 'bodyweight'] as const;
export type Equipment = (typeof EQUIPMENT_OPTIONS)[number];

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  gym: 'Full gym',
  dumbbells: 'Dumbbells',
  bodyweight: 'Bodyweight',
};

/**
 * What the model is told it has to work with. Spelled out as what is absent as
 * well as what is there, because "dumbbells" alone still gets a barbell squat
 * back as the obvious squat.
 */
const EQUIPMENT_TEXT: Record<Equipment, string> = {
  gym: 'Equipment: a full gym — barbells, dumbbells, cables and machines.',
  dumbbells:
    'Equipment: dumbbells and an adjustable bench, nothing else — no barbell, no cables, no machines, ' +
    'and no pull-up bar. Every exercise must be done with dumbbells or bodyweight on the floor or the ' +
    'bench; where a slot would need a bar to hang from, use the closest dumbbell movement, such as a ' +
    'pullover for a vertical pull.',
  bodyweight:
    'Equipment: none beyond a pull-up bar and a sturdy bench or chair. Every exercise must be bodyweight. ' +
    'Make a slot harder with a harder variation — single-leg, slower, deficit — rather than with load, ' +
    'and let reps run up to 20 where the usual range would be too easy.',
};

/** How many of the user's own exercises to offer. Most-used first, so the cut loses the least. */
const KNOWN_LIMIT = 60;

export const ROUTINE_BUILD_SYSTEM = `You are a strength coach writing gym routines for one person.

Fill every slot you are given with exactly one exercise, in the order given.
Prescribe working sets only:
- compound slots: 3 or 4 sets, reps as a range such as "5-8" or "6-10"
- other slots: 2 or 3 sets, reps as a range such as "10-15"

Give each exercise its common gym name. Never list the same exercise twice in
one routine. Set notProgram to false.`;

/** The request for one routine per focus, steered towards exercises the person already logs. */
export const buildRoutinePrompt = (
  focuses: RoutineFocus[],
  known: string[],
  equipment: Equipment = 'gym',
): string => {
  const days = focuses
    .map((focus) => {
      const slots = SLOTS[focus].map((slot, index) => `  ${index + 1}. ${slot}`).join('\n');
      return `Routine named exactly "${FOCUS_LABEL[focus]}":\n${slots}`;
    })
    .join('\n\n');

  const offered = known.slice(0, KNOWN_LIMIT);
  const preference =
    offered.length === 0
      ? ''
      : `\n\nThis person already logs these exercises, most used first. When one fits a slot ` +
        `and needs only the equipment above, use it, with its name written exactly as here, so ` +
        `their history carries on:\n` +
        offered.map((name) => `- ${name}`).join('\n');

  const count = focuses.length === 1 ? 'one routine' : `${focuses.length} routines`;
  return `Write ${count}.\n${EQUIPMENT_TEXT[equipment]}\n\n${days}${preference}`;
};
