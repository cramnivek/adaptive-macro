/**
 * A figure doing one rep of an exercise — this exercise, not its family.
 *
 * The first version drew one figure per movement pattern, and in use most of
 * them were wrong: a skullcrusher played a standing curl, a shoulder press a
 * bench press, a cable rear-delt fly a curl. A figure of the wrong movement is
 * worse than none, because it is shown as how to do the right one. So each
 * motion here is recognised from the exercise's name, and a name nothing
 * matches gets no figure at all.
 *
 * Side-on motions are posed as joint angles, not positions, so no bone
 * stretches mid-rep. Whatever does not move in the real exercise is pinned —
 * feet on the floor, hands on a bar — and the limbs between are solved each
 * frame. Movements out to the side, where a side view shows nothing, are drawn
 * from the front.
 *
 * Coordinates are a 100x100 box, y down, a side-on figure facing right. Angles
 * are degrees, 0 pointing right and 90 up, each limb measured from the joint
 * nearer the hip. Angles past 360 or below 0 are deliberate: they set which
 * way a joint turns between the two ends of the rep.
 */

type Point = [number, number];

export const FLOOR_Y = 90;

/**
 * Proportions of a real body: shoulder to grip is about 1.3 times shoulder to
 * hip, so a hanging hand reaches the upper thigh.
 */
export const LENGTH = { torso: 27, thigh: 22, shin: 21, upperArm: 18, forearm: 17, neck: 4, head: 5.5 };

export interface Pose {
  torso: number;
  upperArm: number;
  forearm: number;
  frontThigh: number;
  frontShin: number;
  backThigh: number;
  backShin: number;
}

export type Load = 'plate' | 'dumbbell' | 'handle' | 'pad' | 'none';

type Prop =
  | { kind: 'bench' }
  | { kind: 'pad' }
  | { kind: 'seat'; back?: boolean }
  | { kind: 'bar' }
  | { kind: 'dipBars' }
  | { kind: 'cable'; from: Point }
  | { kind: 'footplate'; x: number }
  | { kind: 'toes' };

interface SideMotion {
  view: 'side';
  /** The two ends of the rep, in the order it starts. */
  from: Pose;
  to: Pose;
  /** The point that does not move, or a path for the hip when the body travels. */
  anchor: { joint: 'frontAnkle' | 'hip'; at: Point; to?: Point };
  /** Both feet planted, legs solved between them and the hip. */
  feet?: { front: Point; back: Point };
  /** Hands planted, the elbow solved, bending whichever way the exercise bends it. */
  hand?: { at: Point; elbow: 'up' | 'back' | 'forward' };
  /** For a body too tall for the box when it hangs at full length. */
  scale?: number;
  load: Load;
  loadAt?: 'hand' | 'ankle';
  props: Prop[];
  /** Held rather than repeated, like a plank. */
  still?: boolean;
}

interface FrontMotion {
  view: 'front';
  /** Arms raised out to the side, degrees from hanging down. */
  raise?: { from: number; to: number };
  /** Arms at shoulder height, degrees from pointing at the viewer to straight out. */
  open?: { from: number; to: number };
  load: Load;
  cables?: boolean;
}

export type Motion = SideMotion | FrontMotion;

const standing: Pose = {
  torso: 90,
  upperArm: 270,
  forearm: 270,
  frontThigh: 270,
  frontShin: 270,
  backThigh: 270,
  backShin: 270,
};

/** Arms hang a few degrees forward, as they do: dead vertical parks the hand on the hip. */
const hanging = { upperArm: 274, forearm: 280 };

/** Both legs the same, for the many exercises where they are. */
const legs = (thigh: number, shin: number) => ({ frontThigh: thigh, frontShin: shin, backThigh: thigh, backShin: shin });

/** Lying flat on a bench, feet on the floor, as for every bench exercise. */
const onBench = { torso: 0, ...legs(196, 270) };
const BENCH_HIP: Point = [44, 62.9];

/** Seated, thighs level, feet on the floor. */
const seated = (torso: number) => ({ torso, ...legs(0, 270) });

/** A straight body from the feet: push-up and plank. */
const plank = (angle: number): Pose => ({ torso: angle, upperArm: 270, forearm: 270, ...legs(180 + angle, 180 + angle) });

const BAR_Y = 4;

