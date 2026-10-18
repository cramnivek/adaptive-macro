import type { ISODate } from '@adaptive-macros/engine';

export interface ParsedHealthData {
  dailySteps: Map<ISODate, number>;
  dailyWeights: Map<ISODate, number>; // in kg
  earliestDate: ISODate | null;
  latestDate: ISODate | null;
}

/**
 * Extracts date formatted as YYYY-MM-DD from an Apple Health timestamp string.
 * Example timestamps: "2026-10-18 07:30:00 +0800", "2026-10-18T07:30:00Z"
 */
const extractISODate = (raw: string): ISODate | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  if (!match) return null;
  return match[1] as ISODate;
};

/**
 * Parses Apple Health export XML text to extract daily step counts and body weights.
 * Optimized for performance with regex scanning over large XML string content.
 */
export const parseAppleHealthXml = (xmlContent: string): ParsedHealthData => {
  const dailySteps = new Map<ISODate, number>();
  const dailyWeights = new Map<ISODate, number>();

  let earliest: ISODate | null = null;
  let latest: ISODate | null = null;

  const trackDate = (d: ISODate) => {
    if (!earliest || d < earliest) earliest = d;
    if (!latest || d > latest) latest = d;
  };

  // Match <Record ... /> elements
  // We extract type, startDate (or creationDate), value, and optional unit.
  const recordRegex = /<Record\s+[^>]*?type="([^"]+)"[^>]*?startDate="([^"]+)"[^>]*?value="([^"]+)"(?:[^>]*?unit="([^"]+)")?[^>]*?>/g;

  let match: RegExpExecArray | null;
  while ((match = recordRegex.exec(xmlContent)) !== null) {
    const type = match[1];
    const dateStr = match[2];
    const valStr = match[3];
    const unitStr = match[4]?.toLowerCase();

    const date = extractISODate(dateStr);
    if (!date) continue;

    const val = parseFloat(valStr);
    if (isNaN(val) || val <= 0) continue;

    if (type === 'HKQuantityTypeIdentifierStepCount') {
      trackDate(date);
      const current = dailySteps.get(date) ?? 0;
      dailySteps.set(date, current + Math.round(val));
    } else if (type === 'HKQuantityTypeIdentifierBodyMass') {
      trackDate(date);
      // Apple Health body mass values may be in 'kg' or 'lb'/'lbs'
      let kg = val;
      if (unitStr && (unitStr.includes('lb') || unitStr === 'lbs')) {
        kg = Math.round((val * 0.45359237) * 10) / 10;
      } else {
        kg = Math.round(val * 10) / 10;
      }
      // If multiple readings exist for a day, keep the last one
      dailyWeights.set(date, kg);
    }
  }

  return {
    dailySteps,
    dailyWeights,
    earliestDate: earliest,
    latestDate: latest,
  };
};
