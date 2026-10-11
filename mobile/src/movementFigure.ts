import type { MovementPattern } from './ai/exercises';

/**
 * A figure doing one rep of a movement pattern, side on.
 *
 * Poses are joint angles, not joint positions. Sliding points between two
 * positions shortens every limb on the way — a thigh visibly shrinks halfway
 * down a squat — whereas turning joints keeps each bone its length through the
 * whole rep. Each pattern also names the one point that does not move, so a
 * squat's feet stay planted while the hips travel, as they do under a bar.
 *
 * One figure per pattern, like the glyphs: it shows what a squat or a hinge
 * looks like, not every variant of one, and it cannot show bad form, because
 * nothing here is generated.
 *
 * Coordinates are a 100x100 box, y down, figure facing right. Angles are
 * degrees, 0 pointing right and 90 pointing up, each limb measured from the
 * joint nearer the hip.
 */

export interface Pose {
  torso: number;
  upperArm: number;
  forearm: number;
  frontThigh: number;
  frontShin: number;
  backThigh: number;
  backShin: number;
}

export type Load = 'bar' | 'dumbbell' | 'none';
export type Prop = 'floor' | 'bench';

interface Movement {
  /** The bottom and top of the rep, in the order the rep starts. */
  from: Pose;
  to: Pose;
  /** The joint pinned in place, and where. */
  anchor: 'frontAnkle' | 'hip';
  at: [number, number];
  /**
   * Both feet planted, with the hip travelling between these two points. The
   * legs are then solved each frame rather than posed, because a split stance
   * cannot keep two feet still by turning joints through fixed angles.
   */
  planted?: { front: [number, number]; back: [number, number]; hipFrom: [number, number]; hipTo: [number, number] };
  load: Load;
  prop: Prop;
}

/**
 * Proportions of a real body, not of a stick figure: shoulder to grip is about
 * 1.3 times shoulder to hip, so a hanging hand reaches the upper thigh. With
 * equal lengths it stopped at the hip, and a dumbbell read as a dot on the crotch.
 */
export const LENGTH = { torso: 27, thigh: 22, shin: 21, upperArm: 18, forearm: 17, neck: 4, head: 5.5 };
export const FLOOR_Y = 90;

/** Arms hang a few degrees forward, as they do: dead vertical parks the hand on the hip. */
const hanging = { upperArm: 274, forearm: 280 };

const standing: Pose = {
  torso: 90,
  upperArm: 270,
  forearm: 270,
  frontThigh: 270,
  frontShin: 270,
  backThigh: 270,
  backShin: 270,
};

export const MOVEMENTS: Record<MovementPattern, Movement> = {
  // Bar across the back; hips down and back, knees over the toes, chest up.
  squat: {
    from: { ...standing, upperArm: 235, forearm: 100 },
    to: {
      torso: 62,
      upperArm: 207,
      forearm: 72,
      frontThigh: 352,
      frontShin: 246,
      backThigh: 352,
      backShin: 246,
    },
    anchor: 'frontAnkle',
    at: [50, FLOOR_Y],
    load: 'bar',
    prop: 'floor',
  },
  // Hips pushed back over nearly straight legs, the bar sliding down the thighs.
  hinge: {
    from: standing,
    to: { ...standing, torso: 18, frontThigh: 291, frontShin: 263, backThigh: 291, backShin: 263 },
    anchor: 'frontAnkle',
    at: [48, FLOOR_Y],
    load: 'bar',
    prop: 'floor',
  },
  // Flat on a bench, feet on the floor, pressing from the chest to lockout.
  push: {
    from: {
      torso: 0,
      upperArm: 238,
      forearm: 82,
      frontThigh: 196,
      frontShin: 270,
      backThigh: 196,
      backShin: 270,
    },
    to: {
      torso: 0,
      upperArm: 90,
      forearm: 90,
      frontThigh: 196,
      frontShin: 270,
      backThigh: 196,
      backShin: 270,
    },
    anchor: 'hip',
    // Hip height chosen so the feet land on the floor: 27.1 of leg below it.
    at: [44, 62.9],
    load: 'bar',
    prop: 'bench',
  },
  // Bent over and held there; only the arms move, elbows driven back.
  pull: {
    from: { ...standing, torso: 28, frontThigh: 283, frontShin: 266, backThigh: 283, backShin: 266 },
    to: {
      ...standing,
      torso: 28,
      // The elbow finishes level with the back, the bar at the belly. Higher,
      // the arm peaked over the shoulders, which is a shrug, not a row.
      upperArm: 192,
      forearm: 268,
      frontThigh: 283,
      frontShin: 266,
      backThigh: 283,
      backShin: 266,
    },
    anchor: 'frontAnkle',
    at: [56, FLOOR_Y],
    load: 'bar',
    prop: 'floor',
  },
  // Split stance; the back knee drops toward the floor, the front shin stays upright.
  lunge: {
    from: { ...standing, ...hanging },
    to: { ...standing, ...hanging },
    anchor: 'hip',
    at: [38, 57],
    planted: { front: [64, FLOOR_Y], back: [12, FLOOR_Y], hipFrom: [38, 57], hipTo: [42, 69] },
    load: 'dumbbell',
    prop: 'floor',
  },
  // Walking with a load in each hand: the legs trade places, the trunk stays tall.
  carry: {
    from: { ...standing, ...hanging, frontThigh: 287, frontShin: 270, backThigh: 253, backShin: 262 },
    to: { ...standing, ...hanging, frontThigh: 253, frontShin: 262, backThigh: 287, backShin: 270 },
    anchor: 'hip',
    at: [50, 47],
    load: 'dumbbell',
    prop: 'floor',
  },
  // Lying with knees up, curling the shoulders off the floor.
  core: {
    from: {
      torso: 180,
      upperArm: 0,
      forearm: 0,
      frontThigh: 50,
      frontShin: 295,
      backThigh: 50,
      backShin: 295,
    },
    to: {
      torso: 148,
      upperArm: 20,
      forearm: 20,
      frontThigh: 50,
      frontShin: 295,
      backThigh: 50,
      backShin: 295,
    },
    anchor: 'hip',
    at: [56, 87],
    load: 'none',
    prop: 'floor',
  },
  // Standing still; one joint turns. Drawn as a curl, the most common of them.
  isolation: {
    from: standing,
    // 460, not 100: the same direction, but reached by turning forward through
    // 360. Going the short way swung the forearm out behind the body.
    to: { ...standing, forearm: 460 },
    anchor: 'frontAnkle',
    at: [50, FLOOR_Y],
    load: 'dumbbell',
    prop: 'floor',
  },
};

