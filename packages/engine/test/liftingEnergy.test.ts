import { describe, expect, it } from 'vitest';
import { liftingEnergyKcal } from '../src/liftingEnergy';

describe('liftingEnergyKcal', () => {
  it('gives the burn above resting at moderate and vigorous effort', () => {
    // 75 kg for an hour: (3.5 − 1) × 75 = 187.5 and (6 − 1) × 75 = 375.
    expect(liftingEnergyKcal(60, 75)).toEqual({ lowKcal: 190, highKcal: 380 });
    expect(liftingEnergyKcal(45, 75)).toEqual({ lowKcal: 140, highKcal: 280 });
  });

  it('declines when there is no time, no body weight, or a timer left running', () => {
    expect(liftingEnergyKcal(0, 75)).toBeNull();
    expect(liftingEnergyKcal(60, null)).toBeNull();
    expect(liftingEnergyKcal(181, 75)).toBeNull();
    expect(liftingEnergyKcal(180, 75)).not.toBeNull();
  });
});
