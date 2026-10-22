import { describe, expect, it } from 'vitest';
import type { LogEntry } from '@adaptive-macros/engine';
import { dailySodiumObservations, weightContext, type DailySodiumObservation } from '../weightContext';

const day = (date: string, sodiumMg = 2000): DailySodiumObservation => ({
  date, sodiumMg, complete: true, foodCount: 2, knownSodiumCount: 2,
});
const baseline = [day('2026-10-15', 1800), day('2026-10-18', 2000), day('2026-10-20', 2200)];
const sodium = () => [...baseline, day('2026-10-21', 3000)];
const weights = [{ date: '2026-10-22', kg: 80.4 }, { date: '2026-10-21', kg: 80 }];

describe('weightContext', () => {
  it('returns dated observed amounts when both inclusive display thresholds are met', () => {
    expect(weightContext('2026-10-22', weights, sodium())).toEqual({
      date: '2026-10-22', weightKg: 80.4,
      previousDate: '2026-10-21', previousWeightKg: 80,
      sodiumDate: '2026-10-21', sodiumMg: 3000,
      baselineSodiumMg: 2000, baselineDates: ['2026-10-15', '2026-10-18', '2026-10-20'],
    });
  });

  it.each([80, 79, 80.399])('hides a weight rise below 0.5%% (%s kg)', (kg) => {
    expect(weightContext('2026-10-22', [{ date: '2026-10-22', kg }, weights[1]], sodium())).toBeNull();
  });

  it('hides sodium below the 1000 mg difference without rounding it up', () => {
    expect(weightContext('2026-10-22', weights, [...baseline, day('2026-10-21', 2999.9)])).toBeNull();
  });

  it.each([
    { complete: false }, { complete: undefined }, { sodiumMg: undefined },
    { knownSodiumCount: 1 }, { knownSodiumCount: 0 }, { foodCount: 0, knownSodiumCount: 0 },
    { sodiumMg: NaN }, { sodiumMg: Infinity }, { sodiumMg: -1 },
  ])('hides an unsupported preceding day: %j', (patch) => {
    expect(weightContext('2026-10-22', weights, [...baseline, { ...day('2026-10-21', 4000), ...patch } as DailySodiumObservation])).toBeNull();
  });

  it('requires three qualifying baseline days, with missing coverage and incomplete days excluded', () => {
    expect(weightContext('2026-10-22', weights, [
      baseline[0], baseline[1], { ...baseline[2], complete: false },
      { ...day('2026-10-19'), knownSodiumCount: 1 }, day('2026-10-21', 4000),
    ])).toBeNull();
  });

  it('excludes dates older than seven days, the preceding day, current day and future days from baseline', () => {
    expect(weightContext('2026-10-22', weights, [
      baseline[1], baseline[2], day('2026-10-14'), day('2026-10-21', 4000),
      day('2026-10-22'), day('2026-10-23'),
    ])).toBeNull();
  });

  it('uses the median of an even baseline, independent of input ordering', () => {
    const result = weightContext('2026-10-22', [...weights].reverse(), [
      day('2026-10-19', 10000), day('2026-10-21', 3100), ...baseline.slice().reverse(),
    ]);
    expect(result?.baselineSodiumMg).toBe(2100);
  });

  it('compares the most recent earlier weigh-in rather than choosing a larger rise', () => {
    expect(weightContext('2026-10-22', [
      weights[0], { date: '2026-10-19', kg: 79 }, { date: '2026-10-21', kg: 80.3 },
    ], sodium())).toBeNull();
  });

  it('allows a three-day comparison but never one four days ago', () => {
    expect(weightContext('2026-10-22', [weights[0], { date: '2026-10-19', kg: 80 }], sodium())).not.toBeNull();
    expect(weightContext('2026-10-22', [weights[0], { date: '2026-10-18', kg: 80 }], sodium())).toBeNull();
  });

  it('requires a weigh-in on the selected day and an earlier one, ignoring future weights', () => {
    expect(weightContext('2026-10-22', [weights[1]], sodium())).toBeNull();
    expect(weightContext('2026-10-22', [weights[0], { date: '2026-10-23', kg: 79 }], sodium())).toBeNull();
  });

  it('requires sodium from the immediately preceding day', () => {
    expect(weightContext('2026-10-22', weights, [...baseline, day('2026-10-19', 4000)])).toBeNull();
  });

  it('accepts known zero sodium baseline days', () => {
    expect(weightContext('2026-10-22', weights, [
      ...baseline.map((d) => ({ ...d, sodiumMg: 0 })), day('2026-10-21', 1000),
    ])?.baselineSodiumMg).toBe(0);
  });
});

describe('dailySodiumObservations', () => {
  const entry = (date: string, sodiumMg?: number): Pick<LogEntry, 'date' | 'nutrients'> => ({
    date, nutrients: { kcal: 100, proteinG: 0, carbsG: 0, fatG: 0, micros: sodiumMg === undefined ? undefined : { sodiumMg } },
  });

  it('totals stored portion sodium and preserves known zero rather than scaling it again', () => {
    expect(dailySodiumObservations([
      entry('2026-10-21', 1500), entry('2026-10-21', 700), entry('2026-10-21', 0),
    ], new Map([['2026-10-21', true]]))).toEqual([
      { date: '2026-10-21', complete: true, foodCount: 3, knownSodiumCount: 3, sodiumMg: 2200 },
    ]);
  });

  it('does not turn partially known sodium into a full-day total', () => {
    expect(dailySodiumObservations([
      entry('2026-10-21', 3000), entry('2026-10-21'),
    ], new Map([['2026-10-21', true]]))[0]).toEqual({
      date: '2026-10-21', complete: true, foodCount: 2, knownSodiumCount: 1, sodiumMg: undefined,
    });
  });

  it('requires an explicit complete answer and does not invent empty fasting days', () => {
    const result = dailySodiumObservations([
      entry('2026-10-20', 100), entry('2026-10-21', 200),
    ], new Map([['2026-10-20', false], ['2026-10-19', true]]));
    expect(result.map((d) => [d.date, d.complete])).toEqual([
      ['2026-10-20', false], ['2026-10-21', false],
    ]);
  });

  it.each([NaN, Infinity, -1])('treats invalid stored sodium as unknown (%s)', (value) => {
    expect(dailySodiumObservations([entry('2026-10-21', value)], new Map())[0]?.knownSodiumCount).toBe(0);
  });
});
