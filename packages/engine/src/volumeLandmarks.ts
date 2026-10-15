import type { DatedSet } from './workouts';
import { isWorkingSet } from './workouts';
import type { ISODate } from './types';

/**
 * Muscle regions recognized by the body map.
 */
export type MuscleRegion =
  | 'chest'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'lats'
  | 'upper_back'
  | 'lower_back'
  | 'traps'
  | 'glutes'
  | 'quads'
  | 'hamstrings'
  | 'calves'
  | 'full_body';

export type VolumeLandmarkZone =
  | 'untrained'
  | 'maintenance'
  | 'effective'
  | 'optimal'
  | 'overreaching';

export interface MuscleGroupVolume {
  key: string;
  label: string;
  /** Actual count of working sets targeting this group as primary mover in period. */
  directSets: number;
  /** Count of working sets targeting this group as synergist / secondary mover. */
  indirectSets: number;
  /** Normalized 7-day weekly effective sets (direct + 0.5 * indirect). */
  effectiveWeeklySets: number;
  /** Minimum Effective Volume (growth threshold). */
  mev: number;
  /** Maximum Adaptive Volume range lower bound. */
  mavMin: number;
  /** Maximum Adaptive Volume range upper bound (sweet spot ceiling). */
  mavMax: number;
  /** Maximum Recoverable Volume (fatigue threshold). */
  mrv: number;
  /** Current zone relative to evidence-based landmarks. */
  zone: VolumeLandmarkZone;
  zoneLabel: string;
  zoneDescription: string;
  /** Percentage of optimal volume achieved (capped at 100% for bar meter). */
  progressPct: number;
}

export interface MovementBalance {
  ratio: number;
  status:
    | 'balanced'
    | 'push-dominant'
    | 'pull-dominant'
    | 'quad-dominant'
    | 'posterior-dominant'
    | 'insufficient-data';
  label: string;
  cue: string;
}

export interface VolumeDiagnostics {
  muscleVolumes: MuscleGroupVolume[];
  pushPullBalance: MovementBalance;
  legBalance: MovementBalance;
  totalWorkingSets: number;
  weeklyWorkingSets: number;
  optimalMusclesCount: number;
}

interface MuscleGroupDef {
  key: string;
  label: string;
  primaryRegions: MuscleRegion[];
  mev: number;
  mavMin: number;
  mavMax: number;
  mrv: number;
}

/**
 * Evidence-based hypertrophy volume landmarks (Israetel, Schoenfeld, Helms).
 * Defined in direct weekly sets.
 */
export const MUSCLE_GROUPS: MuscleGroupDef[] = [
  {
    key: 'chest',
    label: 'Chest',
    primaryRegions: ['chest'],
    mev: 8,
    mavMin: 12,
    mavMax: 18,
    mrv: 22,
  },
  {
    key: 'back',
    label: 'Back',
    primaryRegions: ['lats', 'upper_back', 'traps'],
    mev: 10,
    mavMin: 14,
    mavMax: 22,
    mrv: 25,
  },
  {
    key: 'shoulders',
    label: 'Shoulders',
    primaryRegions: ['shoulders'],
    mev: 8,
    mavMin: 12,
    mavMax: 18,
    mrv: 22,
  },
  {
    key: 'quads',
    label: 'Quads',
    primaryRegions: ['quads'],
    mev: 8,
    mavMin: 12,
    mavMax: 18,
    mrv: 20,
  },
  {
    key: 'posterior',
    label: 'Hamstrings & Glutes',
    primaryRegions: ['hamstrings', 'glutes', 'lower_back'],
    mev: 8,
    mavMin: 12,
    mavMax: 18,
    mrv: 22,
  },
  {
    key: 'arms',
    label: 'Arms',
    primaryRegions: ['biceps', 'triceps', 'forearms'],
    mev: 6,
    mavMin: 10,
    mavMax: 16,
    mrv: 20,
  },
  {
    key: 'core',
    label: 'Core',
    primaryRegions: ['abs', 'obliques'],
    mev: 4,
    mavMin: 6,
    mavMax: 12,
    mrv: 16,
  },
  {
    key: 'calves',
    label: 'Calves',
    primaryRegions: ['calves'],
    mev: 6,
    mavMin: 8,
    mavMax: 14,
    mrv: 16,
  },
];

