import { describe, expect, it } from 'vitest';
import { RAW_BUILTIN_CATALOGUE } from '../builtinCatalogue';
import {
  FLOOR_Y,
  lengthsFor,
  loadFor,
  marksFor,
  MOTIONS,
  type MotionId,
  motionFor,
  REP_MS,
  repProgress,
  sideJointsAt,
} from '../exerciseMotion';

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const SAMPLES = Array.from({ length: 41 }, (_, i) => i / 40);
const ALL = Object.keys(MOTIONS) as MotionId[];
const SIDE = ALL.filter((id) => MOTIONS[id].view === 'side');

const side = (id: MotionId) => {
  const motion = MOTIONS[id];
  if (motion.view !== 'side') throw new Error(`${id} is not side-on`);
  return motion;
};
const at = (id: MotionId, k: number) => sideJointsAt(side(id), k);

describe('motionFor: the exercise, not its family', () => {
  // The names behind the figures that were wrong in use, and the rest of the
  // lifts in that history, as they were actually logged.
  it.each([
    ['Dumbbell Skullcrusher', 'skullcrusher'],
    ['Skullcrusher (Dumbbell)', 'skullcrusher'],
    ['Shoulder Press (Dumbbell)', 'overhead-press'],
    ['Barbell Incline Bench Press', 'incline-press'],
    ['Incline Bench Press (Dumbbell)', 'incline-press'],
    ['Cable Rear Delt Reverse Fly', 'reverse-fly'],
    ['Bench Press (Barbell)', 'bench-press'],
    ['Dumbbell Bench Press', 'bench-press'],
    ['Flat Dumbbell Press', 'bench-press'],
    ['CGBP', 'bench-press'],
    ['Pull Up', 'pull-up'],
    ['Chin-Up', 'pull-up'],
    ['Lat Pulldown (Cable)', 'pulldown'],
    ['Straight Arm Lat Pulldown (Cable)', 'straight-arm-pulldown'],
    ['Lat Prayer', 'straight-arm-pulldown'],
    ['Seated Cable Row - V Grip (Cable)', 'seated-row'],
    ['Lateral Raise (Dumbbell)', 'lateral-raise'],
    ['Pullover (Dumbbell)', 'pullover'],
    ['Chest Supported Incline Row (Dumbbell)', 'chest-supported-row'],
    ['Incline Bench Dumbbell Row', 'chest-supported-row'],
    ['Bulgarian Split Squat (Dumbbell)', 'lunge'],
    ['RFESS', 'lunge'],
    ['Seated Incline Curl (Dumbbell)', 'incline-curl'],
    ['Bicep Curl (Barbell)', 'curl'],
    ['Triceps Pushdown', 'pushdown'],
    ['Overhead Triceps Extension (Dumbbell)', 'overhead-extension'],
    ['Romanian Deadlift', 'rdl'],
    ['Deadlift (Barbell)', 'deadlift'],
    ['Goblet Squat', 'goblet-squat'],
    ['Squat (Barbell)', 'squat'],
    ['Barbell Row', 'bent-row'],
    ['Single-Arm Dumbbell Row', 'bent-row'],
    ['Dips', 'dip'],
    ['Push-Up', 'push-up'],
    ['Leg Extension (Machine)', 'leg-extension'],
    ['Lying Leg Curl (Machine)', 'leg-curl'],
    ['Standing Calf Raise', 'calf-raise'],
    ['Leg Press Calf Raise', 'calf-raise'],
    ['Seated Calf Raise', 'seated-calf-raise'],
    ['Hanging Leg Raise', 'hanging-leg-raise'],
    ['Toes to Bar', 'hanging-leg-raise'],
    ['Hanging Knee Raise', 'hanging-knee-raise'],
    ['Crunch', 'crunch'],
    ['Cable Crunch', 'cable-crunch'],
    ['Ab Wheel Rollout', 'ab-wheel'],
    ['Plank', 'plank'],
    ["Farmer's Walk", 'carry'],
    ['Cable Fly', 'chest-fly'],
    ['Pec Deck (Machine)', 'chest-fly'],
    ['Incline Dumbbell Fly', 'chest-fly'],
    ['Rear Delt Reverse Fly (Dumbbell)', 'reverse-fly'],
    ['Front Raise (Dumbbell)', 'front-raise'],
    ['Decline Bench Press (Barbell)', 'decline-press'],
    ['Hip Thrust (Barbell)', 'hip-thrust'],
    ['Glute Bridge', 'hip-thrust'],
    ['Leg Press', 'leg-press'],
    ['Hack Squat', 'hack-squat'],
    ['Seated Leg Curl (Machine)', 'seated-leg-curl'],
    ['Preacher Curl', 'preacher-curl'],
    ['Upright Row', 'upright-row'],
    ['Face Pull', 'face-pull'],
    ['Shrug (Dumbbell)', 'shrug'],
    ['Lying Leg Raise', 'lying-leg-raise'],
    ['Step-Up', 'step-up'],
    ['Good Morning', 'good-morning'],
  ] as const)('%s → %s', (name, motion) => {
    expect(motionFor(name)).toBe(motion);
  });

  it('provides a valid 2D kinematic animation for 100% of built-in catalogue exercises and aliases', () => {
    for (const spec of RAW_BUILTIN_CATALOGUE) {
      const motion = motionFor(spec.canonicalName);
      expect(motion, `canonical: ${spec.canonicalName}`).not.toBeNull();
      for (const alias of spec.aliases ?? []) {
        const aliasMotion = motionFor(alias);
        expect(aliasMotion, `alias: ${alias} (of ${spec.canonicalName})`).not.toBeNull();
      }
    }
  });

  it('draws nothing for a name it does not know or non-rep conditioning', () => {
    expect(motionFor('Turkish Get-Up')).toBeNull();
    expect(motionFor('Sled Push')).toBeNull();
    expect(motionFor('Box Jump')).toBeNull();
  });
});

