import { describe, expect, it } from 'vitest';
import { getKeyframePhaseConfig, videoBundleFor } from '../exerciseVideos';

describe('videoBundleFor Movement Matching', () => {
  describe('Canonical Flagship Compound Lifts (Match 8K Video Bundles)', () => {
    it('matches exact canonical Barbell Bench Press names', () => {
      expect(videoBundleFor('Bench Press (Barbell)')?.canonicalName).toBe('Barbell Bench Press');
      expect(videoBundleFor('Barbell Bench Press')?.canonicalName).toBe('Barbell Bench Press');
      expect(videoBundleFor('Flat Barbell Bench Press')?.canonicalName).toBe('Barbell Bench Press');
      expect(videoBundleFor('Barbell Bench')?.canonicalName).toBe('Barbell Bench Press');
    });

    it('matches exact canonical Barbell Back Squat names', () => {
      expect(videoBundleFor('Squat (Barbell)')?.canonicalName).toBe('Barbell Back Squat');
      expect(videoBundleFor('Barbell Squat')?.canonicalName).toBe('Barbell Back Squat');
      expect(videoBundleFor('Barbell Back Squat')?.canonicalName).toBe('Barbell Back Squat');
      expect(videoBundleFor('Back Squat (Barbell)')?.canonicalName).toBe('Barbell Back Squat');
    });

    it('matches exact canonical Conventional Barbell Deadlift names', () => {
      expect(videoBundleFor('Deadlift (Barbell)')?.canonicalName).toBe('Conventional Barbell Deadlift');
      expect(videoBundleFor('Barbell Deadlift')?.canonicalName).toBe('Conventional Barbell Deadlift');
      expect(videoBundleFor('Conventional Deadlift')?.canonicalName).toBe('Conventional Barbell Deadlift');
      expect(videoBundleFor('Conventional Barbell Deadlift')?.canonicalName).toBe('Conventional Barbell Deadlift');
    });

    it('matches exact canonical Standing Barbell Overhead Press names', () => {
      expect(videoBundleFor('Overhead Press (Barbell)')?.canonicalName).toBe('Barbell Overhead Press');
      expect(videoBundleFor('Barbell Overhead Press')?.canonicalName).toBe('Barbell Overhead Press');
      expect(videoBundleFor('Standing Barbell Overhead Press')?.canonicalName).toBe('Barbell Overhead Press');
      expect(videoBundleFor('Military Press (Barbell)')?.canonicalName).toBe('Barbell Overhead Press');
      expect(videoBundleFor('Strict Overhead Press')?.canonicalName).toBe('Barbell Overhead Press');
    });

    it('matches exact canonical Barbell Bent-Over Row names', () => {
      expect(videoBundleFor('Bent Over Row (Barbell)')?.canonicalName).toBe('Barbell Bent-Over Row');
      expect(videoBundleFor('Bent-Over Row (Barbell)')?.canonicalName).toBe('Barbell Bent-Over Row');
      expect(videoBundleFor('Barbell Bent-Over Row')?.canonicalName).toBe('Barbell Bent-Over Row');
      expect(videoBundleFor('Barbell Row')?.canonicalName).toBe('Barbell Bent-Over Row');
      expect(videoBundleFor('Pendlay Row')?.canonicalName).toBe('Barbell Bent-Over Row');
    });

    it('matches exact canonical Bodyweight Pull-Up names', () => {
      expect(videoBundleFor('Pull-Up')?.canonicalName).toBe('Pull-Up');
      expect(videoBundleFor('Pull Up')?.canonicalName).toBe('Pull-Up');
      expect(videoBundleFor('Bodyweight Pull-Up')?.canonicalName).toBe('Pull-Up');
      expect(videoBundleFor('Strict Pull-Up')?.canonicalName).toBe('Pull-Up');
    });

    it('matches exact canonical Triceps Pushdown names', () => {
      expect(videoBundleFor('Triceps Pushdown')?.canonicalName).toBe('Triceps Pushdown');
      expect(videoBundleFor('Cable Triceps Pushdown')?.canonicalName).toBe('Triceps Pushdown');
      expect(videoBundleFor('Tricep Pushdown')?.canonicalName).toBe('Triceps Pushdown');
    });

    it('matches exact canonical Leg Extension names', () => {
      expect(videoBundleFor('Leg Extension (Machine)')?.canonicalName).toBe('Leg Extension (Machine)');
      expect(videoBundleFor('Leg Extension')?.canonicalName).toBe('Leg Extension (Machine)');
      expect(videoBundleFor('Seated Leg Extension')?.canonicalName).toBe('Leg Extension (Machine)');
    });

    it('matches exact canonical Bicep Curl names', () => {
      expect(videoBundleFor('Bicep Curl (Dumbbell)')?.canonicalName).toBe('Bicep Curl (Dumbbell)');
      expect(videoBundleFor('Dumbbell Bicep Curl')?.canonicalName).toBe('Bicep Curl (Dumbbell)');
      expect(videoBundleFor('Dumbbell Curl')?.canonicalName).toBe('Bicep Curl (Dumbbell)');
    });

    it('matches exact canonical Lateral Raise names', () => {
      expect(videoBundleFor('Lateral Raise (Dumbbell)')?.canonicalName).toBe('Lateral Raise (Dumbbell)');
      expect(videoBundleFor('Dumbbell Lateral Raise')?.canonicalName).toBe('Lateral Raise (Dumbbell)');
    });

    it('matches exact canonical Lying Leg Curl names', () => {
      expect(videoBundleFor('Lying Leg Curl (Machine)')?.canonicalName).toBe('Lying Leg Curl (Machine)');
      expect(videoBundleFor('Lying Leg Curl')?.canonicalName).toBe('Lying Leg Curl (Machine)');
      expect(videoBundleFor('Prone Leg Curl')?.canonicalName).toBe('Lying Leg Curl (Machine)');
    });
  });

  describe('Distinct Variations & Accessory Lifts (Fall Through to 2D Kinematic Studio)', () => {
    it('does NOT match Arnold Press or dumbbell shoulder presses to barbell OHP', () => {
      expect(videoBundleFor('Arnold Press (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Dumbbell Arnold Press')).toBeNull();
      expect(videoBundleFor('Shoulder Press (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Shoulder Press (Machine)')).toBeNull();
    });

    it('does NOT match Dumbbell Rows, Chest-Supported Rows, or Seated Rows to barbell row', () => {
      expect(videoBundleFor('Dumbbell Row')).toBeNull();
      expect(videoBundleFor('Chest-Supported Row (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Seated Cable Row')).toBeNull();
    });

    it('does NOT match Lat Pulldown or Chin-Ups to pull-up video bundle', () => {
      expect(videoBundleFor('Lat Pulldown (Cable)')).toBeNull();
      expect(videoBundleFor('Close-Grip Lat Pulldown')).toBeNull();
      expect(videoBundleFor('Chin-Up')).toBeNull();
    });

    it('does NOT match Good Mornings or RDLs to conventional deadlift video bundle', () => {
      expect(videoBundleFor('Good Morning (Barbell)')).toBeNull();
      expect(videoBundleFor('Romanian Deadlift (Barbell)')).toBeNull();
      expect(videoBundleFor('Romanian Deadlift (Dumbbell)')).toBeNull();
    });

    it('does NOT match Goblet Squats, Hack Squats, or Leg Press to barbell back squat', () => {
      expect(videoBundleFor('Goblet Squat (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Hack Squat (Machine)')).toBeNull();
      expect(videoBundleFor('Leg Press')).toBeNull();
      expect(videoBundleFor('Front Squat (Barbell)')).toBeNull();
      expect(videoBundleFor('Bulgarian Split Squat')).toBeNull();
    });

    it('does NOT match Dumbbell Bench, Incline Bench, Decline Bench, or Machine Press to flat barbell bench', () => {
      expect(videoBundleFor('Bench Press (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Incline Bench Press (Barbell)')).toBeNull();
      expect(videoBundleFor('Incline Bench Press (Dumbbell)')).toBeNull();
      expect(videoBundleFor('Decline Bench Press (Barbell)')).toBeNull();
      expect(videoBundleFor('Close-Grip Bench Press (Barbell)')).toBeNull();
      expect(videoBundleFor('Chest Press (Machine)')).toBeNull();
    });
  });
});

