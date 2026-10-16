import { describe, expect, it } from 'vitest';
import { describeFormula, describePlates, platesFor, totalFromPlates, usesBarbell } from '../plates';

describe('platesFor', () => {
  it('loads a round kilo weight with the fewest plates', () => {
    // 100 kg: 40 a side on a 20 kg bar.
    expect(platesFor(100, 'metric', 'standard')).toEqual({ bar: 20, perSide: [25, 15], loaded: 100, belowBar: false });
  });

  it('uses the small change plates down to 1.25', () => {
    expect(platesFor(62.5, 'metric', 'standard').perSide).toEqual([20, 1.25]);
    expect(platesFor(87.5, 'metric', 'standard').perSide).toEqual([25, 5, 2.5, 1.25]);
  });

  it('works in pounds on pound plates', () => {
    // 225 lb: two 45s a side on a 45 lb bar.
    expect(platesFor(225, 'imperial', 'standard').perSide).toEqual([45, 45]);
    expect(platesFor(135, 'imperial', 'standard').perSide).toEqual([45]);
    expect(platesFor(185, 'imperial', 'standard').perSide).toEqual([45, 25]);
  });

  it('takes the lighter bar into account', () => {
    expect(platesFor(55, 'metric', 'light')).toMatchObject({ bar: 15, perSide: [20] });
    expect(platesFor(95, 'imperial', 'light')).toMatchObject({ bar: 35, perSide: [25, 5] });
  });

  it('is just the bar at the bar’s own weight', () => {
    expect(platesFor(20, 'metric', 'standard')).toEqual({ bar: 20, perSide: [], loaded: 20, belowBar: false });
  });

  it('says when a weight is lighter than the empty bar, rather than inventing negative plates', () => {
    expect(platesFor(12, 'metric', 'standard')).toMatchObject({ perSide: [], belowBar: true });
  });

  it('reports the closest weight under the ask when it cannot be made exactly', () => {
    // 101 kg needs 40.5 a side; 1.25s cannot make the half kilo.
    const load = platesFor(101, 'metric', 'standard');
    expect(load.perSide).toEqual([25, 15]);
    expect(load.loaded).toBe(100);
  });

  it('is not thrown by float dust in a converted weight', () => {
    // 102.5 typed after a kg/lb round trip can arrive as 102.49999999.
    expect(platesFor(102.49999999, 'metric', 'standard').perSide).toEqual([25, 15, 1.25]);
  });
});

describe('usesBarbell', () => {
  it('recognises barbell lifts however they are named', () => {
    expect(usesBarbell('Bench Press (Barbell)')).toBe(true);
    expect(usesBarbell('Barbell Back Squat')).toBe(true);
    expect(usesBarbell('BB Row')).toBe(true);
  });

  it('leaves out bars whose weight it cannot know', () => {
    expect(usesBarbell('Squat (Smith Machine)')).toBe(false);
    expect(usesBarbell('Smith Machine Barbell Squat')).toBe(false);
    expect(usesBarbell('Trap Bar Deadlift')).toBe(false);
    expect(usesBarbell('EZ Barbell Curl')).toBe(false);
  });

  it('leaves out everything that is not a barbell', () => {
    expect(usesBarbell('Incline Dumbbell Press')).toBe(false);
    expect(usesBarbell('Lat Pulldown (Cable)')).toBe(false);
    expect(usesBarbell('Pull Up')).toBe(false);
  });
});

describe('describePlates', () => {
  it('lists the plates for one side', () => {
    expect(describePlates([25, 10, 2.5])).toBe('25 + 10 + 2.5');
  });
});

describe('loading order', () => {
  it('reaches for the biggest plate first, as a lifter does, even when another mix is shorter', () => {
    // 165 lb is 60 a side: 45 + 10 + 5, not 35 + 25.
    expect(platesFor(165, 'imperial', 'standard').perSide).toEqual([45, 10, 5]);
  });
});

describe('totalFromPlates', () => {
  it('calculates standard barbell with symmetrical plates', () => {
    // 45 bar + 2 * (45 + 25 + 10) = 45 + 160 = 205 lb
    expect(totalFromPlates([45, 25, 10], 'imperial', 'standard')).toBe(205);
    // 20 kg bar + 2 * (25 + 15) = 20 + 80 = 100 kg
    expect(totalFromPlates([25, 15], 'metric', 'standard')).toBe(100);
  });

  it('accounts for light bar', () => {
    // 35 bar + 2 * (25 + 5) = 35 + 60 = 95 lb
    expect(totalFromPlates([25, 5], 'imperial', 'light')).toBe(95);
    // 15 bar + 2 * (20) = 55 kg
    expect(totalFromPlates([20], 'metric', 'light')).toBe(55);
  });

  it('returns empty bar weight when no plates are on the bar', () => {
    expect(totalFromPlates([], 'imperial', 'standard')).toBe(45);
    expect(totalFromPlates([], 'metric', 'standard')).toBe(20);
    expect(totalFromPlates([], 'imperial', 'light')).toBe(35);
    expect(totalFromPlates([], 'metric', 'light')).toBe(15);
  });

  it('handles small change plates and avoids float dust', () => {
    // 20 + 2 * (20 + 1.25) = 62.5 kg
    expect(totalFromPlates([20, 1.25], 'metric', 'standard')).toBe(62.5);
  });
});

describe('describeFormula', () => {
  it('explains the empty bar', () => {
    expect(describeFormula([], 'imperial', 'standard')).toBe('45 lb bar only');
    expect(describeFormula([], 'metric', 'standard')).toBe('20 kg bar only');
  });

  it('formats the symmetrical formula with 1 side multiplied by 2', () => {
    expect(describeFormula([45, 25, 10], 'imperial', 'standard')).toBe(
      '45 lb bar + 2 × (45 + 25 + 10) lb',
    );
    expect(describeFormula([25, 15], 'metric', 'standard')).toBe(
      '20 kg bar + 2 × (25 + 15) kg',
    );
  });
});

describe('custom plates', () => {
  it('incorporates custom plate sizes into the loading breakdown', () => {
    // 75 lb on 45 lb bar = 30 lb total plates = 15 lb per side.
    // Standard plates would use 10 + 5.
    // With custom 15 lb plate, it uses 15.
    expect(platesFor(75, 'imperial', 'standard', [15]).perSide).toEqual([15]);
  });

  it('supports fractional microplates in metric', () => {
    // 21 kg on 20 kg bar = 1 kg total plates = 0.5 kg per side.
    expect(platesFor(21, 'metric', 'standard', [0.5]).perSide).toEqual([0.5]);
  });
});