/**
 * Evaluates volume against scientific landmarks.
 */
export const evaluateVolumeZone = (
  weeklySets: number,
  mev: number,
  mavMin: number,
  mavMax: number,
): { zone: VolumeLandmarkZone; zoneLabel: string; zoneDescription: string } => {
  if (weeklySets === 0) {
    return {
      zone: 'untrained',
      zoneLabel: 'UNTRAINED',
      zoneDescription: 'No sets logged in this period.',
    };
  }
  if (weeklySets < mev) {
    return {
      zone: 'maintenance',
      zoneLabel: 'MAINTENANCE',
      zoneDescription: 'Maintains existing muscle mass, but below active growth threshold.',
    };
  }
  if (weeklySets < mavMin) {
    return {
      zone: 'effective',
      zoneLabel: 'GROWTH',
      zoneDescription: 'Crossed minimum effective threshold. Steady progressive hypertrophy.',
    };
  }
  if (weeklySets <= mavMax) {
    return {
      zone: 'optimal',
      zoneLabel: 'OPTIMAL (MAV)',
      zoneDescription: 'Maximum Adaptive Volume sweet spot for peak muscle building and recovery.',
    };
  }
  return {
    zone: 'overreaching',
    zoneLabel: 'HIGH FATIGUE',
    zoneDescription: 'Approaching maximum recovery ceiling. Diminishing returns / junk volume risk.',
  };
};

/**
 * Evaluates Push vs. Pull structural movement balance.
 */
export const evaluatePushPull = (pushSets: number, pullSets: number): MovementBalance => {
  if (pushSets === 0 && pullSets === 0) {
    return {
      ratio: 1.0,
      status: 'insufficient-data',
      label: 'NO DATA',
      cue: 'Log push and pull movements to evaluate balance.',
    };
  }
  const ratio = Math.round((pushSets / Math.max(1, pullSets)) * 100) / 100;

  if (ratio >= 0.85 && ratio <= 1.2) {
    return {
      ratio,
      status: 'balanced',
      label: 'BALANCED',
      cue: 'Excellent upper body structural equilibrium. Shoulders and posture well supported.',
    };
  }
  if (ratio > 1.2) {
    return {
      ratio,
      status: 'push-dominant',
      label: 'PUSH HEAVY',
      cue: 'Pushing volume exceeds pulling. Add more rows or pulldowns to preserve scapular health.',
    };
  }
  return {
    ratio,
    status: 'pull-dominant',
    label: 'PULL HEAVY',
    cue: 'Pulling volume exceeds pressing. Solid posture support; consider adding chest/shoulder presses if desired.',
  };
};

/**
 * Evaluates Anterior (Quads) vs. Posterior (Hamstrings/Glutes) leg balance.
 */
export const evaluateLegBalance = (quadSets: number, posteriorSets: number): MovementBalance => {
  if (quadSets === 0 && posteriorSets === 0) {
    return {
      ratio: 1.0,
      status: 'insufficient-data',
      label: 'NO DATA',
      cue: 'Log lower body sets to evaluate leg balance.',
    };
  }
  const ratio = Math.round((quadSets / Math.max(1, posteriorSets)) * 100) / 100;

  if (ratio >= 0.8 && ratio <= 1.25) {
    return {
      ratio,
      status: 'balanced',
      label: 'BALANCED',
      cue: 'Optimal anterior/posterior ratio. Protects patellar tendons and knee stability.',
    };
  }
  if (ratio > 1.25) {
    return {
      ratio,
      status: 'quad-dominant',
      label: 'QUAD HEAVY',
      cue: 'Quad volume outweighs hip hinges. Add Romanian deadlifts or leg curls for hamstring balance.',
    };
  }
  return {
    ratio,
    status: 'posterior-dominant',
    label: 'POSTERIOR HEAVY',
    cue: 'Posterior chain dominant. Strong glutes/hamstrings; add squats or split squats if quad growth is lagging.',
  };
};

/**
 * Computes evidence-based hypertrophy volume landmarks and structural balance.
 */