export const MOTIONS = {
  'bench-press': {
    view: 'side',
    from: { ...onBench, upperArm: 238, forearm: 82 },
    to: { ...onBench, upperArm: 90, forearm: 90 },
    anchor: { joint: 'hip', at: BENCH_HIP },
    load: 'plate',
    props: [{ kind: 'bench' }],
  },
  'incline-press': {
    view: 'side',
    // Lying back on the incline, head away from the feet, pressing straight up.
    from: { ...seated(145), upperArm: 300, forearm: 86 },
    // The forearm stays pointing up the whole way: 90, not 450, which swung it down through 268.
    to: { ...seated(145), upperArm: 450, forearm: 90 },
    anchor: { joint: 'hip', at: [62, 69] },
    load: 'plate',
    props: [{ kind: 'seat' }, { kind: 'pad' }],
  },
  'overhead-press': {
    view: 'side',
    // The elbow rises forward, through 360, not back over the shoulder.
    from: { ...standing, upperArm: 300, forearm: 96 },
    to: { ...standing, upperArm: 452, forearm: 92 },
    anchor: { joint: 'frontAnkle', at: [48, FLOOR_Y] },
    // Arms overhead make a standing body taller than the box.
    scale: 0.8,
    load: 'plate',
    props: [],
  },
  'push-up': {
    view: 'side',
    // 29 at the top keeps the planted hand within an arm's length of the shoulder.
    from: plank(29),
    to: plank(8),
    anchor: { joint: 'frontAnkle', at: [12, FLOOR_Y] },
    // Under the shoulders at the bottom, so slightly ahead of them at the top.
    hand: { at: [79, FLOOR_Y], elbow: 'back' },
    load: 'none',
    props: [],
  },
  dip: {
    view: 'side',
    from: { ...standing, torso: 82, ...legs(262, 205) },
    to: { ...standing, torso: 82, ...legs(262, 205) },
    anchor: { joint: 'hip', at: [48, 45], to: [49, 58] },
    hand: { at: [52, 53], elbow: 'back' },
    load: 'none',
    props: [{ kind: 'dipBars' }],
  },
  'pull-up': {
    view: 'side',
    from: { ...standing, torso: 92, ...legs(330, 200) },
    to: { ...standing, torso: 92, ...legs(330, 200) },
    // Dead hang with the arms just inside full reach.
    anchor: { joint: 'hip', at: [50, 65.5], to: [52, 45] },
    hand: { at: [52, BAR_Y], elbow: 'forward' },
    load: 'none',
    props: [{ kind: 'bar' }],
  },
  pulldown: {
    view: 'side',
    from: { ...seated(100), upperArm: 98, forearm: 98 },
    to: { ...seated(100), upperArm: 262, forearm: 82 },
    anchor: { joint: 'hip', at: [40, 69] },
    load: 'handle',
    props: [{ kind: 'seat' }, { kind: 'cable', from: [34, 0] }],
  },
  'straight-arm-pulldown': {
    view: 'side',
    from: { ...standing, torso: 74, upperArm: 32, forearm: 32, ...legs(281, 264) },
    to: { ...standing, torso: 74, upperArm: -78, forearm: -78, ...legs(281, 264) },
    anchor: { joint: 'frontAnkle', at: [40, FLOOR_Y] },
    load: 'handle',
    props: [{ kind: 'cable', from: [86, 2] }],
  },
  'seated-row': {
    view: 'side',
    // Elbows travel down and back, through 295, not up over the head.
    from: { torso: 92, upperArm: 362, forearm: 362, ...legs(8, 352) },
    // The forearm stays pointing forward: 360, not 0, which turned it backwards.
    to: { torso: 92, upperArm: 228, forearm: 360, ...legs(8, 352) },
    anchor: { joint: 'hip', at: [26, 74] },
    load: 'handle',
    props: [{ kind: 'seat' }, { kind: 'footplate', x: 72 }, { kind: 'cable', from: [96, 74] }],
  },
  'bent-row': {
    view: 'side',
    from: { ...standing, torso: 28, ...legs(283, 266) },
    to: { ...standing, torso: 28, upperArm: 192, forearm: 268, ...legs(283, 266) },
    anchor: { joint: 'frontAnkle', at: [56, FLOOR_Y] },
    load: 'plate',
    props: [],
  },
  'chest-supported-row': {
    view: 'side',
    from: { ...standing, torso: 40, ...legs(283, 266) },
    to: { ...standing, torso: 40, upperArm: 196, forearm: 268, ...legs(283, 266) },
    anchor: { joint: 'frontAnkle', at: [44, FLOOR_Y] },
    load: 'dumbbell',
    props: [{ kind: 'pad' }],
  },
  pullover: {
    view: 'side',
    // Past the head and over the face to above the chest, turning up through 37.
    from: { ...onBench, upperArm: 338, forearm: 338 },
    to: { ...onBench, upperArm: 450, forearm: 450 },
    // Further back along the bench, so the reach past the head stays in frame.
    anchor: { joint: 'hip', at: [34, 62.9] },
    load: 'dumbbell',
    props: [{ kind: 'bench' }],
  },
  skullcrusher: {
    view: 'side',
    from: { ...onBench, upperArm: 80, forearm: 80 },
    to: { ...onBench, upperArm: 80, forearm: 12 },
    anchor: { joint: 'hip', at: BENCH_HIP },
    load: 'dumbbell',
    props: [{ kind: 'bench' }],
  },
  pushdown: {
    view: 'side',
    // Down through the front of the body, -88 rather than 272 the long way round.
    from: { ...standing, torso: 84, upperArm: 268, forearm: 38 },
    to: { ...standing, torso: 84, upperArm: 268, forearm: -88 },
    anchor: { joint: 'frontAnkle', at: [44, FLOOR_Y] },
    load: 'handle',
    props: [{ kind: 'cable', from: [62, 2] }],
  },
  'overhead-extension': {
    view: 'side',
    from: { ...standing, upperArm: 100, forearm: 258 },
    to: { ...standing, upperArm: 100, forearm: 100 },
    anchor: { joint: 'frontAnkle', at: [52, FLOOR_Y] },
    scale: 0.8,
    load: 'dumbbell',
    props: [],
  },
  curl: {
    view: 'side',
    // 460, not 100: up in front of the body, through 360, not out behind it.
    from: standing,
    to: { ...standing, forearm: 460 },
    anchor: { joint: 'frontAnkle', at: [50, FLOOR_Y] },
    load: 'dumbbell',
    props: [],
  },
  'incline-curl': {
    view: 'side',
    from: { ...seated(125), upperArm: 270, forearm: 270 },
    to: { ...seated(125), upperArm: 270, forearm: 460 },
    anchor: { joint: 'hip', at: [52, 69] },
    load: 'dumbbell',
    props: [{ kind: 'seat' }, { kind: 'pad' }],
  },
  'front-raise': {
    view: 'side',
    from: { ...standing, ...hanging },
    to: { ...standing, upperArm: 360, forearm: 360 },
    anchor: { joint: 'frontAnkle', at: [44, FLOOR_Y] },
    load: 'dumbbell',
    props: [],
  },
  squat: {
    view: 'side',
    from: { ...standing, upperArm: 235, forearm: 100 },
    to: { torso: 62, upperArm: 207, forearm: 72, ...legs(352, 246) },
    anchor: { joint: 'frontAnkle', at: [50, FLOOR_Y] },
    load: 'plate',
    props: [],
  },
  'goblet-squat': {
    view: 'side',
    // The weight held at the chest, so the arms turn with the trunk.
    from: { ...standing, upperArm: 292, forearm: 82 },
    to: { torso: 66, upperArm: 268, forearm: 58, ...legs(352, 246) },
    anchor: { joint: 'frontAnkle', at: [48, FLOOR_Y] },
    load: 'dumbbell',
    props: [],
  },
  lunge: {
    view: 'side',
    from: { ...standing, ...hanging },
    to: { ...standing, ...hanging },
    anchor: { joint: 'hip', at: [38, 57], to: [42, 69] },
    feet: { front: [64, FLOOR_Y], back: [12, FLOOR_Y] },
    load: 'dumbbell',
    props: [],
  },
  rdl: {
    view: 'side',
    from: standing,
    to: { ...standing, torso: 18, ...legs(291, 263) },
    anchor: { joint: 'frontAnkle', at: [48, FLOOR_Y] },
    load: 'plate',
    props: [],
  },
  deadlift: {
    view: 'side',
    // From the floor: hips lower and knees bent at the start, unlike the RDL.
    from: { ...standing, torso: 32, upperArm: 272, forearm: 272 },
    to: { ...standing, upperArm: 272, forearm: 272 },
    // Hips back far enough that the shoulders sit over the bar, and the bar over the feet.
    anchor: { joint: 'hip', at: [30, 63], to: [46, 47] },
    feet: { front: [48, FLOOR_Y], back: [48, FLOOR_Y] },
    load: 'plate',
    props: [],
  },
  'calf-raise': {
    view: 'side',
    from: { ...standing, ...hanging },
    to: { ...standing, ...hanging },
    anchor: { joint: 'frontAnkle', at: [48, FLOOR_Y - 1], to: [48, FLOOR_Y - 6] },
    load: 'dumbbell',
    props: [{ kind: 'toes' }],
  },
  'leg-extension': {
    view: 'side',
    from: { ...seated(100), upperArm: 275, forearm: 280 },
    to: { torso: 100, upperArm: 275, forearm: 280, ...legs(0, 362) },
    anchor: { joint: 'hip', at: [36, 69] },
    load: 'pad',
    loadAt: 'ankle',
    props: [{ kind: 'seat', back: true }],
  },
  'leg-curl': {
    view: 'side',
    // Face down: the shin curls up toward the glutes, through 137.
    // Arms reach forward along the bench to its handles, not down through it.
    from: { torso: 0, upperArm: 345, forearm: 355, ...legs(180, 180) },
    to: { torso: 0, upperArm: 345, forearm: 355, ...legs(180, 92) },
    anchor: { joint: 'hip', at: [46, 63.5] },
    // Lying flat with the arms past the head is wider than the box at full size.
    scale: 0.85,
    load: 'pad',
    loadAt: 'ankle',
    props: [{ kind: 'bench' }],
  },
  'hanging-leg-raise': {
    view: 'side',
    from: { ...standing, torso: 90, ...legs(270, 270) },
    to: { ...standing, torso: 90, ...legs(358, 358) },
    anchor: { joint: 'hip', at: [50, 54.3] },
    hand: { at: [50, BAR_Y], elbow: 'forward' },
    scale: 0.82,
    load: 'none',
    props: [{ kind: 'bar' }],
  },
  'hanging-knee-raise': {
    view: 'side',
    from: { ...standing, torso: 90, ...legs(270, 270) },
    to: { ...standing, torso: 90, ...legs(375, 270) },
    anchor: { joint: 'hip', at: [50, 54.3] },
    hand: { at: [50, BAR_Y], elbow: 'forward' },
    scale: 0.82,
    load: 'none',
    props: [{ kind: 'bar' }],
  },
  crunch: {
    view: 'side',
    from: { torso: 180, upperArm: 0, forearm: 0, ...legs(50, 295) },
    to: { torso: 148, upperArm: 20, forearm: 20, ...legs(50, 295) },
    anchor: { joint: 'hip', at: [56, 87] },
    load: 'none',
    props: [],
  },
  plank: {
    view: 'side',
    from: { ...plank(15), upperArm: 270, forearm: 0 },
    to: { ...plank(15), upperArm: 270, forearm: 0 },
    anchor: { joint: 'frontAnkle', at: [10, FLOOR_Y] },
    load: 'none',
    props: [],
    still: true,
  },
  carry: {
    view: 'side',
    from: { ...standing, ...hanging, frontThigh: 287, frontShin: 270, backThigh: 253, backShin: 262 },
    to: { ...standing, ...hanging, frontThigh: 253, frontShin: 262, backThigh: 287, backShin: 270 },
    anchor: { joint: 'hip', at: [50, 47] },
    load: 'dumbbell',
    props: [],
  },
  'lateral-raise': { view: 'front', raise: { from: 10, to: 84 }, load: 'dumbbell' },
  'reverse-fly': { view: 'front', open: { from: 14, to: 88 }, load: 'handle', cables: true },
  'chest-fly': { view: 'front', open: { from: 88, to: 14 }, load: 'handle', cables: true },
} satisfies Record<string, Motion>;

