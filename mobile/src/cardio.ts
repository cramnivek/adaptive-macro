import type { UnitSystem } from './state/settings';

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
 * Detects whether the activity is more likely performed on a treadmill/indoor machine
 * versus outside/distance based on the name. Defaults to 'treadmill' for gym workouts.
 */
export const detectCardioMode = (name: string): CardioMode => {
  const lower = name.toLowerCase().trim();
  if (/\b(outside|outdoor|road|trail|track|street|park)\b/i.test(lower)) {
    return 'outside';
  }
  if (/\b(treadmill|indoor|machine|stationary|spin)\b/i.test(lower)) {
    return 'treadmill';
  }
  return 'treadmill';
};

export const speedUnit = (units: UnitSystem): string => (units === 'metric' ? 'km/h' : 'mph');
export const distanceUnit = (units: UnitSystem): string => (units === 'metric' ? 'km' : 'mi');

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.609344;

/** Converts stored km/h to display speed (km/h or mph). */
export const displaySpeed = (kph: number | null, units: UnitSystem): number | null => {
  if (kph == null) return null;
  return units === 'metric' ? kph : kph * KM_TO_MI;
};

/** Parses user-entered speed in active units to canonical km/h. */
export const parseSpeed = (text: string, units: UnitSystem): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return units === 'metric' ? value : value * MI_TO_KM;
};

/** Converts stored km to display distance (km or mi). */
export const displayDistance = (km: number | null, units: UnitSystem): number | null => {
  if (km == null) return null;
  return units === 'metric' ? km : km * KM_TO_MI;
};

/** Parses user-entered distance in active units to canonical km. */
export const parseDistance = (text: string, units: UnitSystem): number | null => {
  const value = Number.parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return units === 'metric' ? value : value * MI_TO_KM;
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

/** Formats a completed or previous cardio effort for summary display. */
export const formatCardioEffort = (
  effort: {
    cardioMode?: CardioMode | null;
    speedKph?: number | null;
    inclinePct?: number | null;
    durationSeconds?: number | null;
    distanceKm?: number | null;
  },
  units: UnitSystem,
): string => {
  const parts: string[] = [];
  if (effort.cardioMode === 'outside') {
    if (effort.distanceKm != null) {
      const dist = displayDistance(effort.distanceKm, units);
      if (dist != null) parts.push(`${dist.toFixed(1)} ${distanceUnit(units)}`);
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
  }
  return parts.join(' · ') || 'No data';
};
