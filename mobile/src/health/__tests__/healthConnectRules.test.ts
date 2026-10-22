import { describe, expect, it } from 'vitest';
import { describeSync, planHealthConnectImport, stepsByDay, weightsByDay } from '../healthConnectRules';

// Days cut in UTC, so the tests do not depend on the machine's time zone.
const utcDay = (iso: string) => iso.slice(0, 10);

describe('stepsByDay', () => {
  it('reads one total per day from the daily groups, dropping empty days', () => {
    expect(
      stepsByDay([
        { startTime: '2026-10-19T00:00:00', steps: 8421 },
        { startTime: '2026-10-20T00:00:00', steps: 0 },
        { startTime: '2026-10-21T00:00:00', steps: 1203.6 },
      ]),
    ).toEqual([
      { date: '2026-10-19', steps: 8421 },
      { date: '2026-10-21', steps: 1204 },
    ]);
  });
});

describe('weightsByDay', () => {
  it('keeps the last reading of each day', () => {
    expect(
      weightsByDay(
        [
          { time: '2026-10-20T06:10:00Z', kg: 75.42 },
          { time: '2026-10-20T19:00:00Z', kg: 76.1 },
          { time: '2026-10-21T06:05:00Z', kg: 75.68 },
        ],
        utcDay,
      ),
    ).toEqual([
      { date: '2026-10-20', kg: 76.1 },
      { date: '2026-10-21', kg: 75.68 },
    ]);
  });

  it('drops readings no scale could give', () => {
    expect(weightsByDay([{ time: '2026-10-20T06:10:00Z', kg: 0 }], utcDay)).toEqual([]);
  });
});

describe('planHealthConnectImport', () => {
  it('never replaces a weigh-in already in the log', () => {
    const plan = planHealthConnectImport({
      loggedWeightDates: new Set(['2026-10-20']),
      loggedSteps: new Map(),
      weights: [
        { date: '2026-10-20', kg: 76.1 },
        { date: '2026-10-21', kg: 75.68 },
      ],
      steps: [],
    });
    expect(plan.weights).toEqual([{ date: '2026-10-21', kg: 75.68 }]);
  });

  it('keeps steps typed by hand, and refreshes the ones it brought in before only when they changed', () => {
    const plan = planHealthConnectImport({
      loggedWeightDates: new Set(),
      loggedSteps: new Map([
        ['2026-10-18', { source: 'health_connect', steps: 8000 }],
        ['2026-10-19', { source: 'manual', steps: 5000 }],
        ['2026-10-20', { source: 'health_connect', steps: 3000 }],
      ]),
      weights: [],
      steps: [
        { date: '2026-10-18', steps: 8000 },
        { date: '2026-10-19', steps: 9000 },
        { date: '2026-10-20', steps: 7100 },
        { date: '2026-10-21', steps: 1204 },
      ],
    });
    expect(plan.steps).toEqual([
      { date: '2026-10-20', steps: 7100 },
      { date: '2026-10-21', steps: 1204 },
    ]);
  });
});

describe('describeSync', () => {
  const base = { stepDays: 0, weighIns: 0, weighInsKept: 0 };

  it('says where to look when something came in', () => {
    const text = describeSync({
      stepDays: 365,
      weighIns: 31,
      weighInsKept: 10,
      found: { stepDays: 365, weighIns: 41, sources: ['Garmin Connect'], firstDay: '2025-10-22' },
    });
    expect(text.title).toBe('Health Connect synced');
    expect(text.message).toContain('from Garmin Connect');
    expect(text.message).toContain('Added 31 weigh-ins and 365 days of steps');
    expect(text.message).toContain('10 days already had a weigh-in');
    expect(text.message).toContain('Trends');
    expect(text.message).toContain('Weight tab');
  });

  it('tells an empty Health Connect from a failed sync', () => {
    const text = describeSync({ ...base, found: { stepDays: 0, weighIns: 0, sources: [], firstDay: null } });
    expect(text.title).toBe('Health Connect has no records yet');
  });

  it('says when everything found was already in the log', () => {
    const text = describeSync({
      ...base,
      weighInsKept: 5,
      found: { stepDays: 0, weighIns: 5, sources: ['Garmin Connect'], firstDay: '2026-10-17' },
    });
    expect(text.title).toBe('Already up to date');
  });
});
