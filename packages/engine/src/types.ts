/** Calendar day in `YYYY-MM-DD`, always in the user's local timezone. */
export type ISODate = string;

/** A single reading off the scale. Stored in kg; display units are a UI concern. */
export interface WeightEntry {
  date: ISODate;
  kg: number;
}

/**
 * Full clinical micronutrient panel, covering all essential vitamins,
 * trace minerals, electrolytes, and lipid fractions.
 */
export interface Micronutrients {
  // --- Vitamins ---
  vitaminAMcg?: number;          // Vitamin A (Retinol/Carotenoids, mcg RAE)
  vitaminCMg?: number;           // Vitamin C (Ascorbic Acid, mg)
  vitaminDIU?: number;           // Vitamin D (Cholecalciferol/Ergocalciferol, IU)
  vitaminEMg?: number;           // Vitamin E (Alpha-tocopherol, mg)
  vitaminKMcg?: number;          // Vitamin K (Phylloquinone/Menaquinone, mcg)
  thiaminB1Mg?: number;          // Vitamin B1 (Thiamin, mg)
  riboflavinB2Mg?: number;       // Vitamin B2 (Riboflavin, mg)
  niacinB3Mg?: number;           // Vitamin B3 (Niacin, mg)
  pantothenicAcidB5Mg?: number;  // Vitamin B5 (Pantothenic Acid, mg)
  pyridoxineB6Mg?: number;       // Vitamin B6 (Pyridoxine, mg)
  biotinB7Mcg?: number;          // Vitamin B7 (Biotin, mcg)
  folateB9Mcg?: number;          // Vitamin B9 (Folate / Folic Acid, mcg DFE)
  cobalaminB12Mcg?: number;      // Vitamin B12 (Cobalamin, mcg)
  cholineMg?: number;            // Choline (mg)

  // --- Minerals & Electrolytes ---
  sodiumMg?: number;             // Sodium (mg)
  potassiumMg?: number;          // Potassium (mg)
  calciumMg?: number;            // Calcium (mg)
  magnesiumMg?: number;          // Magnesium (mg)
  phosphorusMg?: number;         // Phosphorus (mg)
  ironMg?: number;               // Iron (mg)
  zincMg?: number;               // Zinc (mg)
  copperMg?: number;             // Copper (mg)
  manganeseMg?: number;          // Manganese (mg)
  seleniumMcg?: number;          // Selenium (mcg)
  iodineMcg?: number;            // Iodine (mcg)

  // --- Functional Lipids & Sugars ---
  saturatedFatG?: number;        // Saturated Fatty Acids (g)
  monounsaturatedFatG?: number;  // Monounsaturated Fatty Acids (g)
  polyunsaturatedFatG?: number;  // Polyunsaturated Fatty Acids (g)
  transFatG?: number;            // Trans Fatty Acids (g)
  cholesterolMg?: number;        // Cholesterol (mg)
  sugarG?: number;               // Total Sugars (g)
  addedSugarG?: number;          // Added Sugars (g)
}

/** Energy, macronutrients, and optional full clinical micronutrient panel. */
export interface Nutrients {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG?: number;
  micros?: Micronutrients;
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
