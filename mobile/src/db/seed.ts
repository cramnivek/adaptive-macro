import type { Food, ISODate, Meal } from '@adaptive-macros/engine';
import { KCAL_PER_KG_TISSUE, addDays, scaleNutrients, simulate, todayISO } from '@adaptive-macros/engine';
import { getDb, readSetting, saveFood, writeSetting } from './index';

/** Dates the seeder wrote weigh-ins to, so a later clear can undo exactly those. */
const SEEDED_DATES_KEY = 'demo.seededWeightDates';

/**
 * Demo data.
 *
 * The estimator needs a couple of weeks of history before it says anything, and
 * the charts have nothing to draw until then — so a fresh install looks broken
 * even when it is working perfectly. This generates a believable history so the
 * app can be seen working before committing to weeks of real logging.
 *
 * Everything here is clearly labelled "Demo" and removable in one tap. It is
 * never invoked automatically.
 */

const DEMO_PREFIX = 'demo:';

/**
 * Stand-in meals with realistic energy densities, so logged portions come out
 * as plausible gram amounts rather than the absurd figures you would get from
 * a single 100-kcal-per-100 g placeholder food.
 */
const DEMO_FOODS: (Food & { share: number; meal: Meal })[] = [
  {
    id: `${DEMO_PREFIX}breakfast`,
    name: 'Demo breakfast — oats, milk, berries',
    source: 'custom',
    per100g: { kcal: 150, proteinG: 6, carbsG: 22, fatG: 3.5, fiberG: 2.4 },
    portions: [{ label: '100 g', grams: 100 }],
    share: 0.25,
    meal: 'breakfast',
  },
  {
    id: `${DEMO_PREFIX}lunch`,
    name: 'Demo lunch — chicken, rice, vegetables',
    source: 'custom',
    per100g: { kcal: 165, proteinG: 12, carbsG: 18, fatG: 4.5, fiberG: 1.8 },
    portions: [{ label: '100 g', grams: 100 }],
    share: 0.35,
    meal: 'lunch',
  },
  {
    id: `${DEMO_PREFIX}dinner`,
    name: 'Demo dinner — salmon, potatoes, salad',
    source: 'custom',
    per100g: { kcal: 180, proteinG: 11, carbsG: 14, fatG: 8, fiberG: 2.1 },
    portions: [{ label: '100 g', grams: 100 }],
    share: 0.4,
    meal: 'dinner',
  },
];

export interface DemoOptions {
  days: number;
  seed: number;
}

export const DEFAULT_DEMO: DemoOptions = { days: 120, seed: 2026 };

/**
 * Builds the synthetic history.
 *
 * The shape is chosen to exercise the parts of the estimator that a flat
 * textbook example would not:
 *
 *   - Expenditure drifts down about 150 kcal over the period, the way it really
 *     does in a sustained deficit. A fixed-BMR app cannot see this; the whole
 *     point of the filter is that it can.
 *   - Intake runs higher at weekends, so the trend has to survive a weekly
 *     rhythm rather than a constant.
 *   - Weigh-ins are missed at weekends and for one solid week, so the gap
 *     handling is visible in the uncertainty band rather than only in tests.
 */
const buildHistory = ({ days, seed }: DemoOptions) => {
  const startDate: ISODate = addDays(todayISO(), -(days - 1));

  return simulate({
    startDate,
    days,
    startKg: 88,
    // Adaptation: a steady slide, not a step, plus a small monthly ripple.
    tdeeOn: (day) => 2900 - 150 * (day / days) + 25 * Math.sin(day / 14),
    // Weekends run about 400 kcal higher, which is what most people's do.
    intakeOn: (day) => (day % 7 >= 5 ? 2780 : 2340),
    kcalPerKgTissue: KCAL_PER_KG_TISSUE,
    scaleNoiseSdKg: 0.65,
    seed,
    // A week away with no scale, plus the usual skipped Sundays.
    skipWeightOn: (day) => (day >= days - 70 && day < days - 63) || day % 7 === 6,
    // The odd forgotten day.
    skipIntakeOn: (day) => day % 23 === 0,
  });
};

