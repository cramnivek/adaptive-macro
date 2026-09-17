import { diffDays, eachDay } from './dates.js';
import {
  type GaussianState,
  type Matrix,
  diag,
  identity,
  predict,
  updateScalar,
} from './kalman.js';
import type { DailyObservation, ISODate, Sex, UserProfile } from './types.js';
import { KCAL_PER_KG_TISSUE } from './units.js';

/**
 * ADAPTIVE EXPENDITURE MODEL
 *
 * Total daily energy expenditure is never measured, only inferred. The one
 * equation that ties it to something observable is the energy balance:
 *
 *     Δ(body mass) = (intake − expenditure) / kcalPerKgTissue
 *
 * So expenditure is whatever number makes your logged intake consistent with
 * how your weight actually moved. Treat it as a hidden state and the whole
 * problem becomes a textbook linear Kalman filter:
 *
 *     state   x = [ trendWeightKg , expenditureKcal ]
 *     transition                 w' = w + (intake − E) / rho
 *                               E' = E              (+ process noise)
 *     observation               scale reading = w + noise
 *
 * Two properties fall out of this for free, and they are the reason this beats
 * a fixed BMR formula:
 *
 *   - Expenditure adapts. Metabolic adaptation, NEAT drifting down in a
 *     deficit, a new training block — none of it needs to be modelled by name.
 *     It shows up as the state the filter has to move to keep explaining the
 *     data.
 *   - Scale noise is separated from real change. Water, glycogen and gut
 *     contents live in the measurement noise R; only the part of a swing that
 *     persists moves the trend.
 *
 * Known limitations, stated plainly:
 *   - Under-reported intake is indistinguishable from a low expenditure. The
 *     filter believes your food log. Garbage in, confidently-wrong TDEE out.
 *   - `kcalPerKgTissue` is a constant here, but real tissue change is a
 *     shifting mix of fat, lean mass and water. A wrong value biases the
 *     expenditure estimate proportionally.
 *   - Needs roughly two weeks of reasonably complete data before the estimate
 *     is worth acting on. Check `expenditureSdKcal` rather than guessing.
 */

export interface ExpenditureModelOptions {
  /** Energy per kg of body-mass change. See KCAL_PER_KG_TISSUE. */
  kcalPerKgTissue: number;
  /**
   * Standard deviation of a single scale reading around the underlying trend,
   * in kg. This is the water/glycogen/gut-content swing, not scale precision.
   * 0.7 kg is typical for a daily weigher; raise it for someone who weighs
   * erratically or at inconsistent times.
   */
  scaleNoiseKg: number;
  /**
   * Per-day process noise on trend weight, kg. Covers real mass change that
   * the energy-balance equation does not account for. Keep small — if this is
   * large the filter explains everything with unmodelled weight change and
   * stops learning expenditure.
   */
  trendProcessNoiseKg: number;
  /**
   * Per-day standard deviation of the expenditure random walk, kcal. This is
   * the single most important tuning knob: it sets how fast the estimate is
   * allowed to chase new evidence. Higher tracks genuine metabolic change
   * sooner but wobbles more on noisy data.
   */
  expenditureVolatilityKcal: number;
  /**
   * Extra trend-weight process noise, kg, applied on days with no intake
   * logged. On those days energy balance tells us nothing, so the filter is
   * told to widen rather than to assume.
   */
  unloggedDayNoiseKg: number;
  /** Cold-start expenditure, before any data has moved it. */
  initialExpenditureKcal: number;
  /** How wrong the cold-start estimate could plausibly be, kcal. */
  initialExpenditureSdKcal: number;
  /** Expenditure is clamped to this floor so noise can never drive it absurd. */
  minExpenditureKcal: number;
}

export const DEFAULT_MODEL_OPTIONS: Omit<ExpenditureModelOptions, 'initialExpenditureKcal'> = {
  kcalPerKgTissue: KCAL_PER_KG_TISSUE,
  scaleNoiseKg: 0.7,
  trendProcessNoiseKg: 0.05,
  expenditureVolatilityKcal: 12,
  unloggedDayNoiseKg: 0.35,
  initialExpenditureSdKcal: 350,
  minExpenditureKcal: 800,
};

export interface DailyEstimate {
  date: ISODate;
  /** Filtered body weight with scale noise removed. */
  trendWeightKg: number;
  trendWeightSdKg: number;
  /** Adaptive TDEE for this day. */
  expenditureKcal: number;
  /** Uncertainty on that TDEE. Below ~100 kcal the estimate is usable. */
  expenditureSdKcal: number;
  hasWeightObservation: boolean;
  hasIntakeObservation: boolean;
}

export interface ExpenditureResult {
  /** One entry per calendar day between the first and last observation. */
  series: DailyEstimate[];
  /** The most recent day's estimate, or null when there was nothing to run on. */
  latest: DailyEstimate | null;
}

const WEIGHT_OBSERVATION_ROW = [1, 0];

