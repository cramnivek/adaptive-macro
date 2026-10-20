import { describe, expect, it } from 'vitest';
import { deurenbergBodyFatPct, energyDensityKcalPerKg, navyBodyFatPct } from '../src/bodyComposition';

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

describe('navyBodyFatPct', () => {
  it('applies the metric Navy equations', () => {
    // Man, 178 cm, waist 85, neck 38: 495/(1.0324 − 0.19077·log10(47) + 0.15456·log10(178)) − 450.
    const man = 495 / (1.0324 - 0.19077 * Math.log10(47) + 0.15456 * Math.log10(178)) - 450;
    expect(navyBodyFatPct('male', 178, 85, 38)).toBeCloseTo(man, 6);
    expect(man).toBeGreaterThan(15);
    expect(man).toBeLessThan(20);
    // Woman, 165 cm, waist 72, hips 98, neck 33.
    const woman = 495 / (1.29579 - 0.35004 * Math.log10(137) + 0.221 * Math.log10(165)) - 450;
    expect(navyBodyFatPct('female', 165, 72, 33, 98)).toBeCloseTo(woman, 6);
    expect(woman).toBeGreaterThan(22);
    expect(woman).toBeLessThan(30);
  });

  it('rises with the waist', () => {
    expect(navyBodyFatPct('male', 178, 95, 38)!).toBeGreaterThan(navyBodyFatPct('male', 178, 85, 38)!);
  });

  it('declines measurements that cannot describe a body', () => {
    expect(navyBodyFatPct('male', 178, 38, 40)).toBeNull();
    expect(navyBodyFatPct('male', 0, 85, 38)).toBeNull();
    expect(navyBodyFatPct('female', 165, 72, 33)).toBeNull();
    expect(navyBodyFatPct('female', 165, 72, 33, null)).toBeNull();
  });

  it('clamps the extremes', () => {
    expect(navyBodyFatPct('male', 190, 40, 39)).toBe(3);
  });
});
