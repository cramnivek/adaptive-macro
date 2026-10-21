import { recommendedProtein } from '@adaptive-macros/engine';
import { describe, expect, it } from 'vitest';
import { proteinExplanation } from '../proteinCopy';

describe('proteinExplanation', () => {
  it('says the grams and the rule behind them', () => {
    const r = recommendedProtein({ weightKg: 80, bodyFatPct: 18, sex: 'male', activity: 'moderate', direction: 'maintain' });
    expect(proteinExplanation(r, 'maintain', 'moderate', 'metric')).toBe(
      '128 g a day: 1.6 g per kg, for someone active and at maintenance.',
    );
  });

  it('explains a reference weight lower than body weight, in the reader’s units', () => {
    const r = recommendedProtein({ weightKg: 130, bodyFatPct: 40, sex: 'male', activity: 'moderate', direction: 'lose' });
    expect(proteinExplanation(r, 'lose', 'moderate', 'imperial')).toBe(
      '208 g a day: 0.91 g per lb of 229 lb, the weight your lean mass would be at a typical body fat, for someone active and losing weight.',
    );
  });
});
