import { describe, expect, it } from 'vitest';
import { recommendedProtein } from '../protein.ts';

const base = { weightKg: 80, bodyFatPct: 18, sex: 'male' as const, activity: 'moderate' as const };

describe('recommendedProtein', () => {
  it('gives an active person at maintenance about 1.6 g/kg', () => {
    const r = recommendedProtein({ ...base, direction: 'maintain' });
    expect(r.gPerKg).toBe(1.6);
    expect(r.grams).toBe(128);
    expect(r.leanAdjusted).toBe(false);
  });

  it('asks for more while losing, where needs rise', () => {
    expect(recommendedProtein({ ...base, direction: 'lose' }).gPerKg).toBe(2);
  });

  it('scales with activity, from 1.2 sedentary to 1.6 active', () => {
    expect(recommendedProtein({ ...base, activity: 'sedentary', direction: 'maintain' }).gPerKg).toBe(1.2);
    expect(recommendedProtein({ ...base, activity: 'light', direction: 'maintain' }).gPerKg).toBe(1.4);
    expect(recommendedProtein({ ...base, activity: 'veryActive', direction: 'gain' }).gPerKg).toBe(1.6);
  });

  it('stops scaling with fat mass above 25% body fat for men', () => {
    // 130 kg at 40%: 78 kg lean, which is 104 kg at 25%. 1.6 x 104, not 1.6 x 130.
    const r = recommendedProtein({ ...base, weightKg: 130, bodyFatPct: 40, direction: 'maintain' });
    expect(r.leanAdjusted).toBe(true);
    expect(r.referenceWeightKg).toBe(104);
    expect(r.grams).toBe(166);
    expect(r.gPerKgBodyWeight).toBeCloseTo(166.4 / 130, 2);
  });

  it('uses a higher threshold for women, whose healthy body fat is higher', () => {
    expect(recommendedProtein({ ...base, sex: 'female', bodyFatPct: 30, direction: 'maintain' }).leanAdjusted).toBe(false);
    expect(recommendedProtein({ ...base, sex: 'female', bodyFatPct: 40, direction: 'maintain' }).leanAdjusted).toBe(true);
  });

  it('scales from body weight when body fat is unknown', () => {
    const r = recommendedProtein({ ...base, bodyFatPct: null, direction: 'maintain' });
    expect(r.referenceWeightKg).toBe(80);
  });
});
