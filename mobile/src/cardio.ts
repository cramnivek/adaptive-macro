import type { UnitSystem, SpeedUnit } from './state/settings';

export type { SpeedUnit };
export type CardioMode = 'treadmill' | 'outside';

/** Common cardiovascular activities and stems for auto-detection */
export const CARDIO_STEMS = [
  'walk',
  'jog',
  'run',
  'sprint',
  'bike',
  'biking',
  'cycl',
  'bicycle',
  'treadmill',
  'elliptical',
  'rowing',
  'rower',
  'ergometer',
  'stair',
  'stepper',
  'hike',
  'hiking',
  'swim',
  'swimming',
  'jump rope',
  'skipping',
  'aerobic',
  'cardio',
] as const;

/** Strength or resistance movements that contain cardio words but are NOT cardio */
export const STRENGTH_EXCEPTIONS = [
  'farmer',
  'suitcase',
  'waiter',
  'lunge',
  'lunges',
  'barbell row',
  'dumbbell row',
  'cable row',
  'pendlay row',
  't-bar row',
  'bent over row',
  'chest supported row',
  'inverted row',
  'machine row',
  'seated row',
  'seal row',
  'upright row',
  'deadlift',
  'bench press',
  'squat',
  'overhead press',
  'pull up',
  'chin up',
];

/**
 * Auto-detects whether an input activity name represents a cardiovascular activity.
 *
 * e.g.: "walking", "morning walk", "jogging", "5k run", "running", "biking",
 * "cycling", "treadmill", "elliptical", "rowing" -> true
 * while "Farmer's Walk", "Barbell Row", "Cable Row", "Bench Press" -> false
 */
export const detectCardio = (name: string): boolean => {
  const lower = name.toLowerCase().trim();
  if (!lower) return false;
  if (STRENGTH_EXCEPTIONS.some((ex) => lower.includes(ex))) return false;

  return CARDIO_STEMS.some((stem) => {
    const regex = new RegExp(`(^|\\s|[-_])${stem}`, 'i');
    return regex.test(lower);
  });
};

/**
 * Detects whether the activity is more likely performed on an indoor machine
 * versus outside/distance based on the activity name.
 *
 * Indoor machines: treadmill, elliptical, rower, stair climber, stationary/spin bike.
 * Outside activities: biking/cycling, hiking, outdoor walks/runs.
 */
export const detectCardioMode = (name: string, historyMode?: CardioMode | null): CardioMode => {
  if (historyMode) return historyMode;
  const lower = name.toLowerCase().trim();
  if (!lower) return 'treadmill';

  // Explicit machine indicators take precedence (e.g. "Stationary Bike", "Indoor Cycling")
  if (
    /\b(treadmill|machine|indoor|stationary|spin|spinning|elliptical|rowing|rower|ergometer|stair|stepper|climber|skierg|assault|airdyne|peloton)\b/i.test(
      lower,
    )
  ) {
    return 'treadmill';
  }

  // Outside / distance activities
  if (
    /\b(outside|outdoor|road|trail|track|street|park|hike|hiking|bike|biking|cycling|bicycle)\b/i.test(
      lower,
    )
  ) {
    return 'outside';
  }

  return 'treadmill';
};

export const isMetricSpeed = (units: UnitSystem | SpeedUnit): boolean => units === 'metric' || units === 'kph';

export const speedUnit = (units: UnitSystem | SpeedUnit): string => (isMetricSpeed(units) ? 'kph' : 'mph');
export const distanceUnit = (_units?: UnitSystem | SpeedUnit): string => 'km';

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.609344;

/** Converts stored km/h to display speed (kph or mph). */
export const displaySpeed = (kph: number | null, units: UnitSystem | SpeedUnit): number | null => {
  if (kph == null) return null;
  return isMetricSpeed(units) ? kph : kph * KM_TO_MI;
};

/** Parses user-entered speed in active units to canonical km/h. */
export const parseSpeed = (text: string, units: UnitSystem | SpeedUnit): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return isMetricSpeed(units) ? value : value * MI_TO_KM;
};

/** Converts stored km to display distance (always km for outside distance). */
export const displayDistance = (km: number | null, _units?: UnitSystem | SpeedUnit): number | null => {
  if (km == null) return null;
  return km;
};

/** Parses user-entered distance to canonical km (always km for outside distance). */
export const parseDistance = (text: string, _units?: UnitSystem | SpeedUnit): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
};

/** Parses user-entered incline % (e.g. "2", "2.5", "5"). */
export const parseIncline = (text: string): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
};

/**
 * Parses user-typed duration into seconds.
 *
 * Supports:
 * - Direct minutes: "30" -> 1800, "30.5" -> 1830
 * - mm:ss format: "15:30" -> 930
 * - hh:mm:ss format: "1:00:00" -> 3600
 */
export const parseDurationSeconds = (text: string): number | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':').map((p) => Number.parseFloat(p));
    if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
    if (parts.length === 2) {
      return Math.round(parts[0] * 60 + parts[1]);
    }
    if (parts.length === 3) {
      return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
    }
  }
  const minutes = Number.parseFloat(trimmed.replace(',', '.'));
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.round(minutes * 60);
};