describe('loadFor', () => {
  it('holds what the name says it is done with', () => {
    expect(loadFor('bench-press', 'Bench Press (Barbell)')).toBe('plate');
    expect(loadFor('bench-press', 'Dumbbell Bench Press')).toBe('dumbbell');
    expect(loadFor('overhead-press', 'Shoulder Press (Dumbbell)')).toBe('dumbbell');
    expect(loadFor('pushdown', 'Triceps Pushdown')).toBe('handle');
  });

  it('falls back to catalogued equipment, then to what the motion is usually done with', () => {
    expect(loadFor('curl', 'Bicep Curl', 'Barbell')).toBe('plate');
    expect(loadFor('squat', 'Back Squat')).toBe('plate');
  });

  it('keeps bodyweight motions empty-handed whatever the name says', () => {
    expect(loadFor('pull-up', 'Weighted Pull-Up (Dumbbell)')).toBe('none');
    expect(loadFor('leg-extension', 'Leg Extension (Machine)')).toBe('pad');
  });
});

describe('every side-on motion', () => {
  it('keeps every bone its length through the whole rep', () => {
    for (const id of SIDE) {
      const L = lengthsFor(side(id));
      for (const k of SAMPLES) {
        const j = at(id, k);
        const where = `${id} at ${k}`;
        expect(distance(j.hip, j.shoulder), where).toBeCloseTo(L.torso, 5);
        expect(distance(j.shoulder, j.elbow), where).toBeCloseTo(L.upperArm, 5);
        expect(distance(j.elbow, j.hand), where).toBeLessThanOrEqual(L.forearm + 1e-6);
        expect(distance(j.elbow, j.hand), where).toBeGreaterThan(L.forearm - 1e-3);
        expect(distance(j.hip, j.frontKnee), where).toBeCloseTo(L.thigh, 5);
        expect(distance(j.hip, j.backKnee), where).toBeCloseTo(L.thigh, 5);
        expect(distance(j.frontKnee, j.frontAnkle), where).toBeGreaterThan(L.shin - 1e-3);
        expect(distance(j.backKnee, j.backAnkle), where).toBeGreaterThan(L.shin - 1e-3);
      }
    }
  });
});

describe('every motion', () => {
  // The first contact sheet had four figures running off the top of the box.
  it('stays inside its box, at every point of the rep', () => {
    for (const id of ALL) {
      for (const k of SAMPLES) {
        for (const mark of marksFor(id, k, MOTIONS[id].load)) {
          const points = mark.kind === 'path' ? mark.points : [mark.at];
          for (const [x, y] of points) {
            expect(x, `${id} at ${k}`).toBeGreaterThanOrEqual(0);
            expect(x, `${id} at ${k}`).toBeLessThanOrEqual(100);
            expect(y, `${id} at ${k}`).toBeGreaterThanOrEqual(0);
            expect(y, `${id} at ${k}`).toBeLessThanOrEqual(FLOOR_Y + 3);
          }
        }
      }
    }
  });
});

describe('what stays put', () => {
  it('keeps planted feet on the floor', () => {
    for (const id of ['squat', 'goblet-squat', 'rdl', 'deadlift', 'lunge', 'bent-row', 'curl', 'overhead-press', 'push-up'] as const) {
      const start = at(id, 0);
      for (const k of SAMPLES) {
        expect(distance(at(id, k).frontAnkle, start.frontAnkle), `${id} at ${k}`).toBeLessThan(1e-6);
        expect(at(id, k).frontAnkle[1], id).toBeCloseTo(FLOOR_Y, 5);
      }
    }
  });

  it('keeps planted hands where they were put', () => {
    for (const id of ['push-up', 'dip', 'pull-up', 'hanging-leg-raise'] as const) {
      const start = at(id, 0);
      for (const k of SAMPLES) expect(distance(at(id, k).hand, start.hand), `${id} at ${k}`).toBeLessThan(1e-6);
    }
  });
});

