import { describe, expect, it } from 'vitest';
import { planHealthConnectImport, stepsByDay, weightsByDay } from '../healthConnectRules';

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
      loggedStepSources: new Map(),
      weights: [
        { date: '2026-10-20', kg: 76.1 },
        { date: '2026-10-21', kg: 75.68 },
      ],
      steps: [],
    });
    expect(plan.weights).toEqual([{ date: '2026-10-21', kg: 75.68 }]);
  });

  it('keeps steps typed by hand, and refreshes the ones it brought in before', () => {
    const plan = planHealthConnectImport({
      loggedWeightDates: new Set(),
      loggedStepSources: new Map([
        ['2026-10-19', 'manual'],
        ['2026-10-20', 'health_connect'],
      ]),
      weights: [],
      steps: [
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
