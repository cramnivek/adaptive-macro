/** Calendar day in `YYYY-MM-DD`, always in the user's local timezone. */
export type ISODate = string;

/** A single reading off the scale. Stored in kg; display units are a UI concern. */
export interface WeightEntry {
  date: ISODate;
  kg: number;
}

/** Energy and macronutrients. Macros are grams. */
export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
}

/** What the user actually ate on a given day, already summed across entries. */
export interface DailyIntake {
  date: ISODate;
  nutrients: Nutrients;
}

/**
 * One day of the filter's input. Either field may be missing: people skip
 * weigh-ins and forget to log, and the estimator has to survive both.
 */
export interface DailyObservation {
  date: ISODate;
  weightKg?: number;
  intakeKcal?: number;
}

export type Sex = 'male' | 'female';

export interface UserProfile {
  sex: Sex;
  /** Years. Used only for the cold-start BMR estimate. */
  age: number;
  heightCm: number;
}

export type GoalDirection = 'lose' | 'maintain' | 'gain';

export interface Goal {
  direction: GoalDirection;
  /**
   * Desired rate of body-weight change, kg per week, always positive.
   * Ignored when direction is 'maintain'.
   */
  rateKgPerWeek: number;
}