export const computeVolumeDiagnostics = ({
  sets,
  exerciseRegions,
  from,
  to,
  periodDays,
}: {
  sets: DatedSet[];
  exerciseRegions: Record<string, { primary: MuscleRegion; secondary: MuscleRegion[] }>;
  from: ISODate;
  to: ISODate;
  periodDays: number;
}): VolumeDiagnostics => {
  const scaleToWeekly = 7 / Math.max(1, periodDays);

  // Group accumulators: key -> { direct: number, indirect: number }
  const counts = new Map<string, { direct: number; indirect: number }>();
  for (const group of MUSCLE_GROUPS) {
    counts.set(group.key, { direct: 0, indirect: 0 });
  }

  // Region to group key lookup
  const regionToGroup = new Map<MuscleRegion, string>();
  for (const group of MUSCLE_GROUPS) {
    for (const region of group.primaryRegions) {
      regionToGroup.set(region, group.key);
    }
  }

  let totalWorkingSets = 0;
  let pushDirectSets = 0;
  let pullDirectSets = 0;
  let quadDirectSets = 0;
  let posteriorDirectSets = 0;

  for (const entry of sets) {
    if (entry.date < from || entry.date > to) continue;
    if (!isWorkingSet(entry.set)) continue;

    totalWorkingSets++;

    const meta = exerciseRegions[entry.set.exerciseName];
    if (!meta) continue;

    // Primary mover
    const primaryGroupKey = regionToGroup.get(meta.primary);
    if (primaryGroupKey) {
      const current = counts.get(primaryGroupKey)!;
      current.direct += 1;

      // Track movement balance direct sets
      if (primaryGroupKey === 'chest' || primaryGroupKey === 'shoulders') {
        pushDirectSets += 1;
      } else if (primaryGroupKey === 'back') {
        pullDirectSets += 1;
      } else if (primaryGroupKey === 'quads') {
        quadDirectSets += 1;
      } else if (primaryGroupKey === 'posterior') {
        posteriorDirectSets += 1;
      }
    }

    // Secondary synergists (receive 0.5 indirect set)
    for (const sec of meta.secondary) {
      const secGroupKey = regionToGroup.get(sec);
      if (secGroupKey && secGroupKey !== primaryGroupKey) {
        const current = counts.get(secGroupKey)!;
        current.indirect += 1;
      }
    }
  }

  let optimalMusclesCount = 0;

  const muscleVolumes: MuscleGroupVolume[] = MUSCLE_GROUPS.map((def) => {
    const data = counts.get(def.key) ?? { direct: 0, indirect: 0 };
    // Direct sets + 0.5 * synergist sets, normalized to 7-day weekly rate
    const rawEffectiveWeekly = (data.direct + 0.5 * data.indirect) * scaleToWeekly;
    const effectiveWeeklySets = Math.round(rawEffectiveWeekly * 10) / 10;

    const evaluation = evaluateVolumeZone(effectiveWeeklySets, def.mev, def.mavMin, def.mavMax);
    if (evaluation.zone === 'optimal') optimalMusclesCount++;

    // Calculate progress towards MAV optimal zone (100% when at mavMin)
    const progressPct = Math.min(100, Math.round((effectiveWeeklySets / def.mavMin) * 100));

    return {
      key: def.key,
      label: def.label,
      directSets: data.direct,
      indirectSets: data.indirect,
      effectiveWeeklySets,
      mev: def.mev,
      mavMin: def.mavMin,
      mavMax: def.mavMax,
      mrv: def.mrv,
      zone: evaluation.zone,
      zoneLabel: evaluation.zoneLabel,
      zoneDescription: evaluation.zoneDescription,
      progressPct,
    };
  });

  const weeklyWorkingSets = Math.round(totalWorkingSets * scaleToWeekly * 10) / 10;
  const pushPullBalance = evaluatePushPull(pushDirectSets, pullDirectSets);
  const legBalance = evaluateLegBalance(quadDirectSets, posteriorDirectSets);

  return {
    muscleVolumes,
    pushPullBalance,
    legBalance,
    totalWorkingSets,
    weeklyWorkingSets,
    optimalMusclesCount,
  };
};
