import { describe, expect, it } from 'vitest';
import { generateWarmupRamp, roundToBarbell } from '../warmup';

describe('roundToBarbell', () => {
  it('keeps empty bar when target is at or below bar weight', () => {
    expect(roundToBarbell(40, 'imperial', 'standard')).toBe(45);
    expect(roundToBarbell(45, 'imperial', 'standard')).toBe(45);
    expect(roundToBarbell(15, 'metric', 'standard')).toBe(20);
    expect(roundToBarbell(20, 'metric', 'standard')).toBe(20);
  });

  it('rounds to 5 lb increments for imperial barbells', () => {
    expect(roundToBarbell(112.5, 'imperial', 'standard')).toBe(115);
    expect(roundToBarbell(157.5, 'imperial', 'standard')).toBe(160);
    expect(roundToBarbell(183, 'imperial', 'standard')).toBe(185);
  });

  it('rounds to 2.5 kg increments for metric barbells', () => {
    expect(roundToBarbell(51, 'metric', 'standard')).toBe(50);
    expect(roundToBarbell(51.5, 'metric', 'standard')).toBe(52.5);
    expect(roundToBarbell(74, 'metric', 'standard')).toBe(75);
  });

  it('respects light bar weight', () => {
    expect(roundToBarbell(30, 'imperial', 'light')).toBe(35);
    expect(roundToBarbell(10, 'metric', 'light')).toBe(15);
  });
});

describe('generateWarmupRamp', () => {
  it('returns empty array when target weight is at or below bar weight', () => {
    expect(generateWarmupRamp(45, 'imperial', 'standard')).toEqual([]);
    expect(generateWarmupRamp(35, 'imperial', 'standard')).toEqual([]);
    expect(generateWarmupRamp(20, 'metric', 'standard')).toEqual([]);
  });

  it('generates a 1-stage empty bar warm-up when target is very close to bar weight', () => {
    const ramp = generateWarmupRamp(55, 'imperial', 'standard');
    expect(ramp).toHaveLength(1);
    expect(ramp[0].weight).toBe(45);
    expect(ramp[0].reps).toBe(10);
    expect(ramp[0].platesLabel).toBe('Bar only');
  });

  it('generates a 4-stage warm-up ramp for 135 lb Bench Press', () => {
    const ramp = generateWarmupRamp(135, 'imperial', 'standard');
    expect(ramp.length).toBeGreaterThanOrEqual(3);
    // Starts with empty bar
    expect(ramp[0].weight).toBe(45);
    expect(ramp[0].reps).toBe(10);
    // All stages are strictly increasing and strictly below target
    for (let i = 0; i < ramp.length; i++) {
      expect(ramp[i].weight).toBeLessThan(135);
      if (i > 0) {
        expect(ramp[i].weight).toBeGreaterThan(ramp[i - 1].weight);
      }
    }
  });

  it('generates standard progressive ladder for 225 lb working weight', () => {
    const ramp = generateWarmupRamp(225, 'imperial', 'standard');
    expect(ramp).toHaveLength(5);
    expect(ramp[0].weight).toBe(45); // Empty bar
    expect(ramp[0].reps).toBe(10);
    expect(ramp[ramp.length - 1].weight).toBeLessThan(225);

    // Monotonic increase
    for (let i = 1; i < ramp.length; i++) {
      expect(ramp[i].weight).toBeGreaterThan(ramp[i - 1].weight);
    }
  });

  it('generates metric warm-up ramp for 100 kg squat', () => {
    const ramp = generateWarmupRamp(100, 'metric', 'standard');
    expect(ramp.length).toBeGreaterThanOrEqual(4);
    expect(ramp[0].weight).toBe(20); // 20 kg bar
    expect(ramp[0].reps).toBe(10);
    expect(ramp[0].platesLabel).toBe('Bar only');

    for (let i = 0; i < ramp.length; i++) {
      expect(ramp[i].weight).toBeLessThan(100);
      expect(ramp[i].stage).toBe(i + 1);
      if (i > 0) {
        expect(ramp[i].weight).toBeGreaterThan(ramp[i - 1].weight);
      }
    }
  });

  it('provides correct plate breakdown per side for each stage', () => {
    const ramp = generateWarmupRamp(225, 'imperial', 'standard');
    for (const stage of ramp) {
      if (stage.weight === 45) {
        expect(stage.perSide).toEqual([]);
        expect(stage.platesLabel).toBe('Bar only');
      } else {
        const sideSum = stage.perSide.reduce((a, b) => a + b, 0);
        expect(45 + 2 * sideSum).toBe(stage.weight);
      }
    }
  });
});
