import { describe, expect, it } from 'vitest';
import { deurenbergBodyFatPct, energyDensityKcalPerKg } from '../src/bodyComposition';

describe('energyDensityKcalPerKg', () => {
  it('matches Chow & Hall’s model at a few body-fat levels', () => {
    // ρ = ρF·ρL / (ρL + (ρF − ρL)·2/(2+F)), in MJ, times 239.006.
    const expected = (fat: number) => ((39.5 * 7.6) / (7.6 + 31.9 * (2 / (2 + fat)))) * 239.006;
    for (const fat of [5, 10, 15, 20, 30, 40]) {
      expect(energyDensityKcalPerKg(fat)).toBeCloseTo(expected(fat), 6);
    }
  });

  it('is well under 7700 for a lean body and reaches it only around 30–40 kg of fat', () => {
    expect(energyDensityKcalPerKg(10)).toBeGreaterThan(5400);
    expect(energyDensityKcalPerKg(10)).toBeLessThan(5700);
    expect(energyDensityKcalPerKg(15)).toBeCloseTo(6322, -1);
    expect(energyDensityKcalPerKg(30)).toBeLessThan(7700);
    expect(energyDensityKcalPerKg(40)).toBeGreaterThan(7700);
  });

  it('rises with fat mass and stays below pure fat', () => {
    let previous = 0;
    for (const fat of [0, 2, 5, 10, 20, 40, 80]) {
      const rho = energyDensityKcalPerKg(fat);
      expect(rho).toBeGreaterThan(previous);
      expect(rho).toBeLessThan(39.5 * 239.006);
      previous = rho;
    }
    expect(energyDensityKcalPerKg(-3)).toBe(energyDensityKcalPerKg(0));
  });
});

describe('deurenbergBodyFatPct', () => {
  it('applies the published adult equation', () => {
    // BMI 24 (75 kg, 176.8 cm), 30, male: 1.2·24 + 0.23·30 − 10.8 − 5.4 = 19.5.
    expect(deurenbergBodyFatPct(75, Math.sqrt(75 / 24) * 100, 30, 'male')).toBeCloseTo(19.5, 6);
    // The same body, female: 10.8 points higher.
    expect(deurenbergBodyFatPct(75, Math.sqrt(75 / 24) * 100, 30, 'female')).toBeCloseTo(30.3, 6);
  });

  it('stays within what the formula was fitted on', () => {
    expect(deurenbergBodyFatPct(45, 200, 18, 'male')).toBe(3);
    expect(deurenbergBodyFatPct(200, 150, 80, 'female')).toBe(60);
  });
});
