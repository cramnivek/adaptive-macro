import type { BodyFatSource } from '../db';

export interface BodyFatReading {
  bodyFatPct?: number | null;
  bodyFatSource?: BodyFatSource | null;
}

/**
 * Which logged body-fat figure the expenditure model should believe.
 *
 * Newest first, except that a photo estimate never displaces a figure from a
 * tape or one typed in (a scan, a smart scale). A visual read is the least
 * reliable of the three, and a figure that was logged later is not a better
 * one. Recency still decides between figures of the same standing. A photo
 * estimate is used only when there is nothing else, and is still better than
 * the BMI-based guess.
 *
 * `readings` are newest first, as `getLatestBodyMeasurements` returns them.
 */
export const chooseBodyFat = (
  readings: readonly BodyFatReading[],
): { pct: number; source: BodyFatSource } | null => {
  const withFigure = readings.filter((r) => r.bodyFatPct != null);
  const chosen = withFigure.find((r) => r.bodyFatSource !== 'photo') ?? withFigure[0];
  return chosen ? { pct: chosen.bodyFatPct!, source: chosen.bodyFatSource ?? 'entered' } : null;
};