/** Formats duration in seconds for compact display: e.g. "30m", "1h 15m", "45s". */
export const formatDurationDisplay = (seconds: number | null): string => {
  if (seconds == null || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  return `${s}s`;
};

/** Formats duration in seconds for prefilling numeric minutes inputs: e.g. "30" or "30.5". */
export const durationToInputMinutes = (seconds: number | null): string => {
  if (seconds == null || seconds <= 0) return '';
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
};

/**
 * Estimates the number of steps taken over a given distance in kilometers.
 *
 * Accounts for stride length variation by speed:
 * - Walking (<= 4.5 km/h / ~2.8 mph): ~1,400 steps/km
 * - Brisk walking (4.5 - 6.5 km/h): ~1,250 steps/km
 * - Jogging (6.5 - 9.0 km/h): ~1,100 steps/km
 * - Running (9.0 - 12.0 km/h): ~980 steps/km
 * - Fast running (> 12.0 km/h): ~880 steps/km
 *
 * If speed is unknown, uses average baseline of 1,300 steps/km (~2,090 steps/mile).
 * If incline % is provided, steep uphill walking shortens stride slightly (+10-20% steps).
 */
export const estimateSteps = (
  distanceKm: number | null,
  speedKph?: number | null,
  inclinePct?: number | null,
): number | null => {
  if (distanceKm == null || distanceKm <= 0 || !Number.isFinite(distanceKm)) return null;

  let stepsPerKm = 1300;
  if (speedKph != null && speedKph > 0 && Number.isFinite(speedKph)) {
    if (speedKph <= 4.5) {
      stepsPerKm = 1400;
    } else if (speedKph <= 6.5) {
      stepsPerKm = 1250;
    } else if (speedKph <= 9.0) {
      stepsPerKm = 1100;
    } else if (speedKph <= 12.0) {
      stepsPerKm = 980;
    } else {
      stepsPerKm = 880;
    }
  }

  let inclineFactor = 1;
  if (inclinePct != null && inclinePct > 0) {
    inclineFactor = 1 + Math.min(inclinePct, 30) * 0.008;
  }

  return Math.round(distanceKm * stepsPerKm * inclineFactor);
};

/**
 * Calculates derived metrics for a treadmill session given speed, incline, and duration:
 * - Calculated distance in km: speed * (time / 60)
 * - Estimated step count
 * - Vertical elevation gain in meters: distance_m * (incline% / 100)
 */
export const calculateTreadmillMetrics = (
  speedKph: number | null,
  inclinePct: number | null,
  durationSeconds: number | null,
): {
  distanceKm: number | null;
  estimatedSteps: number | null;
  elevationGainMeters: number | null;
} => {
  if (speedKph == null || durationSeconds == null || speedKph <= 0 || durationSeconds <= 0) {
    return { distanceKm: null, estimatedSteps: null, elevationGainMeters: null };
  }

  const hours = durationSeconds / 3600;
  const distanceKm = speedKph * hours;
  const estimatedSteps = estimateSteps(distanceKm, speedKph, inclinePct);
  const elevationGainMeters =
    inclinePct != null && inclinePct > 0 ? (distanceKm * 1000 * inclinePct) / 100 : null;

  return { distanceKm, estimatedSteps, elevationGainMeters };
};

/**
 * Calculates estimated steps for any cardio entry given its parameters.
 * Supports:
 * - Outside distance with or without time (using speed-adjusted stride or baseline cadence)
 * - Treadmill speed + duration (or distance)
 * - Duration-only estimate (~105 steps/min)
 */
export const calculateCardioSteps = (params: {
  mode: CardioMode;
  speedKph?: number | null;
  inclinePct?: number | null;
  durationSeconds?: number | null;
  distanceKm?: number | null;
}): number => {
  if (params.mode === 'outside') {
    if (params.distanceKm != null && params.distanceKm > 0) {
      const speed =
        params.durationSeconds != null && params.durationSeconds > 0
          ? params.distanceKm / (params.durationSeconds / 3600)
          : null;
      return estimateSteps(params.distanceKm, speed) ?? 0;
    }
    if (params.durationSeconds != null && params.durationSeconds > 0) {
      return Math.round((params.durationSeconds / 60) * 105);
    }
    return 0;
  } else {
    // treadmill
    if (
      params.speedKph != null &&
      params.durationSeconds != null &&
      params.speedKph > 0 &&
      params.durationSeconds > 0
    ) {
      return (
        calculateTreadmillMetrics(
          params.speedKph,
          params.inclinePct ?? null,
          params.durationSeconds,
        ).estimatedSteps ?? 0
      );
    }
    if (params.distanceKm != null && params.distanceKm > 0) {
      return estimateSteps(params.distanceKm, params.speedKph, params.inclinePct) ?? 0;
    }
    if (params.durationSeconds != null && params.durationSeconds > 0) {
      return Math.round((params.durationSeconds / 60) * 105);
    }
    return 0;
  }
};

/** Formats step count nicely: e.g. "~3,200 steps" */
export const formatStepEstimate = (steps: number | null): string => {
  if (steps == null || steps <= 0) return '';
  return `~${steps.toLocaleString('en-US')} steps`;
};

/**
 * Generates an informative real-time preview label for a cardio row:
 * - Treadmill: e.g. "2.50 km · ~3,125 steps · +125m elev"
 * - Outside: e.g. "~6,500 steps · 6:00 /km"
 */
export const formatLiveCardioEstimate = (
  params: {
    mode: CardioMode;
    speedKph?: number | null;
    inclinePct?: number | null;
    durationSeconds?: number | null;
    distanceKm?: number | null;
  },
  units: UnitSystem | SpeedUnit = 'kph',
): string => {
  const parts: string[] = [];

  if (params.mode === 'treadmill') {
    const { distanceKm, estimatedSteps, elevationGainMeters } = calculateTreadmillMetrics(
      params.speedKph ?? null,
      params.inclinePct ?? null,
      params.durationSeconds ?? null,
    );

    if (distanceKm != null) {
      const dist = displayDistance(distanceKm, units);
      if (dist != null) parts.push(`${dist.toFixed(2)} ${distanceUnit(units)}`);
    }

    if (estimatedSteps != null) {
      parts.push(formatStepEstimate(estimatedSteps));
    } else if (params.durationSeconds != null && params.durationSeconds > 0) {
      const fallback = Math.round((params.durationSeconds / 60) * 105);
      parts.push(formatStepEstimate(fallback));
    }

    if (elevationGainMeters != null && elevationGainMeters > 0) {
      if (isMetricSpeed(units)) {
        parts.push(`+${Math.round(elevationGainMeters)}m elev`);
      } else {
        const feet = Math.round(elevationGainMeters * 3.28084);
        parts.push(`+${feet}ft elev`);
      }
    }
  } else {
    // outside
    const speed =
      params.distanceKm != null && params.durationSeconds != null && params.durationSeconds > 0
        ? params.distanceKm / (params.durationSeconds / 3600)
        : null;

    const steps = estimateSteps(params.distanceKm ?? null, speed);
    if (steps != null) {
      parts.push(formatStepEstimate(steps));
    } else if (params.durationSeconds != null && params.durationSeconds > 0) {
      const fallback = Math.round((params.durationSeconds / 60) * 105);
      parts.push(formatStepEstimate(fallback));
    }

    if (params.distanceKm != null && params.durationSeconds != null && params.distanceKm > 0) {
      const paceSecondsPerKm = params.durationSeconds / params.distanceKm;
      const m = Math.floor(paceSecondsPerKm / 60);
      const s = Math.round(paceSecondsPerKm % 60);
      parts.push(`${m}:${String(s).padStart(2, '0')} /km`);
    }
  }

  return parts.join(' · ');
};

/** Formats a completed or previous cardio effort for summary display. */
export const formatCardioEffort = (
  effort: {
    cardioMode?: CardioMode | null;
    speedKph?: number | null;
    inclinePct?: number | null;
    durationSeconds?: number | null;
    distanceKm?: number | null;
  },
  units: UnitSystem | SpeedUnit = 'kph',
): string => {
  const parts: string[] = [];
  if (effort.cardioMode === 'outside') {
    if (effort.distanceKm != null) {
      const dist = displayDistance(effort.distanceKm, units);
      if (dist != null) parts.push(`${dist.toFixed(1)} ${distanceUnit(units)}`);
      const steps = estimateSteps(effort.distanceKm);
      if (steps != null) parts.push(formatStepEstimate(steps));
    }
    if (effort.durationSeconds != null) {
      parts.push(formatDurationDisplay(effort.durationSeconds));
    }
  } else {
    // treadmill
    if (effort.speedKph != null) {
      const spd = displaySpeed(effort.speedKph, units);
      if (spd != null) parts.push(`${spd.toFixed(1)} ${speedUnit(units)}`);
    }
    if (effort.inclinePct != null && effort.inclinePct > 0) {
      parts.push(`${effort.inclinePct.toFixed(1)}%`);
    }
    if (effort.durationSeconds != null) {
      parts.push(formatDurationDisplay(effort.durationSeconds));
    }
    if (effort.speedKph != null && effort.durationSeconds != null) {
      const { distanceKm, estimatedSteps } = calculateTreadmillMetrics(
        effort.speedKph,
        effort.inclinePct ?? null,
        effort.durationSeconds,
      );
      if (estimatedSteps != null) {
        parts.push(formatStepEstimate(estimatedSteps));
      }
      if (distanceKm != null) {
        const dist = displayDistance(distanceKm, units);
        if (dist != null) parts.push(`(${dist.toFixed(1)} ${distanceUnit(units)})`);
      }
    }
  }
  return parts.join(' · ') || 'No data';
};