/**
 * Runs the filter forward over a set of daily observations.
 *
 * Input is filled out to every calendar day in range, so a week of missed
 * weigh-ins becomes seven predict-only steps rather than one big jump — which
 * is what makes the uncertainty grow correctly across gaps.
 */
export const estimateExpenditure = (
  observations: DailyObservation[],
  options: ExpenditureModelOptions,
): ExpenditureResult => {
  const withWeight = observations.filter((o) => typeof o.weightKg === 'number');
  if (observations.length === 0 || withWeight.length === 0) {
    return { series: [], latest: null };
  }

  const ascending = (a: { date: ISODate }, b: { date: ISODate }) => diffDays(b.date, a.date);
  const sorted = [...observations].sort(ascending);
  const byDate = new Map(sorted.map((o) => [o.date, o]));

  // The series starts at the first weigh-in, not the first log. Intake
  // recorded before any scale reading has no anchor to be reconciled against,
  // so including those days would only widen the covariance for nothing.
  const weighIns = [...withWeight].sort(ascending);
  const days = eachDay(weighIns[0].date, sorted[sorted.length - 1].date);

  const rho = options.kcalPerKgTissue;
  const measurementVariance = options.scaleNoiseKg ** 2;

  // Seed the trend on the first actual scale reading; seeding on a formula
  // would make the first days' output an artefact of the formula, not of data.
  const firstWeight = weighIns[0].weightKg as number;

  let state: GaussianState = {
    x: [firstWeight, options.initialExpenditureKcal],
    P: diag([measurementVariance, options.initialExpenditureSdKcal ** 2]),
  };

  const loggedTransition: Matrix = [
    [1, -1 / rho],
    [0, 1],
  ];
  const loggedProcessNoise = diag([
    options.trendProcessNoiseKg ** 2,
    options.expenditureVolatilityKcal ** 2,
  ]);
  // No intake log means no energy-balance link for that day, so the transition
  // is the identity and only the uncertainty grows.
  const unloggedProcessNoise = diag([
    options.trendProcessNoiseKg ** 2 + options.unloggedDayNoiseKg ** 2,
    options.expenditureVolatilityKcal ** 2,
  ]);

  const series: DailyEstimate[] = [];

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const observation = byDate.get(date);
    const weightKg = observation?.weightKg;
    const intakeKcal = observation?.intakeKcal;

    if (typeof weightKg === 'number') {
      state = updateScalar(state, WEIGHT_OBSERVATION_ROW, weightKg, measurementVariance);
    }

    if (state.x[1] < options.minExpenditureKcal) state.x[1] = options.minExpenditureKcal;

    series.push({
      date,
      trendWeightKg: state.x[0],
      trendWeightSdKg: Math.sqrt(Math.max(state.P[0][0], 0)),
      expenditureKcal: state.x[1],
      expenditureSdKcal: Math.sqrt(Math.max(state.P[1][1], 0)),
      hasWeightObservation: typeof weightKg === 'number',
      hasIntakeObservation: typeof intakeKcal === 'number',
    });

    if (i === days.length - 1) break;

    if (typeof intakeKcal === 'number') {
      state = predict(state, loggedTransition, loggedProcessNoise, [intakeKcal / rho, 0]);
    } else {
      state = predict(state, identity(2), unloggedProcessNoise, [0, 0]);
    }
  }

  return { series, latest: series[series.length - 1] ?? null };
};

export type ActivityLevel =
  | 'sedentary'
  | 'light'
  | 'moderate'
  | 'active'
  | 'veryActive';

/** Harris-Benedict style multipliers applied to BMR. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
};

/** Mifflin-St Jeor resting metabolic rate, kcal/day. */
export const mifflinStJeorBmr = (
  weightKg: number,
  heightCm: number,
  age: number,
  sex: Sex,
): number =>
  10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);

/**
 * Cold-start expenditure for a user with no logged history yet.
 *
 * This is only ever a seed. Once two weeks of data exist the filter's own
 * estimate should be trusted over this, because this number is a population
 * average and the filter's is measured on the individual.
 */
export const seedExpenditure = (
  profile: UserProfile,
  weightKg: number,
  activity: ActivityLevel,
): number =>
  mifflinStJeorBmr(weightKg, profile.heightCm, profile.age, profile.sex) *
  ACTIVITY_MULTIPLIERS[activity];

export type EstimateConfidence = 'insufficient' | 'low' | 'moderate' | 'high';

/**
 * Turns the filter's expenditure uncertainty into something a UI can show.
 *
 * Thresholds are in kcal of standard deviation and are chosen against what the
 * number gets used for: targets move in ~100 kcal steps, so an estimate within
 * ~75 kcal is as good as exact for that purpose, and one past ~250 kcal cannot
 * distinguish a 500 kcal deficit from a 250 kcal one.
 */
export const expenditureConfidence = (sdKcal: number): EstimateConfidence => {
  if (sdKcal >= 250) return 'insufficient';
  if (sdKcal >= 150) return 'low';
  if (sdKcal >= 75) return 'moderate';
  return 'high';
};
