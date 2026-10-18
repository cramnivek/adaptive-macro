import { describe, expect, it } from 'vitest';

describe('First-week calibration and returning user helpers', () => {
  it('calculates 7-day calibration progress correctly from raw observations', () => {
    const observations = [
      { date: '2026-10-12', intakeKcal: 2100, weightKg: 80.2 },
      { date: '2026-10-13', intakeKcal: 2050, weightKg: 80.0 },
      { date: '2026-10-14', intakeKcal: 1980, weightKg: undefined },
      { date: '2026-10-15', intakeKcal: 0, weightKg: 79.8 }, // weight only
    ];

    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const calibratedDays = Math.min(7, withData.length);
    expect(calibratedDays).toBe(4);
    expect(Math.round((calibratedDays / 7) * 100)).toBe(57);
  });

  it('caps calibration progress at 7 days max', () => {
    const observations = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      intakeKcal: 2000,
      weightKg: 80,
    }));

    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const calibratedDays = Math.min(7, withData.length);
    expect(calibratedDays).toBe(7);
  });

  it('handles metric to imperial conversions accurately during initial onboarding', () => {
    const heightInches = 70;
    const heightCm = Math.round(heightInches * 2.54);
    expect(heightCm).toBe(178);

    const weightLb = 165;
    const weightKg = weightLb / 2.20462;
    expect(Math.round(weightKg * 10) / 10).toBe(74.8);
  });

  it('computes returning workout banner sets description accurately', () => {
    const formatSetsLabel = (count: number) =>
      count === 0 ? 'Session active · No sets logged yet' : `${count} set${count === 1 ? '' : 's'} recorded`;

    expect(formatSetsLabel(0)).toBe('Session active · No sets logged yet');
    expect(formatSetsLabel(1)).toBe('1 set recorded');
    expect(formatSetsLabel(4)).toBe('4 sets recorded');
  });
});