describe('getKeyframePhaseConfig Dynamic Telemetry Labels', () => {
  it('provides accurate phase labels for Bench Press', () => {
    const config = getKeyframePhaseConfig('Barbell Bench Press');
    expect(config.setupLabel).toBe('PHASE 1: STARTING LOCKOUT');
    expect(config.depthLabel).toBe('PHASE 2: CHEST TOUCH & ARCH');
    expect(config.scrubberStart).toBe('LOCKOUT');
    expect(config.scrubberEnd).toBe('CHEST TOUCH');
  });

  it('provides accurate phase labels for Overhead Press', () => {
    const config = getKeyframePhaseConfig('Barbell Overhead Press');
    expect(config.setupLabel).toBe('PHASE 1: OVERHEAD LOCKOUT');
    expect(config.depthLabel).toBe('PHASE 2: FRONT RACK SETUP');
    expect(config.scrubberStart).toBe('LOCKOUT');
    expect(config.scrubberEnd).toBe('FRONT RACK');
  });

  it('provides accurate phase labels for Deadlift', () => {
    const config = getKeyframePhaseConfig('Conventional Barbell Deadlift');
    expect(config.setupLabel).toBe('PHASE 1: TOP LOCKOUT');
    expect(config.depthLabel).toBe('PHASE 2: FLOOR SETUP & SLACK PULL');
    expect(config.scrubberStart).toBe('LOCKOUT');
    expect(config.scrubberEnd).toBe('FLOOR SETUP');
  });

  it('provides accurate phase labels for Barbell Row', () => {
    const config = getKeyframePhaseConfig('Barbell Bent-Over Row');
    expect(config.setupLabel).toBe('PHASE 1: HINGE SETUP / HANG');
    expect(config.depthLabel).toBe('PHASE 2: PEAK CONTRACTION');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('PEAK ROW');
  });

  it('provides accurate phase labels for Pull-Up', () => {
    const config = getKeyframePhaseConfig('Pull-Up');
    expect(config.setupLabel).toBe('PHASE 1: ACTIVE HANG / SETUP');
    expect(config.depthLabel).toBe('PHASE 2: CHIN OVER BAR');
    expect(config.scrubberStart).toBe('HANG');
    expect(config.scrubberEnd).toBe('TOP CHIN');
  });

  it('provides accurate phase labels for Back Squat', () => {
    const config = getKeyframePhaseConfig('Barbell Back Squat');
    expect(config.setupLabel).toBe('PHASE 1: STARTING SETUP');
    expect(config.depthLabel).toBe('PHASE 2: PARALLEL DEPTH');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('DEPTH');
  });

  it('provides accurate phase labels for Triceps Pushdown', () => {
    const config = getKeyframePhaseConfig('Triceps Pushdown');
    expect(config.setupLabel).toBe('PHASE 1: 90° ELBOW SETUP');
    expect(config.depthLabel).toBe('PHASE 2: FULL LOCKOUT & ROPE FLARE');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('LOCKOUT');
  });

  it('provides accurate phase labels for Leg Extension', () => {
    const config = getKeyframePhaseConfig('Leg Extension (Machine)');
    expect(config.setupLabel).toBe('PHASE 1: 90° KNEE SETUP');
    expect(config.depthLabel).toBe('PHASE 2: FULL KNEE EXTENSION (180°)');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('LOCKOUT');
  });

  it('provides accurate phase labels for Bicep Curl', () => {
    const config = getKeyframePhaseConfig('Bicep Curl (Dumbbell)');
    expect(config.setupLabel).toBe('PHASE 1: FULL EXTENSION HANG');
    expect(config.depthLabel).toBe('PHASE 2: PEAK BICEP CONTRACTION');
    expect(config.scrubberStart).toBe('HANG');
    expect(config.scrubberEnd).toBe('CURL PEAK');
  });

  it('provides accurate phase labels for Lateral Raise', () => {
    const config = getKeyframePhaseConfig('Lateral Raise (Dumbbell)');
    expect(config.setupLabel).toBe('PHASE 1: BOTTOM HANG SETUP');
    expect(config.depthLabel).toBe('PHASE 2: 90° SHOULDER ABDUCTION');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('90° PEAK');
  });

  it('provides accurate phase labels for Lying Leg Curl', () => {
    const config = getKeyframePhaseConfig('Lying Leg Curl (Machine)');
    expect(config.setupLabel).toBe('PHASE 1: 180° EXTENSION SETUP');
    expect(config.depthLabel).toBe('PHASE 2: PEAK KNEE FLEXION');
    expect(config.scrubberStart).toBe('SETUP');
    expect(config.scrubberEnd).toBe('CURL PEAK');
  });
});