/**
 * Writes a generated history into the database.
 *
 * Runs as one transaction: several hundred inserts committed individually would
 * be slow on device, and a half-written history would leave the estimator
 * reconciling intake against weigh-ins that never arrived.
 */
export const seedDemoData = async (options: DemoOptions = DEFAULT_DEMO): Promise<number> => {
  const { days: history } = buildHistory(options);
  const db = await getDb();

  for (const food of DEMO_FOODS) await saveFood(food);

  const seededDates: ISODate[] = [];

  await db.withTransactionAsync(async () => {
    for (const day of history) {
      if (typeof day.observedWeightKg === 'number') {
        seededDates.push(day.date);
        await db.runAsync(
          'INSERT INTO weights (date, kg, created_at) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kg = excluded.kg',
          day.date,
          day.observedWeightKg,
          new Date().toISOString(),
        );
      }

      if (typeof day.intakeKcal !== 'number') continue;

      for (const food of DEMO_FOODS) {
        // Work back from the day's target calories to a gram amount of this
        // food, so the diary totals land on the intake the history assumed.
        const grams = ((day.intakeKcal * food.share) / food.per100g.kcal) * 100;
        const nutrients = scaleNutrients(food.per100g, grams);

        await db.runAsync(
          `INSERT INTO log_entries (id, date, food_id, food_name, grams, meal, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          `${DEMO_PREFIX}${day.date}-${food.meal}`,
          day.date,
          food.id,
          food.name,
          grams,
          food.meal,
          nutrients.kcal,
          nutrients.proteinG,
          nutrients.carbsG,
          nutrients.fatG,
          nutrients.fiberG ?? 0,
          new Date().toISOString(),
        );
      }
    }
  });

  // Recorded after the transaction commits, so a failed seed never leaves
  // behind a list of dates it did not actually write.
  await writeSetting(SEEDED_DATES_KEY, seededDates);

  return history.length;
};

/**
 * Removes only what the seeder created, leaving real logs untouched.
 *
 * Log entries and foods carry the demo id prefix, so they identify themselves.
 * Weigh-ins are keyed by date alone with nothing to mark them, so the seeder
 * records which dates it wrote and this reads that list back. Regenerating the
 * history to work them out again would not do: the dates are relative to the
 * day it was seeded, so a clear on any later day would delete the wrong ones.
 *
 * If you logged a real weigh-in on a date the demo already occupied, it
 * replaced the demo row and will be removed here too. That is the one case this
 * cannot distinguish.
 */
export const clearDemoData = async (): Promise<void> => {
  const db = await getDb();
  const seededDates = (await readSetting<ISODate[]>(SEEDED_DATES_KEY)) ?? [];

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM log_entries WHERE id LIKE ?', `${DEMO_PREFIX}%`);
    await db.runAsync('DELETE FROM foods WHERE id LIKE ?', `${DEMO_PREFIX}%`);

    // Chunked because SQLite caps host parameters per statement, and a long
    // demo can carry more dates than that limit allows in one IN clause.
    for (let i = 0; i < seededDates.length; i += 400) {
      const chunk = seededDates.slice(i, i + 400);
      await db.runAsync(
        `DELETE FROM weights WHERE date IN (${chunk.map(() => '?').join(',')})`,
        ...chunk,
      );
    }
  });

  await writeSetting(SEEDED_DATES_KEY, []);
};

/** Wipes every log, weigh-in and cached food. Your settings are kept. */
export const clearAllData = async (): Promise<void> => {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM log_entries');
    await db.runAsync('DELETE FROM weights');
    await db.runAsync('DELETE FROM foods');
  });
  // Nothing is left for a demo clear to undo.
  await writeSetting(SEEDED_DATES_KEY, []);
};
