import { lbToKg } from '@adaptive-macros/engine';
import type { Milestone, MilestoneLadders } from '@adaptive-macros/engine';
import { displayWeight } from './format';
import type { UnitSystem } from './state/settings';
import { volumeComparison } from './volume';

/**
 * Which numbers count as round depends on the unit you think in.
 *
 * A hundred kilos is an occasion; 220.5 lb is not, and neither is 102.06 kg.
 * So the two ladders are written separately in the unit they belong to, and
 * the imperial one is converted at the edge — the engine only deals in kg and
 * has no opinion about which of them are worth celebrating.
 *
 * The imperial rungs are plate maths on a 45 lb bar, which is how anyone
 * lifting in pounds actually describes a weight: two plates, three plates.
 */
const METRIC_LOADS_KG = [40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 250, 300];
const IMPERIAL_LOADS_LB = [95, 135, 185, 225, 275, 315, 365, 405, 455, 495, 585, 675];

/** Lifetime volume, in kg. The first rung is already months of training. */
const VOLUME_KG = [100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000];

/**
 * Session counts.
 *
 * Starting at ten rather than one: the first workout is not an achievement,
 * it is a Tuesday, and congratulating someone for it is how these things start
 * to feel cheap.
 */
const SESSIONS = [10, 25, 50, 100, 200, 365, 500, 750, 1000];

export const laddersFor = (units: UnitSystem): MilestoneLadders => ({
  loadKg: units === 'metric' ? METRIC_LOADS_KG : IMPERIAL_LOADS_LB.map(lbToKg),
  volumeKg: VOLUME_KG,
  sessions: SESSIONS,
});

export interface MilestoneCopy {
  /** The thing itself, large. */
  figure: string;
  /** What the figure is, small and above it. */
  label: string;
  /** The claim being made, underneath. */
  detail: string;
}

const round = (value: number): string => String(Math.round(value));

/**
 * What to say about a milestone.
 *
 * Kept out of the engine so the engine stays unit-agnostic and this stays
 * testable without a renderer. Every line is written to be the sentence you
 * would actually say, which is the whole test a milestone has to pass.
 */
export const describeMilestone = (milestone: Milestone, units: UnitSystem): MilestoneCopy => {
  const unit = units === 'metric' ? 'kg' : 'lb';

  if (milestone.kind === 'load') {
    return {
      label: (milestone.exercise ?? 'That lift').toUpperCase(),
      figure: `${round(displayWeight(milestone.value, units))} ${unit}`,
      detail: 'Heavier than you have ever had on it.',
    };
  }

  if (milestone.kind === 'volume') {
    const shown = displayWeight(milestone.value, units);
    const comparison = volumeComparison(milestone.value);
    return {
      label: 'LIFTED, ALL TIME',
      figure: `${Math.round(shown).toLocaleString()} ${unit}`,
      detail:
        comparison === null
          ? 'Everything you have ever put on a bar, added up.'
          : `Everything you have ever put on a bar — ${comparison}.`,
    };
  }

  return {
    label: 'SESSIONS',
    figure: round(milestone.value),
    detail: 'Workouts finished. Most people never get here.',
  };
};