export type MotionId = keyof typeof MOTIONS;

// --- recognising the exercise ------------------------------------------------

/**
 * Exercises that look like a known motion by name but move differently enough
 * that its figure would mislead. Checked first, so "decline bench press" is
 * not a flat press and a seated leg curl is not a lying one.
 */
const NOT_DRAWN =
  /\b(decline|hip thrust|glute bridge|good ?morning|shrugs?|upright row|face pull|step-?ups?|leg press|hack squat|nordic|seated leg curl|preacher|concentration|wrist|neck|jumps?|box|sled|battle|sprint|ergometer|rowing machine|lying leg raise)\b/;

const RULES: [RegExp, MotionId | ((name: string) => MotionId | null)][] = [
  [/\b(pull|chin)[- ]?ups?\b/, 'pull-up'],
  [/\bknee raise/, 'hanging-knee-raise'],
  [/\bleg raise/, 'hanging-leg-raise'],
  [/\bstraight[- ]arm/, 'straight-arm-pulldown'],
  [/\bpull[- ]?downs?\b/, 'pulldown'],
  [/\bpullovers?\b/, 'pullover'],
  // Standing, at a cable or a machine; bent-over and incline versions move
  // the same arms through a different body, and are left undrawn.
  [/\b(reverse fly|reverse flye|rear delt (fly|flye|raise)|reverse pec deck)/, (n) => (/\b(cable|machine|pec deck|standing)\b/.test(n) ? 'reverse-fly' : null)],
  [/\b(fly|flye|flyes|pec deck|crossover)\b/, (n) => (/\b(cable|machine|pec deck|crossover|standing)\b/.test(n) ? 'chest-fly' : null)],
  [/\b(lateral|side|lat) raises?\b/, 'lateral-raise'],
  [/\bfront raises?\b/, 'front-raise'],
  [/\b(skull ?crushers?|lying (triceps?|tricep) extensions?|french press)\b/, 'skullcrusher'],
  [/\b(push|press)[- ]?downs?\b/, 'pushdown'],
  [/\b(triceps?|tricep)\b.*\bextensions?\b|\boverhead extensions?\b/, 'overhead-extension'],
  [/\b(leg|hamstring) curls?\b/, 'leg-curl'],
  [/\bleg extensions?\b/, 'leg-extension'],
  [/\bcurls?\b/, (n) => (/\bincline\b/.test(n) ? 'incline-curl' : 'curl')],
  [/\bincline\b.*\b(press|bench)\b|\b(press|bench)\b.*\bincline\b/, 'incline-press'],
  [/\b(bench press|floor press)\b/, 'bench-press'],
  [/\b(overhead|shoulder|military|arnold|push) press\b|\bohp\b/, 'overhead-press'],
  [/\bpush[- ]?ups?\b/, 'push-up'],
  [/\bdips?\b/, 'dip'],
  [/\bchest[- ]supported\b.*\brows?\b/, 'chest-supported-row'],
  [/\bseated\b.*\brows?\b|\bcable rows?\b|\brows?\b.*\b(seated|cable)\b|\bmachine rows?\b/, 'seated-row'],
  [/\brows?\b/, 'bent-row'],
  [/\b(romanian|rdl|stiff[- ]legg?ed)\b/, 'rdl'],
  [/\bdeadlifts?\b/, 'deadlift'],
  [/\b(split squats?|lunges?|bulgarian)\b/, 'lunge'],
  [/\b(goblet|front squats?|dumbbell squats?)\b/, 'goblet-squat'],
  [/\bsquats?\b/, 'squat'],
  [/\bcalf raises?\b/, 'calf-raise'],
  [/\b(crunch(es)?|sit[- ]?ups?)\b/, 'crunch'],
  [/\bplanks?\b/, 'plank'],
  [/\b(farmers?|carry|carries|suitcase)\b/, 'carry'],
];

