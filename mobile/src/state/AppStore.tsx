import type {
  DailyEstimate,
  DailyObservation,
  DailyProgram,
  Food,
  ISODate,
  LogEntry,
  Meal,
  Nutrients,
} from '@adaptive-macros/engine';
import {
  DEFAULT_MODEL_OPTIONS,
  DEFAULT_TARGET_OPTIONS,
  EMPTY_NUTRIENTS,
  buildProgram,
  estimateExpenditure,
  expenditureConfidence,
  scaleNutrients,
  seedExpenditure,
  todayISO,
  trendRate,
  weeklyCheckIn,
} from '@adaptive-macros/engine';
import type { TrendSummary, WeeklyCheckIn } from '@adaptive-macros/engine';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as db from '../db';
import { pushBaselineToCloud } from '../social/baselineSync';

import { type AppSettings, SETTINGS_KEY, withDefaults } from './settings';

/**
 * Rescales an entry's stored totals to a new portion.
 *
 * The fallback for when the underlying food is gone. A zero original portion
 * carries no ratio to scale by, so the result is zeroed rather than infinite.
 */
const scaleFromTotals = (
  nutrients: Nutrients,
  fromGrams: number,
  toGrams: number,
): Nutrients => {
  if (fromGrams <= 0) return { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 };
  const factor = toGrams / fromGrams;
  return {
    kcal: nutrients.kcal * factor,
    proteinG: nutrients.proteinG * factor,
    carbsG: nutrients.carbsG * factor,
    fatG: nutrients.fatG * factor,
    fiberG: (nutrients.fiberG ?? 0) * factor,
  };
};

interface AppState {
  ready: boolean;
  /**
   * Set when the first load could not reach the database at all.
   *
   * Without it a failed open left `ready` false forever and every screen drew
   * its empty defaults — no weigh-ins, no diary, no workouts — which looks
   * exactly like having lost everything. The data was never at risk; the app
   * just could not ask for it, and said nothing.
   */
  loadError: Error | null;
  /** Tries the first load again, after whatever was holding the database lets go. */
  retryLoad: () => void;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;

  /** The day the diary is showing. */
  selectedDate: ISODate;
  setSelectedDate: (date: ISODate) => void;

  entries: LogEntry[];
  totals: Nutrients;
  logFood: (food: Food, grams: number, meal: Meal) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  editEntry: (entry: LogEntry, grams: number, meal: Meal) => Promise<void>;
  /** Copies a previous day's entries onto the selected day. Returns how many. */
  copyDay: (from: ISODate, meals?: Meal[]) => Promise<number>;

  /** Each day's logged intake as the estimate sees it, oldest first. */
  observations: DailyObservation[];
  /**
   * Answers to "was that the whole day?": true for everything, false for not
   * fully logged, which keeps the day out of the expenditure estimate.
   */
  dayStatus: Map<ISODate, boolean>;
  markDay: (date: ISODate, complete: boolean | null) => Promise<void>;

  weights: db.WeightRow[];
  recordWeight: (date: ISODate, kg: number) => Promise<void>;
  removeWeight: (date: ISODate) => Promise<void>;

  /** Re-reads everything, for bulk writes made outside the store's own helpers. */
  refreshAll: () => Promise<void>;

  /** Full filtered history, oldest first. Empty until a first weigh-in exists. */
  series: DailyEstimate[];
  latest: DailyEstimate | null;
  trend: TrendSummary | null;
  program: DailyProgram;
  /** True while the program comes from the BMR seed rather than from data. */
  usingSeedEstimate: boolean;
  /** Last week's review, or null before the estimate is worth reviewing. */
  checkIn: WeeklyCheckIn | null;
  confidence: ReturnType<typeof expenditureConfidence>;
}

const AppContext = createContext<AppState | null>(null);

