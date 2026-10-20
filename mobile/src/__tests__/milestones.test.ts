import { describe, expect, it } from 'vitest';
import { lbToKg } from '@adaptive-macros/engine';
import { describeMilestone, laddersFor } from '../milestones';

describe('laddersFor', () => {
  it('uses kilo rungs for someone thinking in kilos', () => {
    expect(laddersFor('metric').loadKg).toContain(100);
  });

  it('uses plate maths for someone thinking in pounds', () => {
    // 225 lb is two plates a side on a 45 lb bar, and is the number they would
    // say. 102.06 kg is not a milestone anyone has ever celebrated.
    const imperial = laddersFor('imperial').loadKg;
    expect(imperial).toContainEqual(lbToKg(225));
    expect(imperial).not.toContain(100);
  });

  it('keeps both ladders ascending, which the crossing logic relies on', () => {
    for (const units of ['metric', 'imperial'] as const) {
      const rungs = laddersFor(units).loadKg;
      expect([...rungs].sort((a, b) => a - b)).toEqual(rungs);
    }
  });

  it('does not congratulate anyone for their first session', () => {
    expect(laddersFor('metric').sessions).not.toContain(1);
  });
});

describe('describeMilestone', () => {
  it('names the lift and the weight, in the reader’s own unit', () => {
    const copy = describeMilestone(
      { kind: 'load', value: 100, exercise: 'Back Squat' },
      'metric',
    );
    expect(copy.label).toBe('BACK SQUAT');
    expect(copy.figure).toBe('100 kg');
  });

  it('converts a load back to the pounds it was defined in, without float dust', () => {
    const copy = describeMilestone(
      { kind: 'load', value: lbToKg(225), exercise: 'Deadlift' },
      'imperial',
    );
    expect(copy.figure).toBe('225 lb');
  });

  it('gives lifetime volume something you can picture', () => {
    const copy = describeMilestone({ kind: 'volume', value: 100_000 }, 'metric');
    expect(copy.figure).toContain('100,000');
    // The comparison is the part worth being pleased about.
    expect(copy.detail).toMatch(/about /);
  });

  it('survives a load milestone with no exercise rather than printing undefined', () => {
    const copy = describeMilestone({ kind: 'load', value: 100 }, 'metric');
    expect(copy.label).not.toContain('undefined');
  });

  it('states the session count plainly', () => {
    const copy = describeMilestone({ kind: 'sessions', value: 50 }, 'metric');
    expect(copy.figure).toBe('50');
    expect(copy.label).toBe('SESSIONS');
    expect(copy.context).toBeNull();
  });

  it('says what actually happened beside the round number', () => {
    expect(
      describeMilestone({ kind: 'load', value: 100, exercise: 'Squat', previous: 97.5, reached: 102.5 }, 'metric')
        .context,
    ).toBe('Today 102.5 kg · previous best 97.5 kg (+5 kg)');
    expect(
      describeMilestone({ kind: 'load', value: 80, exercise: 'Bench', previous: 0, reached: 80 }, 'metric').context,
    ).toBe('Today 80 kg · first time on this lift');
    expect(describeMilestone({ kind: 'load', value: 100, exercise: 'Squat' }, 'metric').context).toBeNull();
    expect(
      describeMilestone({ kind: 'volume', value: 100_000, previous: 98_200, reached: 101_000 }, 'metric').context,
    ).toBe('+2,800 kg today');
  });
});