/** The motion an exercise is, from its name; null when there is none to draw honestly. */
export const motionFor = (exerciseName: string): MotionId | null => {
  const name = exerciseName.toLowerCase();
  if (NOT_DRAWN.test(name)) return null;
  for (const [pattern, motion] of RULES) {
    if (pattern.test(name)) return typeof motion === 'function' ? motion(name) : motion;
  }
  return null;
};

/**
 * What the figure holds, from the exercise's name or catalogued equipment,
 * falling back to what the motion is usually done with.
 */
export const loadFor = (motion: MotionId, exerciseName: string, equipment = ''): Load => {
  const drawn = MOTIONS[motion].load;
  if (drawn === 'none' || drawn === 'pad') return drawn;
  const text = `${exerciseName} ${equipment}`.toLowerCase();
  if (/\b(dumbbells?|db|goblet|kettlebells?)\b/.test(text)) return 'dumbbell';
  if (/\b(cables?|machine|pull[- ]?down|push[- ]?down|bands?)\b/.test(text)) return 'handle';
  if (/\b(barbell|bb|ez|smith)\b/.test(text)) return 'plate';
  return drawn;
};

// --- placing the joints ------------------------------------------------------

export interface Joints {
  head: Point;
  shoulder: Point;
  elbow: Point;
  hand: Point;
  hip: Point;
  frontKnee: Point;
  frontAnkle: Point;
  backKnee: Point;
  backAnkle: Point;
}

