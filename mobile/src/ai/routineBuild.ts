import type { RoutineImport } from './routineImport';

/**
 * Building a routine for someone, rather than reading one they were given.
 *
 * Everything that makes a routine right for its lifter is decided here, not by
 * the model. The shape of each day is fixed — a push day is a horizontal press,
 * a vertical press, a second chest angle, side delts and triceps — and so is
 * its volume. Asked to "use fewer sets for a beginner", the model returned the
 * same six exercises at 18 sets for a beginner and 19 for an advanced lifter.
 * So the level sets how many exercises a day has and how many sets and reps
 * each gets, from the table below, and the model only chooses a movement for
 * each slot, which is the part it is good at.
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

export const TRAINING_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type TrainingLevel = (typeof TRAINING_LEVELS)[number];

export const LEVEL_LABEL: Record<TrainingLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/**
 * What a slot is for. The main lift is the day's heaviest compound; a compound
 * is the rest of the multi-joint work; an accessory is single-joint.
 */
export type SlotRole = 'main' | 'compound' | 'accessory';

/**
 * Who a slot is for. A beginner gets the core of the day and nothing else —
 * the few movements that do most of the work, done often and done well. Each
 * level above adds slots: more work, and more of it aimed at single muscles,
 * which is what a lifter who has outgrown the basics needs more of.
 */
type SlotTier = 'core' | 'standard' | 'extra';

interface Slot {
  text: string;
  role: SlotRole;
  tier: SlotTier;
}

/** Each day's slots, in the order the exercises are done: compounds first. */
const SLOTS: Record<RoutineFocus, Slot[]> = {
  push: [
    { text: 'a horizontal chest press', role: 'main', tier: 'core' },
    { text: 'a vertical overhead press', role: 'compound', tier: 'core' },
    { text: 'a second chest press at a different angle', role: 'compound', tier: 'standard' },
    { text: 'a side-delt raise', role: 'accessory', tier: 'core' },
    { text: 'a triceps exercise', role: 'accessory', tier: 'core' },
    { text: 'a chest fly', role: 'accessory', tier: 'extra' },
    { text: 'an overhead triceps extension', role: 'accessory', tier: 'extra' },
  ],
  pull: [
    { text: 'a vertical pull', role: 'main', tier: 'core' },
    { text: 'a horizontal row', role: 'compound', tier: 'core' },
    { text: 'a second row or pulldown, a different grip or angle', role: 'compound', tier: 'standard' },
    { text: 'a rear-delt exercise', role: 'accessory', tier: 'core' },
    { text: 'a biceps curl', role: 'accessory', tier: 'core' },
    { text: 'a second curl, hammer or incline', role: 'accessory', tier: 'extra' },
    { text: 'a straight-arm pulldown or pullover', role: 'accessory', tier: 'extra' },
  ],
  legs: [
    { text: 'a squat pattern', role: 'main', tier: 'core' },
    { text: 'a hip hinge', role: 'compound', tier: 'core' },
    { text: 'a single-leg exercise', role: 'compound', tier: 'standard' },
    { text: 'a hamstring curl', role: 'accessory', tier: 'core' },
    { text: 'a calf raise', role: 'accessory', tier: 'core' },
    { text: 'a quad isolation, such as a leg extension', role: 'accessory', tier: 'extra' },
  ],
  upper: [
    { text: 'a horizontal chest press', role: 'main', tier: 'core' },
    { text: 'a horizontal row', role: 'compound', tier: 'core' },
    { text: 'a vertical overhead press', role: 'compound', tier: 'core' },
    { text: 'a vertical pull', role: 'compound', tier: 'core' },
    { text: 'a triceps exercise', role: 'accessory', tier: 'standard' },
    { text: 'a biceps curl', role: 'accessory', tier: 'standard' },
    { text: 'a side-delt raise', role: 'accessory', tier: 'extra' },
  ],
  lower: [
    { text: 'a squat pattern', role: 'main', tier: 'core' },
    { text: 'a hip hinge', role: 'compound', tier: 'core' },
    { text: 'a single-leg exercise', role: 'compound', tier: 'standard' },
    { text: 'a hamstring curl', role: 'accessory', tier: 'core' },
    { text: 'a calf raise', role: 'accessory', tier: 'core' },
    { text: 'a quad isolation, such as a leg extension', role: 'accessory', tier: 'extra' },
  ],
  full: [
    { text: 'a squat or single-leg exercise', role: 'main', tier: 'core' },
    { text: 'a hip hinge', role: 'compound', tier: 'core' },
    { text: 'a press, horizontal or overhead', role: 'compound', tier: 'core' },
    { text: 'a row or pulldown', role: 'compound', tier: 'core' },
    { text: 'a core exercise', role: 'accessory', tier: 'standard' },
    { text: 'an arm or shoulder exercise', role: 'accessory', tier: 'extra' },
  ],
};