export const useApp = (): AppState => {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(withDefaults(null));
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayISO());
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [weights, setWeights] = useState<db.WeightRow[]>([]);
  const [observations, setObservations] = useState<DailyObservation[]>([]);
  const [dayStatus, setDayStatus] = useState<Map<ISODate, boolean>>(new Map());

  const reloadDiary = useCallback(async (date: ISODate) => {
    setEntries(await db.listLogEntries(date));
  }, []);

  // Anything that changes weight or intake invalidates the whole filtered
  // history, so the estimator's inputs are reloaded wholesale rather than
  // patched. The data is small — years of daily logs is a few thousand rows.
  const reloadHistory = useCallback(async () => {
    setWeights(await db.listWeights());
    setObservations(await db.loadObservations());
    setDayStatus(await db.listDayStatus());
  }, []);

  const markDay = useCallback(
    async (date: ISODate, complete: boolean | null) => {
      await db.setDayStatus(date, complete);
      await reloadHistory();
    },
    [reloadHistory],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const stored = await db.readSetting<Partial<AppSettings>>(SETTINGS_KEY);
        if (cancelled) return;
        setSettings(withDefaults(stored));
        await reloadHistory();
        await reloadDiary(selectedDate);
        if (!cancelled) setReady(true);
      } catch (error) {
        // The open already waited out a held lock before getting here, so this
        // is a real failure — most often a second tab that will not let go.
        if (!cancelled) setLoadError(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once, and again on `retryLoad`: later reloads are driven by the
    // mutation helpers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const retryLoad = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (ready) void reloadDiary(selectedDate);
  }, [ready, selectedDate, reloadDiary]);

  const refreshAll = useCallback(async () => {
    await reloadHistory();
    await reloadDiary(selectedDate);
  }, [reloadHistory, reloadDiary, selectedDate]);

  const updateSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSettings((current) => {
        const next = withDefaults({ ...current, ...patch });
        void db.writeSetting(SETTINGS_KEY, next);
        if (next.onboarded) {
          void pushBaselineToCloud(next);
        }
        return next;
      });
    },
    [],
  );

  const logFood = useCallback(
    async (food: Food, grams: number, meal: Meal) => {
      await db.saveFood(food);
      await db.addLogEntry({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: selectedDate,
        foodId: food.id,
        foodName: food.name,
        grams,
        meal,
        nutrients: scaleNutrients(food.per100g, grams),
      });
      await reloadDiary(selectedDate);
      await reloadHistory();
    },
    [selectedDate, reloadDiary, reloadHistory],
  );

  /**
   * Applies a new portion to an existing entry.
   *
   * When the food is still cached the macros are recomputed from its per-100 g
   * basis, which is exact. When it has been evicted, the stored totals are
   * scaled by the ratio of new to old grams instead — less precise, but it
   * keeps editing working rather than refusing on a food the app no longer has.
   */
  const editEntry = useCallback(
    async (entry: LogEntry, grams: number, meal: Meal) => {
      const food = await db.getFoodById(entry.foodId);
      const nutrients = food
        ? scaleNutrients(food.per100g, grams)
        : scaleFromTotals(entry.nutrients, entry.grams, grams);

      await db.updateLogEntry(entry.id, { grams, meal, nutrients });
      await reloadDiary(selectedDate);
      await reloadHistory();
    },
    [selectedDate, reloadDiary, reloadHistory],
  );

  const copyDay = useCallback(
    async (from: ISODate, meals?: Meal[]) => {
      const copied = await db.copyEntriesToDay(from, selectedDate, meals);
      await reloadDiary(selectedDate);
      await reloadHistory();
      return copied;
    },
    [selectedDate, reloadDiary, reloadHistory],
  );

  const removeEntry = useCallback(
    async (id: string) => {
      await db.deleteLogEntry(id);
      await reloadDiary(selectedDate);
      await reloadHistory();
    },
    [selectedDate, reloadDiary, reloadHistory],
  );

  const recordWeight = useCallback(
    async (date: ISODate, kg: number) => {
      await db.saveWeight(date, kg);
      await reloadHistory();
    },
    [reloadHistory],
  );

  const removeWeight = useCallback(
    async (date: ISODate) => {
      await db.deleteWeight(date);
      await reloadHistory();
    },
    [reloadHistory],
  );

  const totals = useMemo(
    () =>
      entries.reduce<Nutrients>(
        (sum, entry) => ({
          kcal: sum.kcal + entry.nutrients.kcal,
          proteinG: sum.proteinG + entry.nutrients.proteinG,
          carbsG: sum.carbsG + entry.nutrients.carbsG,
          fatG: sum.fatG + entry.nutrients.fatG,
          fiberG: (sum.fiberG ?? 0) + (entry.nutrients.fiberG ?? 0),
        }),
        EMPTY_NUTRIENTS,
      ),
    [entries],
  );

  const latestWeightKg = weights.length ? weights[weights.length - 1].kg : null;

  // The whole filter is re-run from scratch whenever the inputs change. Over a
  // multi-year history this is still well under a millisecond, and it removes
  // any possibility of the displayed estimate drifting from the stored data.
  const { series, filtered, latest } = useMemo(
    () =>
      estimateExpenditure(observations, {
        ...DEFAULT_MODEL_OPTIONS,
        kcalPerKgTissue: settings.kcalPerKgTissue,
        scaleNoiseKg: settings.scaleNoiseKg,
        expenditureVolatilityKcal: settings.expenditureVolatilityKcal,
        initialExpenditureKcal: seedExpenditure(
          settings.profile,
          latestWeightKg ?? 80,
          settings.activity,
        ),
      }),
    [observations, settings, latestWeightKg],
  );

  const trend = useMemo(() => trendRate(series, 14), [series]);

  const confidence = expenditureConfidence(latest?.expenditureSdKcal ?? Number.POSITIVE_INFINITY);

  // With too little history the filter's estimate is still essentially its own
  // seed, so the UI is told to label it as an estimate from the formula rather
  // than presenting a measured number the data does not support yet.
  const usingSeedEstimate = latest === null || confidence === 'insufficient';

  const targetOptions = useMemo(
    () => ({
      ...DEFAULT_TARGET_OPTIONS,
      kcalPerKgTissue: settings.kcalPerKgTissue,
      proteinGPerKg: settings.proteinGPerKg,
      minFatGPerKg: settings.minFatGPerKg,
    }),
    [settings.kcalPerKgTissue, settings.proteinGPerKg, settings.minFatGPerKg],
  );

  // Not while the estimate is still the formula's: "the target moved because
  // the data did" is only true once there is data behind it.
  const checkIn = useMemo(
    () =>
      usingSeedEstimate
        ? null
        : weeklyCheckIn({
            today: todayISO(),
            observations,
            series,
            filtered,
            latest,
            goal: settings.goal,
            options: targetOptions,
          }),
    [usingSeedEstimate, observations, series, filtered, latest, settings.goal, targetOptions],
  );

  const program = useMemo(() => {
    const referenceWeightKg = latest?.trendWeightKg ?? latestWeightKg ?? 80;
    const expenditure =
      latest?.expenditureKcal ??
      seedExpenditure(settings.profile, referenceWeightKg, settings.activity);

    return buildProgram(expenditure, referenceWeightKg, settings.goal, targetOptions);
  }, [latest, latestWeightKg, settings, targetOptions]);

  const value: AppState = {
    ready,
    loadError,
    retryLoad,
    settings,
    updateSettings,
    selectedDate,
    setSelectedDate,
    entries,
    totals,
    logFood,
    removeEntry,
    editEntry,
    copyDay,
    observations,
    dayStatus,
    markDay,
    weights,
    recordWeight,
    removeWeight,
    refreshAll,
    series,
    latest,
    trend,
    program,
    usingSeedEstimate,
    checkIn,
    confidence,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