/*
  Each of these is a joint that turned the wrong way between the two ends of a
  rep in an earlier draft. Bone lengths stay true while it happens, so only a
  check on direction catches it.
*/
describe('joints turn the way the exercise turns them', () => {
  const always = (id: MotionId, check: (j: ReturnType<typeof at>) => boolean) =>
    SAMPLES.every((k) => check(at(id, k)));

  it('keeps the hand above the elbow through every press', () => {
    for (const id of ['bench-press', 'incline-press', 'overhead-press'] as const) {
      expect(always(id, (j) => j.hand[1] <= j.elbow[1] + 0.5), id).toBe(true);
    }
  });

  it('raises the overhead press elbow in front of the body, not behind it', () => {
    expect(always('overhead-press', (j) => j.elbow[0] >= j.shoulder[0] - 2)).toBe(true);
  });

  it('keeps the seated row handle in front of the elbow', () => {
    expect(always('seated-row', (j) => j.hand[0] >= j.elbow[0] - 0.5)).toBe(true);
  });

  it('curls the forearm up in front of the body', () => {
    // At the top the hand finishes a little behind the elbow, as a real curl
    // does; swinging out behind the body put it a whole forearm behind.
    for (const id of ['curl', 'incline-curl'] as const) {
      expect(always(id, (j) => j.hand[0] >= j.elbow[0] - 4), id).toBe(true);
      expect(at(id, 0.5).hand[0], id).toBeGreaterThan(at(id, 0.5).elbow[0] + 8);
    }
  });

  it('pushes the pushdown down through the front of the body', () => {
    expect(always('pushdown', (j) => j.hand[0] >= j.elbow[0] - 0.5)).toBe(true);
  });

  it('drives the row elbow back past the body', () => {
    for (const id of ['bent-row', 'chest-supported-row', 'seated-row'] as const) {
      expect(at(id, 1).elbow[0], id).toBeLessThan(at(id, 1).shoulder[0]);
    }
  });

  it('bends the dip elbow back and the pull-up elbow forward', () => {
    expect(at('dip', 1).elbow[0]).toBeLessThan(at('dip', 1).hand[0]);
    expect(at('pull-up', 1).elbow[0]).toBeGreaterThan(at('pull-up', 1).hand[0]);
  });

  it('bends both knees forward when the feet are together', () => {
    const j = at('deadlift', 0);
    expect(j.frontKnee[0]).toBeGreaterThan(j.hip[0]);
    expect(j.backKnee).toEqual(j.frontKnee);
  });
});

describe('the shape of the movement', () => {
  it('squats to about knee height', () => {
    const bottom = at('squat', 1);
    expect(Math.abs(bottom.hip[1] - bottom.frontKnee[1])).toBeLessThan(6);
  });

  it('starts the deadlift with the hips above the knees and the bar over the feet', () => {
    const start = at('deadlift', 0);
    expect(start.hip[1]).toBeLessThan(start.frontKnee[1]);
    expect(Math.abs(start.hand[0] - start.frontAnkle[0])).toBeLessThan(8);
  });

  it('brings the chin to the bar on a pull-up', () => {
    const top = at('pull-up', 1);
    expect(top.head[1] - top.hand[1]).toBeLessThan(10);
  });

  it('leans back on an incline, head away from the feet', () => {
    const j = at('incline-press', 0);
    expect(j.shoulder[0]).toBeLessThan(j.hip[0]);
    expect(j.frontAnkle[0]).toBeGreaterThan(j.hip[0]);
  });

  it('holds a plank still', () => {
    expect(at('plank', 0)).toEqual(at('plank', 1));
  });
});

describe('repProgress', () => {
  it('starts and ends the rep at the start pose, holding at the far end', () => {
    expect(repProgress(0)).toBe(0);
    expect(repProgress(REP_MS)).toBe(0);
    expect(repProgress(REP_MS * 0.45)).toBe(1);
  });

  it('eases rather than moving at constant speed, and repeats from any clock', () => {
    expect(repProgress(REP_MS * 0.038)).toBeLessThan(0.05);
    expect(repProgress(REP_MS * 0.19)).toBeCloseTo(0.5, 5);
    expect(repProgress(-REP_MS * 0.81)).toBeCloseTo(repProgress(REP_MS * 0.19), 5);
  });
});
