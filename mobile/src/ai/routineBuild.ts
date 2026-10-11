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

/** What someone can have to train with. Bodyweight needs nothing, so it is always there. */
export const EQUIPMENT_ITEMS = ['barbell', 'dumbbells', 'cables', 'machines', 'pullUpBar'] as const;
export type EquipmentItem = (typeof EQUIPMENT_ITEMS)[number];

export const EQUIPMENT_LABEL: Record<EquipmentItem, string> = {
  barbell: 'Barbell',
  dumbbells: 'Dumbbells',
  cables: 'Cables',
  machines: 'Machines',
  pullUpBar: 'Pull-up bar',
};

/** How each piece is described to the model, with what comes with it. */
const EQUIPMENT_TEXT: Record<EquipmentItem, string> = {
  barbell: 'a barbell with plates, a rack and a bench',
  dumbbells: 'dumbbells and an adjustable bench',
  cables: 'a cable station',
  machines: 'weight machines',
  pullUpBar: 'a pull-up bar',
};

export const TRAINING_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];

export const LEVEL_LABEL: Record<TrainingLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * What the level changes. Exercise choice as much as volume: a beginner gets
 * movements that are hard to do badly, because a programme abandoned after a
 * sore back in week two has no volume at all.
 */
const LEVEL_TEXT: Record<TrainingLevel, string> = {
  beginner:
    'Level: beginner, new to lifting. Prefer stable movements that are hard to do badly — machines, ' +
    'dumbbells, goblet squats — over technical barbell lifts wherever the equipment allows. 2 or 3 sets ' +
    'for every exercise, reps "8-12" or "10-15". This overrides the set and rep ranges above.',
  intermediate: 'Level: intermediate, a year or more of consistent lifting. Use the set and rep ranges above.',
  advanced:
    'Level: advanced, several years of serious training. Favour free-weight compounds where the equipment ' +
    'allows. The first compound of each routine gets 4 or 5 sets of "3-6" or "4-6"; other compounds 3 or 4 ' +
    'sets of "6-10"; everything else 3 sets. This overrides the set and rep ranges above.',
};

/**
 * What the model is told it has to work with, as what is missing as well as
 * what is there: "dumbbells" alone still gets a barbell squat back as the
 * obvious squat, and leaving a pull-up bar unmentioned got a pull-up.
 */
const equipmentText = (available: EquipmentItem[]): string => {
  const missing = EQUIPMENT_ITEMS.filter((item) => !available.includes(item));
  if (available.length === 0) {
    return (
      'Equipment: none beyond a sturdy bench or chair. Every exercise must be bodyweight. Make a slot ' +
      'harder with a harder variation — single-leg, slower, deficit — rather than with load, and let ' +
      'reps run up to 20 where the usual range would be too easy.'
    );
  }
  const have = available.map((item) => EQUIPMENT_TEXT[item]).join(', ');
  if (missing.length === 0) return `Equipment: ${have}. Bodyweight exercises are fine too.`;
  const lacking = missing.map((item) => EQUIPMENT_TEXT[item].replace(/^an? /, '')).join(', ');
  return (
    `Equipment: ${have}, and bodyweight. Not available: ${lacking} — never use an exercise that needs ` +
    `them. Where a slot would usually need one, use the closest movement with what is there, such as ` +
    `a pullover or a row for a vertical pull with no bar or cable.`
  );
};

/** True when nothing in the list adds load, so a routine is bodyweight all through. */
export const isBodyweightOnly = (available: EquipmentItem[]): boolean =>
  !available.some((item) => item !== 'pullUpBar');

/** How many of the user's own exercises to offer. Most-used first, so the cut loses the least. */
const KNOWN_LIMIT = 60;

export const ROUTINE_BUILD_SYSTEM = `You are a strength coach writing gym routines for one person.

Fill every slot you are given with exactly one exercise, in the order given.
Prescribe working sets only, unless the person's level says otherwise:
- compound slots: 3 or 4 sets, reps as a range such as "5-8" or "6-10"
- other slots: 2 or 3 sets, reps as a range such as "10-15"

Give each exercise its common gym name. Never list the same exercise twice in
one routine. Set notProgram to false.`;

export interface BuildOptions {
  equipment: EquipmentItem[];
  level: TrainingLevel;
}

export const DEFAULT_BUILD_OPTIONS: BuildOptions = { equipment: [...EQUIPMENT_ITEMS], level: 'intermediate' };

/** The request for one routine per focus, steered towards exercises the person already logs. */
export const buildRoutinePrompt = (
  focuses: RoutineFocus[],
  known: string[],
  options: BuildOptions = DEFAULT_BUILD_OPTIONS,
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
  return `Write ${count}.\n${equipmentText(options.equipment)}\n${LEVEL_TEXT[options.level]}\n\n${days}${preference}`;
};

/**
 * Words in an exercise name that say what it needs. Deliberately narrow: a
 * "Dumbbell Lying Leg Curl" is not a machine exercise just because most leg
 * curls are, and a false alarm teaches people to ignore the real ones.
 */
const NEEDS: [EquipmentItem, RegExp][] = [
  ['barbell', /\b(barbell|bb)\b/i],
  ['dumbbells', /\b(dumbbells?|db)\b/i],
  ['cables', /\b(cable|pulldown|pushdown)s?\b/i],
  ['machines', /\b(machine|smith|leg press|pec deck|hack squat)\b/i],
  ['pullUpBar', /\b(pull-?ups?|chin-?ups?|hanging)\b/i],
];

/**
 * What an exercise needs that the person said they do not have, read from its
 * name. The prompt asks the model to stay inside the equipment, and it mostly
 * does; this is how the review screen catches the time it does not.
 */
export const missingEquipment = (exerciseName: string, available: EquipmentItem[]): EquipmentItem[] =>
  NEEDS.filter(([item, pattern]) => !available.includes(item) && pattern.test(exerciseName)).map(([item]) => item);
