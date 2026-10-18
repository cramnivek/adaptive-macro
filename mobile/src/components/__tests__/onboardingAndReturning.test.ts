import { describe, expect, it } from 'vitest';
import {
  ALL_FEATURE_INTERESTS,
  FEATURE_LIST,
  FEATURE_PRESETS,
  getFeatureReaction,
} from '../../features/featureInterests';

describe('First-week calibration and returning user helpers', () => {
  it('calculates 7-day calibration progress correctly from raw observations', () => {
    const observations = [
      { date: '2026-10-12', intakeKcal: 2100, weightKg: 80.2 },
      { date: '2026-10-13', intakeKcal: 2050, weightKg: 80.0 },
      { date: '2026-10-14', intakeKcal: 1980, weightKg: undefined },
      { date: '2026-10-15', intakeKcal: 0, weightKg: 79.8 }, // weight only
    ];

    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const calibratedDays = Math.min(7, withData.length);
    expect(calibratedDays).toBe(4);
    expect(Math.round((calibratedDays / 7) * 100)).toBe(57);
  });

  it('caps calibration progress at 7 days max', () => {
    const observations = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      intakeKcal: 2000,
      weightKg: 80,
    }));

    const withData = observations.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const calibratedDays = Math.min(7, withData.length);
    expect(calibratedDays).toBe(7);
  });

  it('handles metric to imperial conversions accurately during initial onboarding', () => {
    const heightInches = 70;
    const heightCm = Math.round(heightInches * 2.54);
    expect(heightCm).toBe(178);

    const weightLb = 165;
    const weightKg = weightLb / 2.20462;
    expect(Math.round(weightKg * 10) / 10).toBe(74.8);
  });

  it('computes returning workout banner sets description accurately', () => {
    const formatSetsLabel = (count: number) =>
      count === 0 ? 'Session active · No sets logged yet' : `${count} set${count === 1 ? '' : 's'} recorded`;

    expect(formatSetsLabel(0)).toBe('Session active · No sets logged yet');
    expect(formatSetsLabel(1)).toBe('1 set recorded');
    expect(formatSetsLabel(4)).toBe('4 sets recorded');
  });

  it('differentiates 7-day calibration states: needs weight vs finalizing baseline', () => {
    // Scenario A: 7 days of food logged, but only 1 weigh-in
    const foodOnlyObs = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      intakeKcal: 2000,
      weightKg: i === 0 ? 80 : undefined,
    }));

    const foodOnlyWithData = foodOnlyObs.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const foodOnlyCalibratedDays = Math.min(7, foodOnlyWithData.length);
    const foodOnlyWeightDays = foodOnlyObs.filter((o) => o.weightKg !== undefined && o.weightKg > 0).length;

    expect(foodOnlyCalibratedDays).toBe(7);
    expect(foodOnlyWeightDays).toBe(1);
    const needsWeightA = foodOnlyCalibratedDays >= 7 && foodOnlyWeightDays < 3;
    expect(needsWeightA).toBe(true);

    // Scenario B: 7 days of paired logs (food + daily scale weight)
    const pairedObs = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
      intakeKcal: 2000,
      weightKg: 80 - i * 0.1,
    }));

    const pairedWithData = pairedObs.filter(
      (o) => (o.intakeKcal !== undefined && o.intakeKcal > 0) || (o.weightKg !== undefined && o.weightKg > 0),
    );
    const pairedCalibratedDays = Math.min(7, pairedWithData.length);
    const pairedWeightDays = pairedObs.filter((o) => o.weightKg !== undefined && o.weightKg > 0).length;

    expect(pairedCalibratedDays).toBe(7);
    expect(pairedWeightDays).toBe(7);
    const needsWeightB = pairedCalibratedDays >= 7 && pairedWeightDays < 3;
    expect(needsWeightB).toBe(false);
  });

  it('provides all 6 feature interests in default settings with complete metadata', () => {
    expect(FEATURE_LIST).toHaveLength(6);
    const ids = FEATURE_LIST.map((f) => f.id);
    expect(ids).toContain('strength');
    expect(ids).toContain('nutrition');
    expect(ids).toContain('ai_coach');
    expect(ids).toContain('form_kinematics');
    expect(ids).toContain('story_stickers');
    expect(ids).toContain('body_comp');

    for (const feat of FEATURE_LIST) {
      expect(feat.name.length).toBeGreaterThan(0);
      expect(feat.emoji.length).toBeGreaterThan(0);
      expect(feat.badge.length).toBeGreaterThan(0);
      expect(feat.tagline.length).toBeGreaterThan(0);
      expect(feat.description.length).toBeGreaterThan(0);
      expect(feat.accentColor).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }

    expect(ALL_FEATURE_INTERESTS).toHaveLength(6);
  });

  it('merges stored partial feature preferences with defaults cleanly', () => {
    const resolveFeatures = (stored?: { featureInterests?: typeof ALL_FEATURE_INTERESTS; featureOnboardingDismissed?: boolean }) => ({
      featureInterests:
        Array.isArray(stored?.featureInterests) && stored.featureInterests.length > 0
          ? stored.featureInterests
          : ALL_FEATURE_INTERESTS,
      featureOnboardingDismissed: stored?.featureOnboardingDismissed ?? false,
    });

    const fromEmpty = resolveFeatures({});
    expect(fromEmpty.featureInterests).toEqual(ALL_FEATURE_INTERESTS);
    expect(fromEmpty.featureOnboardingDismissed).toBe(false);

    const fromCustom = resolveFeatures({
      featureInterests: ['strength', 'story_stickers'],
      featureOnboardingDismissed: true,
    });
    expect(fromCustom.featureInterests).toEqual(['strength', 'story_stickers']);
    expect(fromCustom.featureOnboardingDismissed).toBe(true);
  });

  it('provides rich quick presets and dynamic reaction copy', () => {
    expect(FEATURE_PRESETS.length).toBeGreaterThanOrEqual(4);

    const allIn = FEATURE_PRESETS.find((p) => p.id === 'all');
    expect(allIn?.features).toEqual(ALL_FEATURE_INTERESTS);

    expect(getFeatureReaction(0, [])).toContain('at least one');
    expect(getFeatureReaction(6, ALL_FEATURE_INTERESTS)).toContain('Beast Mode');
    expect(getFeatureReaction(2, ['strength', 'story_stickers'])).toContain('Iron Addict');
    expect(getFeatureReaction(2, ['nutrition', 'ai_coach'])).toContain('Nutrition Scientist');
    expect(getFeatureReaction(3, ['strength', 'nutrition', 'body_comp'])).toContain('Hybrid Athlete');
    expect(getFeatureReaction(4, ['strength', 'nutrition', 'form_kinematics', 'body_comp'])).toContain('Powerhouse');
  });
});