const TIERS_FOR: Record<TrainingLevel, SlotTier[]> = {
  beginner: ['core'],
  intermediate: ['core', 'standard'],
  advanced: ['core', 'standard', 'extra'],
};

/** The slots a lifter at this level gets for a day, in order. */
export const slotsFor = (focus: RoutineFocus, level: TrainingLevel): Slot[] =>
  SLOTS[focus].filter((slot) => TIERS_FOR[level].includes(slot.tier));

export interface Prescription {
  sets: number;
  reps: string;
}

/**
 * Sets and reps by level and role.
 *
 * A beginner grows on little volume and learns the movements in moderate
 * reps; heavy low-rep work waits until the technique holds under fatigue. An
 * intermediate needs more sets and some heavier work on the main lift. An
 * advanced lifter needs more again, a genuinely heavy main lift, and more
 * single-joint work — which the extra slots above provide.
 */
export const PRESCRIPTION: Record<TrainingLevel, Record<SlotRole, Prescription>> = {
  beginner: {
    main: { sets: 3, reps: '8-10' },
    compound: { sets: 3, reps: '8-12' },
    accessory: { sets: 2, reps: '10-15' },
  },
  intermediate: {
    main: { sets: 4, reps: '6-8' },
    compound: { sets: 3, reps: '8-10' },
    accessory: { sets: 3, reps: '10-15' },
  },
  advanced: {
    main: { sets: 4, reps: '4-6' },
    compound: { sets: 4, reps: '6-10' },
    accessory: { sets: 3, reps: '10-15' },
  },
};

/**
 * How hard each set should be, and how to progress. Shown with a built routine,
 * because a beginner's sets are not meant to be ground out like an advanced
 * lifter's, and nothing else on the screen says so.
 */
export const LEVEL_COACHING: Record<TrainingLevel, string> = {
  beginner:
    'Stop each set with 2 or 3 reps left in you (RPE 7–8). Use double progression: add repetitions first, then add the smallest weight step once every set reaches the top of its range.',
  intermediate:
    'Take sets within 1 to 2 reps of failure (RPE 8–9). Use double progression: push reps to the top of the range before advancing weight.',
  advanced:
    'Take most sets within 0 to 2 reps of failure (RPE 8–10), leaving 1 RIR on heavy compounds. Advance load when rep ceilings are met, and deload when recovery lags.',
};

/** What the level changes about which exercises suit, as told to the model. */
const LEVEL_TEXT: Record<TrainingLevel, string> = {
  beginner:
    'Level: beginner, new to lifting. Prefer stable movements that are hard to do badly — machines, ' +
    'dumbbells, goblet squats — over technical barbell lifts wherever the equipment allows.',
  intermediate: 'Level: intermediate, a year or more of consistent lifting. Standard gym movements.',
  advanced:
    'Level: advanced, several years of serious training. Favour free-weight compounds for the main lift ' +
    'where the equipment allows, and varied angles for the rest.',
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
      'harder with a harder variation — single-leg, slower, deficit — rather than with load.'
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

Fill every slot you are given with exactly one exercise, in the order given,
and give it exactly the sets and reps written on its slot. Give each exercise
its common gym name. Never list the same exercise twice in one routine. Set
notProgram to false.`;

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
      const slots = slotsFor(focus, options.level)
        .map((slot, index) => {
          const { sets, reps } = PRESCRIPTION[options.level][slot.role];
          return `  ${index + 1}. ${slot.text} — ${sets} sets of "${reps}"`;
        })
        .join('\n');
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
 * Puts the level's sets and reps back on whatever the model returned.
 *
 * The prompt states them, but the model is the wrong place to trust with
 * volume; this is what makes a beginner's day actually lighter. Only where
 * the routine came back with one exercise per slot — if the model merged or
 * dropped one, the slots no longer line up, and guessing which is which would
 * put a main lift's sets on a curl.
 */
export const applyPrescription = (
  parsed: RoutineImport,
  focuses: RoutineFocus[],
  level: TrainingLevel,
): RoutineImport => ({
  ...parsed,
  routines: parsed.routines.map((routine, index) => {
    const focus = focuses[index];
    if (focus === undefined) return routine;
    const slots = slotsFor(focus, level);
    if (routine.exercises.length !== slots.length) return routine;
    return {
      ...routine,
      exercises: routine.exercises.map((exercise, i) => ({ ...exercise, ...PRESCRIPTION[level][slots[i].role] })),
    };
  }),
});

/**
 * About how long a routine takes: two and a half minutes a working set, rest
 * included, rounded to five. Enough to tell a 35-minute day from a 70-minute
 * one, which is the question it answers.
 */
export const estimateMinutes = (totalSets: number): number => Math.max(5, Math.round((totalSets * 2.5) / 5) * 5);

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