type Lengths = typeof LENGTH;

const step = ([x, y]: Point, length: number, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  return [x + length * Math.cos(radians), y - length * Math.sin(radians)];
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpPoint = (a: Point, b: Point, k: number): Point => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

/**
 * The middle joint of a two-bone limb whose ends are fixed: inverse kinematics.
 * Of the two places the joint could be, `pick` chooses the one the body uses.
 */
export const middleJoint = (
  root: Point,
  end: Point,
  first: number,
  second: number,
  pick: (a: Point, b: Point) => Point,
): Point => {
  const dx = end[0] - root[0];
  const dy = end[1] - root[1];
  // Out of reach is a straight limb pointed at the end, not a NaN.
  const d = Math.max(1e-6, Math.min(Math.hypot(dx, dy), first + second - 1e-6));
  const toEnd = Math.atan2(dy, dx);
  const bend = Math.acos(Math.max(-1, Math.min(1, (first ** 2 + d ** 2 - second ** 2) / (2 * first * d))));
  const at = (angle: number): Point => [root[0] + first * Math.cos(angle), root[1] + first * Math.sin(angle)];
  return pick(at(toEnd - bend), at(toEnd + bend));
};

const forwardOf = (a: Point, b: Point) => (a[0] > b[0] ? a : b);
const backOf = (a: Point, b: Point) => (a[0] < b[0] ? a : b);
const upOf = (a: Point, b: Point) => (a[1] < b[1] ? a : b);
const downOf = (a: Point, b: Point) => (a[1] > b[1] ? a : b);

const mixPose = (a: Pose, b: Pose, k: number): Pose => ({
  torso: lerp(a.torso, b.torso, k),
  upperArm: lerp(a.upperArm, b.upperArm, k),
  forearm: lerp(a.forearm, b.forearm, k),
  frontThigh: lerp(a.frontThigh, b.frontThigh, k),
  frontShin: lerp(a.frontShin, b.frontShin, k),
  backThigh: lerp(a.backThigh, b.backThigh, k),
  backShin: lerp(a.backShin, b.backShin, k),
});

export const lengthsFor = (motion: SideMotion): Lengths => {
  const s = motion.scale ?? 1;
  return {
    torso: LENGTH.torso * s,
    thigh: LENGTH.thigh * s,
    shin: LENGTH.shin * s,
    upperArm: LENGTH.upperArm * s,
    forearm: LENGTH.forearm * s,
    neck: LENGTH.neck * s,
    head: LENGTH.head * s,
  };
};

/** Where every joint of a side-on figure is at a point in the rep. */
export const sideJointsAt = (motion: SideMotion, progress: number): Joints => {
  const k = motion.still ? 0 : progress;
  const pose = mixPose(motion.from, motion.to, k);
  const L = lengthsFor(motion);

  const origin: Point = [0, 0];
  let frontKnee = step(origin, L.thigh, pose.frontThigh);
  let frontAnkle = step(frontKnee, L.shin, pose.frontShin);
  let backKnee = step(origin, L.thigh, pose.backThigh);
  let backAnkle = step(backKnee, L.shin, pose.backShin);

  const anchorAt = motion.anchor.to ? lerpPoint(motion.anchor.at, motion.anchor.to, k) : motion.anchor.at;
  const pinned = motion.anchor.joint === 'hip' ? origin : frontAnkle;
  const dx = anchorAt[0] - pinned[0];
  const dy = anchorAt[1] - pinned[1];
  const move = ([x, y]: Point): Point => [x + dx, y + dy];

  const hip = move(origin);
  const shoulder = step(hip, L.torso, pose.torso);
  const head = step(shoulder, L.neck + L.head, pose.torso);

  if (motion.feet) {
    frontAnkle = motion.feet.front;
    backAnkle = motion.feet.back;
    frontKnee = middleJoint(hip, frontAnkle, L.thigh, L.shin, forwardOf);
    // Feet together bend both knees forward; a split stance drops the back one.
    const together = frontAnkle[0] === backAnkle[0] && frontAnkle[1] === backAnkle[1];
    backKnee = middleJoint(hip, backAnkle, L.thigh, L.shin, together ? forwardOf : downOf);
  } else {
    frontKnee = move(frontKnee);
    frontAnkle = move(frontAnkle);
    backKnee = move(backKnee);
    backAnkle = move(backAnkle);
  }

  let elbow: Point;
  let hand: Point;
  if (motion.hand) {
    hand = motion.hand.at;
    const pick = motion.hand.elbow === 'up' ? upOf : motion.hand.elbow === 'back' ? backOf : forwardOf;
    elbow = middleJoint(shoulder, hand, L.upperArm, L.forearm, pick);
  } else {
    elbow = step(shoulder, L.upperArm, pose.upperArm);
    hand = step(elbow, L.forearm, pose.forearm);
  }

  return { head, shoulder, elbow, hand, hip, frontKnee, frontAnkle, backKnee, backAnkle };
};

// --- one rep in time ---------------------------------------------------------

/** One rep, in milliseconds: down, a beat at the bottom, up, a beat at the top. */
export const REP_MS = 2600;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * How far through the rep a moment is, 0 at the start pose and 1 at the end.
 * Eased both ways and held at each end: a rep at constant speed that turns
 * around instantly reads as a machine, not a person.
 */
export const repProgress = (elapsedMs: number): number => {
  const t = (((elapsedMs % REP_MS) + REP_MS) % REP_MS) / REP_MS;
  if (t < 0.38) return easeInOut(t / 0.38);
  if (t < 0.5) return 1;
  if (t < 0.88) return 1 - easeInOut((t - 0.5) / 0.38);
  return 0;
};

// --- what to draw ------------------------------------------------------------

/** Which colour a mark takes: the figure, its far limbs, the room, or the load. */
export type Tone = 'body' | 'far' | 'ground' | 'accent';

export type Mark =
  | { kind: 'path'; points: Point[]; width: number; tone: Tone }
  | { kind: 'circle'; at: Point; r: number; tone: Tone; ring?: boolean };

const perpendicularBelow = (from: Point, to: Point, distance: number): Point => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  // Of the two perpendiculars, the one that points down the screen.
  let nx = -dy / length;
  let ny = dx / length;
  if (ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return [nx * distance, ny * distance];
};

const loadMarks = (load: Load, at: Point, scale = 1): Mark[] => {
  if (load === 'plate') return [
    { kind: 'circle', at, r: 7 * scale, tone: 'accent', ring: true },
    { kind: 'circle', at, r: 1.8 * scale, tone: 'accent' },
  ];
  if (load === 'dumbbell') return [{ kind: 'circle', at, r: 4 * scale, tone: 'accent' }];
  if (load === 'handle') return [{ kind: 'path', points: [[at[0] - 4, at[1]], [at[0] + 4, at[1]]], width: 3.5, tone: 'accent' }];
  if (load === 'pad') return [{ kind: 'circle', at, r: 3.5 * scale, tone: 'accent', ring: true }];
  return [];
};

const sideMarks = (motion: SideMotion, j: Joints, load: Load): Mark[] => {
  const L = lengthsFor(motion);
  const marks: Mark[] = [];
  const hangs = motion.props.some((p) => p.kind === 'bar');
  if (!hangs) marks.push({ kind: 'path', points: [[4, FLOOR_Y + 2.5], [96, FLOOR_Y + 2.5]], width: 1.5, tone: 'ground' });

  for (const prop of motion.props) {
    if (prop.kind === 'bench') {
      marks.push({ kind: 'path', points: [[30, 68.5], [82, 68.5]], width: 4, tone: 'ground' });
      marks.push({ kind: 'path', points: [[36, 70], [36, FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
      marks.push({ kind: 'path', points: [[76, 70], [76, FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
    } else if (prop.kind === 'pad') {
      const [ox, oy] = perpendicularBelow(j.hip, j.shoulder, 5);
      const a: Point = [j.hip[0] + ox, j.hip[1] + oy];
      const b: Point = [j.shoulder[0] + ox, j.shoulder[1] + oy];
      marks.push({ kind: 'path', points: [a, b], width: 4, tone: 'ground' });
      const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      marks.push({ kind: 'path', points: [mid, [mid[0], FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
    } else if (prop.kind === 'seat') {
      const top = j.hip[1] + 4;
      marks.push({ kind: 'path', points: [[j.hip[0] - 9, top], [j.hip[0] + 9, top]], width: 4, tone: 'ground' });
      marks.push({ kind: 'path', points: [[j.hip[0], top], [j.hip[0], FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
      if (prop.back) {
        const [ox] = perpendicularBelow(j.hip, j.shoulder, 5);
        marks.push({ kind: 'path', points: [[j.hip[0] - Math.abs(ox) - 5, top], [j.shoulder[0] - 8, j.shoulder[1]]], width: 4, tone: 'ground' });
      }
    } else if (prop.kind === 'bar') {
      marks.push({ kind: 'path', points: [[28, j.hand[1]], [76, j.hand[1]]], width: 3, tone: 'ground' });
    } else if (prop.kind === 'dipBars') {
      marks.push({ kind: 'path', points: [[30, j.hand[1] + 1.5], [74, j.hand[1] + 1.5]], width: 3, tone: 'ground' });
      marks.push({ kind: 'path', points: [[34, j.hand[1] + 1.5], [34, FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
      marks.push({ kind: 'path', points: [[70, j.hand[1] + 1.5], [70, FLOOR_Y + 2.5]], width: 2.5, tone: 'ground' });
    } else if (prop.kind === 'cable') {
      marks.push({ kind: 'path', points: [prop.from, j.hand], width: 1.2, tone: 'ground' });
      marks.push({ kind: 'circle', at: prop.from, r: 2.5, tone: 'ground' });
    } else if (prop.kind === 'footplate') {
      marks.push({ kind: 'path', points: [[prop.x, j.frontAnkle[1] - 9], [prop.x, j.frontAnkle[1] + 8]], width: 3, tone: 'ground' });
    } else if (prop.kind === 'toes') {
      // The foot, toes planted: a calf raise is the heel leaving the floor.
      marks.push({ kind: 'path', points: [j.frontAnkle, [j.frontAnkle[0] + 7, FLOOR_Y]], width: 3.5, tone: 'body' });
    }
  }

  // The far leg first, set back so the near one reads as in front.
  marks.push({ kind: 'path', points: [j.hip, j.backKnee, j.backAnkle], width: 4.5 * (motion.scale ?? 1), tone: 'far' });
  marks.push({ kind: 'path', points: [j.hip, j.shoulder], width: 6 * (motion.scale ?? 1), tone: 'body' });
  marks.push({ kind: 'path', points: [j.hip, j.frontKnee, j.frontAnkle], width: 4.5 * (motion.scale ?? 1), tone: 'body' });
  marks.push({ kind: 'path', points: [j.shoulder, j.elbow, j.hand], width: 4 * (motion.scale ?? 1), tone: 'body' });
  marks.push({ kind: 'circle', at: j.head, r: L.head, tone: 'body' });
  marks.push(...loadMarks(load, motion.loadAt === 'ankle' ? j.frontAnkle : j.hand, motion.scale ?? 1));
  return marks;
};

/** A figure facing the viewer, arms out to the sides; for what a side view cannot show. */
const frontMarks = (motion: FrontMotion, k: number, load: Load): Mark[] => {
  const marks: Mark[] = [{ kind: 'path', points: [[20, FLOOR_Y + 2.5], [80, FLOOR_Y + 2.5]], width: 1.5, tone: 'ground' }];
  const shoulderY = 27;
  const arms: { shoulder: Point; elbow: Point; hand: Point }[] = [];

  for (const side of [-1, 1]) {
    const shoulder: Point = [50 + side * 10, shoulderY];
    if (motion.raise) {
      // Out to the side in the frontal plane, elbow a little soft.
      const a = (lerp(motion.raise.from, motion.raise.to, k) * Math.PI) / 180;
      const elbow: Point = [shoulder[0] + side * LENGTH.upperArm * Math.sin(a), shoulder[1] + LENGTH.upperArm * Math.cos(a)];
      const b = a - (10 * Math.PI) / 180;
      const hand: Point = [elbow[0] + side * LENGTH.forearm * Math.sin(b), elbow[1] + LENGTH.forearm * Math.cos(b)];
      arms.push({ shoulder, elbow, hand });
    } else if (motion.open) {
      // At shoulder height, swinging between pointing at the viewer and
      // straight out: seen from the front, only the sideways part shows.
      const h = (lerp(motion.open.from, motion.open.to, k) * Math.PI) / 180;
      const elbow: Point = [shoulder[0] + side * LENGTH.upperArm * Math.sin(h), shoulderY + 1];
      const hand: Point = [shoulder[0] + side * (LENGTH.upperArm + LENGTH.forearm) * Math.sin(h), shoulderY + 2];
      arms.push({ shoulder, elbow, hand });
    }
  }

  if (motion.cables) {
    for (const arm of arms) {
      const pulley: Point = [arm.hand[0] < 50 ? 4 : 96, shoulderY - 2];
      marks.push({ kind: 'path', points: [pulley, arm.hand], width: 1.2, tone: 'ground' });
      marks.push({ kind: 'circle', at: pulley, r: 2.5, tone: 'ground' });
    }
  }

  marks.push({ kind: 'path', points: [[44, 54], [43, 72], [43, FLOOR_Y]], width: 4.5, tone: 'body' });
  marks.push({ kind: 'path', points: [[56, 54], [57, 72], [57, FLOOR_Y]], width: 4.5, tone: 'body' });
  marks.push({ kind: 'path', points: [[50, shoulderY], [50, 54]], width: 9, tone: 'body' });
  marks.push({ kind: 'path', points: [[40, shoulderY], [60, shoulderY]], width: 5, tone: 'body' });
  marks.push({ kind: 'path', points: [[44, 54], [56, 54]], width: 5, tone: 'body' });
  marks.push({ kind: 'circle', at: [50, shoulderY - 10], r: LENGTH.head, tone: 'body' });
  for (const arm of arms) {
    marks.push({ kind: 'path', points: [arm.shoulder, arm.elbow, arm.hand], width: 4, tone: 'body' });
    marks.push(...loadMarks(load, arm.hand));
  }
  return marks;
};

/** Everything to draw for an exercise at a point in its rep. */
export const marksFor = (motionId: MotionId, progress: number, load: Load): Mark[] => {
  const motion: Motion = MOTIONS[motionId];
  return motion.view === 'side'
    ? sideMarks(motion, sideJointsAt(motion, progress), load)
    : frontMarks(motion, progress, load);
};
