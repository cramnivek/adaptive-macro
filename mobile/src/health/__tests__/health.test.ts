import { describe, expect, it } from 'vitest';
import { calculateDistanceKm, calculateNeatKcal } from '../neat';
import { parseAppleHealthXml } from '../appleHealthParser';

describe('NEAT and Distance calculations', () => {
  it('calculates NEAT kcal burned based on steps and body weight', () => {
    // 10,000 steps for 80kg: 10000 * 80 * 0.0005 = 400 kcal
    expect(calculateNeatKcal(10000, 80)).toBe(400);

    // 10,000 steps for 70kg: 10000 * 70 * 0.0005 = 350 kcal
    expect(calculateNeatKcal(10000, 70)).toBe(350);

    // 0 steps -> 0 kcal
    expect(calculateNeatKcal(0, 80)).toBe(0);

    // Default weight fallback
    expect(calculateNeatKcal(10000)).toBe(375);
  });

  it('calculates walking distance in km based on steps', () => {
    // Default 0.75m per step: 10,000 steps = 7.5 km
    expect(calculateDistanceKm(10000)).toBe(7.5);
    expect(calculateDistanceKm(5000)).toBe(3.8);
    expect(calculateDistanceKm(0)).toBe(0);
  });
});

describe('Apple Health XML parser', () => {
  it('extracts daily step counts and body weights from export XML', () => {
    const sampleXml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE HealthData>
      <HealthData>
        <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" startDate="2026-10-18 08:30:00 +0800" value="1250"/>
        <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" startDate="2026-10-18 12:45:00 +0800" value="3400"/>
        <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" startDate="2026-10-18 18:20:00 +0800" value="4150"/>
        <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Smart Scale" startDate="2026-10-18 07:15:00 +0800" value="81.5" unit="kg"/>
        
        <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Apple Watch" startDate="2026-10-17 14:00:00 +0800" value="8200"/>
        <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Smart Scale" startDate="2026-10-17 07:10:00 +0800" value="180.0" unit="lbs"/>
      </HealthData>
    `;

    const result = parseAppleHealthXml(sampleXml);

    // Check steps aggregation
    // 2026-10-18: 1250 + 3400 + 4150 = 8800
    expect(result.dailySteps.get('2026-10-18' as any)).toBe(8800);
    // 2026-10-17: 8200
    expect(result.dailySteps.get('2026-10-17' as any)).toBe(8200);

    // Check body weights
    // 2026-10-18: 81.5 kg
    expect(result.dailyWeights.get('2026-10-18' as any)).toBe(81.5);
    // 2026-10-17: 180 lbs -> ~81.6 kg
    expect(result.dailyWeights.get('2026-10-17' as any)).toBe(81.6);

    expect(result.earliestDate).toBe('2026-10-17');
    expect(result.latestDate).toBe('2026-10-18');
  });
});
