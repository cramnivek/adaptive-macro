import { describe, expect, it } from 'vitest';
import { axisDecimals, displayWeight, formatDayMonth, parseWeight, weightUnit } from '../format';

describe('formatDayMonth', () => {
  it('gives the day and the month, and nothing else', () => {
    expect(formatDayMonth('2026-10-02')).toBe('2 Oct');
  });

  it('does not pad the day, which would waste axis width', () => {
    expect(formatDayMonth('2026-01-05')).toBe('5 Jan');
  });

  it('tells two dates in different months apart', () => {
    // The whole point: ninety days of axis needs two labels that differ.
    expect(formatDayMonth('2026-07-14')).not.toBe(formatDayMonth('2026-10-12'));
  });

  it('reads the date as UTC, so a local timezone cannot shift it a day', () => {
    expect(formatDayMonth('2026-03-01')).toBe('1 Mar');
    expect(formatDayMonth('2026-12-31')).toBe('31 Dec');
  });
});

describe('axisDecimals', () => {
  it('drops decimals entirely on a wide range', () => {
    expect(axisDecimals(40)).toBe(0);
  });

  it('keeps one decimal on an ordinary range', () => {
    expect(axisDecimals(5)).toBe(1);
  });

  it('goes to two when the span is small enough that one would repeat', () => {
    // 200 g across the window: at one decimal every tick reads the same.
    expect(axisDecimals(0.2)).toBe(2);
  });

  it('does not return something unusable for a flat or invalid span', () => {
    expect(axisDecimals(0)).toBe(1);
    expect(axisDecimals(Number.NaN)).toBe(1);
  });
});

describe('weight conversion and unit toggling', () => {
  it('converts weight between metric and imperial correctly', () => {
    expect(weightUnit('metric')).toBe('kg');
    expect(weightUnit('imperial')).toBe('lb');

    // 100 kg in metric
    expect(displayWeight(100, 'metric')).toBe(100);
    // 100 kg in imperial (~220.46 lb)
    expect(Number(displayWeight(100, 'imperial').toFixed(1))).toBe(220.5);

    // Parsing 100 in metric gives 100 kg
    expect(parseWeight('100', 'metric')).toBe(100);
    // Parsing 220.5 in imperial gives ~100 kg
    const parsedKg = parseWeight('220.5', 'imperial');
    expect(parsedKg).not.toBeNull();
    expect(Math.round(parsedKg!)).toBe(100);
  });
});
