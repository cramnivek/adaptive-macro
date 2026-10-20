import type { ActivityLevel } from './expenditure.ts';
import type { GoalDirection, Sex } from './types.ts';
import { roundTo } from './units.ts';

/**
 * Daily protein, in grams per kilogram, by how active someone is and whether
 * they are eating below maintenance.
 *
 * Maintenance and gaining:
 * - Active (moderate and up) is 1.6. Morton et al. 2018 (BJSM, 49 trials) found
 *   no further gain in fat-free mass from resistance training beyond about 1.62
 *   g/kg/day, and the ISSN's 2017 position stand puts most exercising people at
 *   1.4–2.0.
 * - Light activity is 1.4, the bottom of the ISSN range.
 * - Sedentary is 1.2. That is above the 0.8 RDA, which is a floor against
 *   deficiency rather than a target for keeping muscle, and it is the PROT-AGE
 *   group's 1.0–1.2 for older adults.
 *
 * Losing: 0.4 more at every level. Needs rise in a deficit. Helms et al. 2014
 * put lean trained people at 2.3–3.1 g per kg of fat-free mass, which Murphy,
 * Hector and Phillips (2015) restate as about 1.8–2.7 g/kg of body weight with a
 * moderate deficit and resistance training. An active person losing gets 2.0,
 * in that range's lower half, because most people are not in the lean,
 * aggressive-cut group the top of it describes.
 *
 * There is no separate figure by sex. The evidence finds per-kilogram needs
 * much the same in women and men (a GSSI review of female athletes); what differs
 * is body composition, which the reference weight below accounts for.
 */
export const PROTEIN_G_PER_KG: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.4,
  moderate: 1.6,
  active: 1.6,
  veryActive: 1.6,
};

/** Added while losing; see PROTEIN_G_PER_KG. */
export const PROTEIN_DEFICIT_BONUS_G_PER_KG = 0.4;

/**
 * Body fat above which protein stops scaling with total weight: 25% for men,
 * 32% for women, close to the upper limits of the lean groups the studies
 * above recruited (Helms 2014 took men to 23% and women to 35%).
 *
 * Above it, protein follows the weight someone would be at this body fat with
 * the lean mass they have now. Without this, 1.6 g/kg at 130 kg and 40% fat
 * asks for 208 g, most of it "for" fat tissue that does not use it. That is
 * also why a figure from ideal body weight is not used instead: it depends on
 * height alone and ignores how muscular someone actually is.
 */
export const LEAN_REFERENCE_BODY_FAT_PCT: Record<Sex, number> = { male: 25, female: 32 };

export interface ProteinRecommendation {
  /** Grams per kg of the reference weight. */
  gPerKg: number;
  /** The weight protein is scaled from: body weight, or less when body fat is high. */
  referenceWeightKg: number;
  grams: number;
  /** The same grams per kg of actual body weight, for anything scaled that way. */
  gPerKgBodyWeight: number;
  /** True when high body fat lowered the reference below body weight. */
  leanAdjusted: boolean;
}

export const recommendedProtein = (input: {
  weightKg: number;
  /** Measured or estimated; null scales from body weight as it is. */
  bodyFatPct: number | null;
  sex: Sex;
  activity: ActivityLevel;
  direction: GoalDirection;
}): ProteinRecommendation => {
  const gPerKg =
    PROTEIN_G_PER_KG[input.activity] + (input.direction === 'lose' ? PROTEIN_DEFICIT_BONUS_G_PER_KG : 0);

  const cap = LEAN_REFERENCE_BODY_FAT_PCT[input.sex];
  const bodyFat = input.bodyFatPct;
  const leanAdjusted = bodyFat !== null && bodyFat > cap && bodyFat < 100;
  const referenceWeightKg = leanAdjusted
    ? (input.weightKg * (1 - (bodyFat as number) / 100)) / (1 - cap / 100)
    : input.weightKg;

  const grams = gPerKg * referenceWeightKg;
  return {
    gPerKg: roundTo(gPerKg, 2),
    referenceWeightKg: roundTo(referenceWeightKg, 1),
    grams: roundTo(grams),
    gPerKgBodyWeight: input.weightKg > 0 ? grams / input.weightKg : gPerKg,
    leanAdjusted,
  };
};
