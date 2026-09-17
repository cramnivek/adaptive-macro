import { diffDays, eachDay } from './dates';
import {
  type FilterStep,
  type GaussianState,
  type Matrix,
  diag,
  identity,
  predict,
  rtsSmooth,
  updateScalar,
} from './kalman';
import type { DailyObservation, ISODate, Sex, UserProfile } from './types';
import { KCAL_PER_KG_TISSUE } from './units';

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
  /**
   * How many standard deviations a scale reading may sit from the prediction
   * before it is treated as suspect, in units of the innovation's own standard
   * deviation. Beyond this the reading is downweighted rather than discarded,
   * in proportion to how extreme it is.
   *
   * 3 is deliberately permissive. Real weight moves fast sometimes — a first
   * week of glycogen depletion, a salty meal, a long flight — and those are
   * signal, not error. What this catches is the reading that is simply wrong:
   * weighing clothed, a different scale, someone else stepping on.
   */
  outlierSigma: number;
}

export const DEFAULT_MODEL_OPTIONS: Omit<ExpenditureModelOptions, 'initialExpenditureKcal'> = {
  kcalPerKgTissue: KCAL_PER_KG_TISSUE,
  scaleNoiseKg: 0.7,
  trendProcessNoiseKg: 0.05,
  expenditureVolatilityKcal: 12,
  unloggedDayNoiseKg: 0.35,
  initialExpenditureSdKcal: 350,
  minExpenditureKcal: 800,
  outlierSigma: 3,
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
  /**
   * True when this day's scale reading sat far enough from the prediction to be
   * downweighted. Surfaced so the UI can mark it rather than quietly discount
   * a number the user can see they entered.
   */
  weightOutlier: boolean;
}

export interface ExpenditureResult {
  /**
   * One entry per calendar day, smoothed. This is what to display: every past
   * day has been re-estimated knowing what came after it, so the trend does not
   * lag and a change in expenditure sits where it actually happened.
   */
  series: DailyEstimate[];
  /**
   * The same days as the forward filter saw them, using only data up to each
   * day. Useful for asking "what would this have said at the time"; not what
   * you want on a chart.
   */
  filtered: DailyEstimate[];
  /**
   * The most recent day. Identical in both passes, since nothing follows it —
   * smoothing sharpens history, it does not change today's number.
   */
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
    return { series: [], filtered: [], latest: null };
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

  const filtered: DailyEstimate[] = [];
  const steps: FilterStep[] = [];

  for (let i = 0; i < days.length; i++) {
    const date = days[i];
    const observation = byDate.get(date);
    const weightKg = observation?.weightKg;
    const intakeKcal = observation?.intakeKcal;

    let isOutlier = false;

    if (typeof weightKg === 'number') {
      // Measure the surprise before accepting the reading. The innovation
      // variance already accounts for how uncertain the filter currently is,
      // so early on — when it barely knows your weight — almost nothing counts
      // as an outlier, which is the right way round.
      const trial = updateScalar(state, WEIGHT_OBSERVATION_ROW, weightKg, measurementVariance);
      const normalisedResidual = Math.abs(trial.innovation) / Math.sqrt(trial.innovationVariance);

      if (normalisedResidual > options.outlierSigma) {
        isOutlier = true;
        // Inflate the measurement noise by the square of how far past the
        // threshold it sits. The reading still moves the estimate, but by
        // progressively less the more absurd it is, so a genuine fast change
        // is absorbed over a few days instead of being thrown away.
        const inflation = (normalisedResidual / options.outlierSigma) ** 2;
        state = updateScalar(
          state,
          WEIGHT_OBSERVATION_ROW,
          weightKg,
          measurementVariance * inflation,
        );
      } else {
        state = { x: trial.x, P: trial.P };
      }
    }

    if (state.x[1] < options.minExpenditureKcal) state.x[1] = options.minExpenditureKcal;

    filtered.push({
      date,
      trendWeightKg: state.x[0],
      trendWeightSdKg: Math.sqrt(Math.max(state.P[0][0], 0)),
      expenditureKcal: state.x[1],
      expenditureSdKcal: Math.sqrt(Math.max(state.P[1][1], 0)),
      hasWeightObservation: typeof weightKg === 'number',
      hasIntakeObservation: typeof intakeKcal === 'number',
      weightOutlier: isOutlier,
    });

    if (i === days.length - 1) {
      steps.push({ filtered: state });
      break;
    }

    const transition = typeof intakeKcal === 'number' ? loggedTransition : identity(2);
    const processNoise =
      typeof intakeKcal === 'number' ? loggedProcessNoise : unloggedProcessNoise;
    const control = typeof intakeKcal === 'number' ? [intakeKcal / rho, 0] : [0, 0];

    const predicted = predict(state, transition, processNoise, control);
    steps.push({ filtered: state, predicted, F: transition });
    state = predicted;
  }

  // Backward pass: re-estimate every past day in light of what followed it.
  const smoothedStates = rtsSmooth(steps);
  const series = filtered.map((day, i) => {
    const smoothed = smoothedStates[i];
    if (!smoothed) return day;
    return {
      ...day,
      trendWeightKg: smoothed.x[0],
      trendWeightSdKg: Math.sqrt(Math.max(smoothed.P[0][0], 0)),
      expenditureKcal: Math.max(smoothed.x[1], options.minExpenditureKcal),
      expenditureSdKcal: Math.sqrt(Math.max(smoothed.P[1][1], 0)),
    };
  });

  return { series, filtered, latest: series[series.length - 1] ?? null };
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