type Point = [number, number];

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

const step = ([x, y]: Point, length: number, degrees: number): Point => {
  const radians = (degrees * Math.PI) / 180;
  return [x + length * Math.cos(radians), y - length * Math.sin(radians)];
};

/** Places every joint for a pose, then shifts the figure so its anchor sits still. */
export const jointsFor = (pose: Pose, anchor: Movement['anchor'], at: Point): Joints => {
  const hip: Point = [0, 0];
  const frontKnee = step(hip, LENGTH.thigh, pose.frontThigh);
  const frontAnkle = step(frontKnee, LENGTH.shin, pose.frontShin);
  const backKnee = step(hip, LENGTH.thigh, pose.backThigh);
  const backAnkle = step(backKnee, LENGTH.shin, pose.backShin);
  const shoulder = step(hip, LENGTH.torso, pose.torso);
  const head = step(shoulder, LENGTH.neck + LENGTH.head, pose.torso);
  const elbow = step(shoulder, LENGTH.upperArm, pose.upperArm);
  const hand = step(elbow, LENGTH.forearm, pose.forearm);

  const pinned = anchor === 'hip' ? hip : frontAnkle;
  const dx = at[0] - pinned[0];
  const dy = at[1] - pinned[1];
  const move = ([x, y]: Point): Point => [x + dx, y + dy];

  return {
    head: move(head),
    shoulder: move(shoulder),
    elbow: move(elbow),
    hand: move(hand),
    hip: move(hip),
    frontKnee: move(frontKnee),
    frontAnkle: move(frontAnkle),
    backKnee: move(backKnee),
    backAnkle: move(backAnkle),
  };
};

/** One rep, in milliseconds: down, a beat at the bottom, up, a beat at the top. */
export const REP_MS = 2600;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * How far through the rep a moment is, 0 at the start pose and 1 at the end.
 *
 * Eased both ways and held at each end, because a rep that moves at constant
 * speed and turns around instantly reads as a machine, not a person.
 */
export const repProgress = (elapsedMs: number): number => {
  const t = (((elapsedMs % REP_MS) + REP_MS) % REP_MS) / REP_MS;
  if (t < 0.38) return easeInOut(t / 0.38);
  if (t < 0.5) return 1;
  if (t < 0.88) return 1 - easeInOut((t - 0.5) / 0.38);
  return 0;
};

const mixPose = (a: Pose, b: Pose, k: number): Pose => {
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    torso: mix(a.torso, b.torso),
    upperArm: mix(a.upperArm, b.upperArm),
    forearm: mix(a.forearm, b.forearm),
    frontThigh: mix(a.frontThigh, b.frontThigh),
    frontShin: mix(a.frontShin, b.frontShin),
    backThigh: mix(a.backThigh, b.backThigh),
    backShin: mix(a.backShin, b.backShin),
  };
};

/**
 * The knee for a hip and a foot a fixed distance apart: two-bone inverse
 * kinematics. `forward` picks which of the two possible knees — the front leg
 * bends toward the toes, the back one toward the floor.
 */
export const kneeBetween = (hip: Point, foot: Point, forward: boolean): Point => {
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  // Out of reach is a straight leg pointed at the foot, not a NaN.
  const d = Math.min(Math.hypot(dx, dy), LENGTH.thigh + LENGTH.shin - 1e-6);
  const toFoot = Math.atan2(dy, dx);
  const bend = Math.acos((LENGTH.thigh ** 2 + d ** 2 - LENGTH.shin ** 2) / (2 * LENGTH.thigh * d));
  const a = toFoot - bend;
  const b = toFoot + bend;
  const knee = (angle: number): Point => [hip[0] + LENGTH.thigh * Math.cos(angle), hip[1] + LENGTH.thigh * Math.sin(angle)];
  const [k1, k2] = [knee(a), knee(b)];
  return forward ? (k1[0] > k2[0] ? k1 : k2) : k1[1] > k2[1] ? k1 : k2;
};

/** Where every joint is at a point in the rep. */
export const figureAt = (pattern: MovementPattern, progress: number): Joints => {
  const movement = MOVEMENTS[pattern];
  const pose = mixPose(movement.from, movement.to, progress);
  const planted = movement.planted;
  if (!planted) return jointsFor(pose, movement.anchor, movement.at);

  const hip: Point = [
    planted.hipFrom[0] + (planted.hipTo[0] - planted.hipFrom[0]) * progress,
    planted.hipFrom[1] + (planted.hipTo[1] - planted.hipFrom[1]) * progress,
  ];
  const upper = jointsFor(pose, 'hip', hip);
  return {
    ...upper,
    frontKnee: kneeBetween(hip, planted.front, true),
    frontAnkle: planted.front,
    backKnee: kneeBetween(hip, planted.back, false),
    backAnkle: planted.back,
  };
};
