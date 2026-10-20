import { kgToLb, type ActivityLevel, type GoalDirection, type ProteinRecommendation } from '@adaptive-macros/engine';
import { displayWeight } from './format';
import type { UnitSystem } from './state/settings';

const ACTIVITY_WORDS: Record<ActivityLevel, string> = {
  sedentary: 'mostly sitting',
  light: 'lightly active',
  moderate: 'active',
  active: 'very active',
  veryActive: 'very active',
};

/**
 * One sentence on why the protein target is what it is, in the reader's own
 * units: "128 g a day: 1.6 g per kg for someone active at maintenance." When
 * high body fat lowered the reference weight it says so, because 1.6 g/kg of a
 * weight that is not theirs would otherwise look like a mistake.
 */
export const proteinExplanation = (
  protein: ProteinRecommendation,
  direction: GoalDirection,
  activity: ActivityLevel,
  units: UnitSystem,
): string => {
  const goal = direction === 'lose' ? 'losing weight' : direction === 'gain' ? 'gaining' : 'at maintenance';
  const perUnit = units === 'metric' ? `${protein.gPerKg} g per kg` : `${Math.round((protein.gPerKg / kgToLb(1)) * 100) / 100} g per lb`;
  const of = protein.leanAdjusted
    ? ` of ${Math.round(displayWeight(protein.referenceWeightKg, units))} ${units === 'metric' ? 'kg' : 'lb'}, the weight your lean mass would be at a typical body fat`
    : '';
  return `${protein.grams} g a day: ${perUnit}${of}, for someone ${ACTIVITY_WORDS[activity]} and ${goal}.`;
};
