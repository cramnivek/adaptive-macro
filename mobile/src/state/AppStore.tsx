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
  sumNutrients,
  deurenbergBodyFatPct,
  energyDensityKcalPerKg,
  recommendedProtein,
  type ProteinRecommendation,
  buildProgram,
  estimateExpenditure,
  expenditureConfidence,
  scaleNutrients,
  scaleMicros,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../db';
import { LEGACY_DATABASE, SIGNED_OUT, claimDevice } from '../db/accountDatabase';
import { finishPendingMove, offerToMoveLog } from '../db/moveLog';
import { notify } from '../dialog';
import { LATEST_ACTIVE_DRAFT_KEY } from '../sessionDraft';
import { pushBaselineToCloud } from '../social/baselineSync';
import { useSocial } from '../social/session';
import { SQUAD_STORAGE_KEY } from '../social/squads';

import { type AppSettings, SETTINGS_KEY, withDefaults } from './settings';
import { chooseBodyFat } from './bodyFatChoice';

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
    micros: scaleMicros(nutrients.micros, factor),
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
  copyDay: (from: ISODate, meals?: Meal[], entryIds?: string[]) => Promise<number>;

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

  /**
   * What the estimate assumes a kilo of weight change is worth, and the body
   * fat it was worked out from, so the screen can say so rather than hide it.
   */
  energyDensity: {
    kcalPerKg: number;
    bodyFatPct: number;
    /** Where the logged figure came from; null when it is the BMI-based guess. */
    source: db.BodyFatSource | null;
  };
  /**
   * The protein the evidence suggests for this person, and the hand-set figure
   * (g per kg of body weight) that replaces it, if any, so Settings can show both.
   */
  protein: ProteinRecommendation;
  proteinOverrideGPerKg: number | null;

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

/** Stands for the one database of a build with no accounts at all. */
const NO_ACCOUNTS = 'device';

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const { configured, session } = useSocial();
  // Whose log should be on screen: an account, whoever is using the app
  // without one, or undefined while the session is still being read.
  const owner = !configured ? NO_ACCOUNTS : session === undefined ? undefined : (session?.user.id ?? SIGNED_OUT);
  const [loadedFor, setLoadedFor] = useState<string | undefined>(undefined);
  // Derived in render rather than set by an effect: for the one render between
  // a sign-in and the effect noticing it, the state still holds the previous
  // owner's log, and anything reading it then — AuthGate's baseline upload
  // above all — must already be told it is not ready.
  const ready = owner !== undefined && loadedFor === owner;
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(withDefaults(null));
  const [selectedDate, setSelectedDate] = useState<ISODate>(todayISO());
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [weights, setWeights] = useState<db.WeightRow[]>([]);
  const [loggedBodyFat, setLoggedBodyFat] = useState<{ pct: number; source: db.BodyFatSource } | null>(null);
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
    setLoggedBodyFat(chooseBodyFat(await db.getLatestBodyMeasurements(20)));
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
    if (owner === undefined) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        if (owner === NO_ACCOUNTS) {
          await db.selectDatabase(LEGACY_DATABASE);
        } else {
          const { database, ownerChanged } = await claimDevice(owner);
          // These two are kept once per device rather than per owner: the
          // squad as last seen, and a pointer to the workout in progress.
          if (ownerChanged) await AsyncStorage.multiRemove([SQUAD_STORAGE_KEY, LATEST_ACTIVE_DRAFT_KEY]);
          await db.selectDatabase(database);
          // Before the log is read: an account opening to an empty log is
          // offered the one kept here without an account (moveLog.ts).
          // A move that fails must not keep the account's own log from
          // opening; it is ordered so the log is never in neither place. A
          // clear left owed by an earlier move is finished first, for anyone,
          // so a moved log is never left on show signed out. Either failure is
          // said, not swallowed.
          await finishPendingMove(database).catch(() => {
            void db.selectDatabase(database);
            notify('Could not finish moving your log', 'It is in your account; the old copy is cleared next time.');
          });
          if (owner !== SIGNED_OUT) {
            await offerToMoveLog(owner, database).catch(() => {
              void db.selectDatabase(database);
              notify('Could not move your log', 'Nothing was lost. You can try again with a backup and restore.');
            });
          }
        }
        const stored = await db.readSetting<Partial<AppSettings>>(SETTINGS_KEY);
        if (cancelled) return;
        setSettings(withDefaults(stored));
        await reloadHistory();
        await reloadDiary(selectedDate);
        if (!cancelled) setLoadedFor(owner);
      } catch (error) {
        // The open already waited out a held lock before getting here, so this
        // is a real failure — most often a second tab that will not let go.
        if (!cancelled) setLoadError(error instanceof Error ? error : new Error(String(error)));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs for each owner in turn, and again on `retryLoad`: later reloads are
    // driven by the mutation helpers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, attempt]);

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
    async (from: ISODate, meals?: Meal[], entryIds?: string[]) => {
      const copied = await db.copyEntriesToDay(from, selectedDate, meals, entryIds);
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

  // The engine's sum, which carries vitamins and minerals. A hand-written
  // reduce here added up the macros and fibre only, so every micronutrient
  // reached the quality screen as zero however much had been logged.
  const totals = useMemo(() => sumNutrients(entries.map((entry) => entry.nutrients)), [entries]);

  const latestWeightKg = weights.length ? weights[weights.length - 1].kg : null;

  // How much energy a kilo of weight change holds, from body composition rather
  // than the flat 7700 (see engine/bodyComposition.ts): the measured body fat
  // when there is one, otherwise an estimate from height, weight, age and sex.
  // Used for the expenditure estimate and the targets alike, so a deficit is
  // set in the same units it is measured in. A value stored by the old
  // Advanced settings is no longer honoured: those controls were removed, so an
  // override would apply where nobody could see or undo it.
  const bodyFatPct =
    loggedBodyFat?.pct ??
    deurenbergBodyFatPct(latestWeightKg ?? 80, settings.profile.heightCm, settings.profile.age, settings.profile.sex);
  const kcalPerKgChange = energyDensityKcalPerKg(((latestWeightKg ?? 80) * bodyFatPct) / 100);

  // The whole filter is re-run from scratch whenever the inputs change. Over a
  // multi-year history this is still well under a millisecond, and it removes
  // any possibility of the displayed estimate drifting from the stored data.
  const { series, filtered, latest } = useMemo(
    () =>
      estimateExpenditure(observations, {
        ...DEFAULT_MODEL_OPTIONS,
        kcalPerKgTissue: kcalPerKgChange,
        initialExpenditureKcal: seedExpenditure(
          settings.profile,
          latestWeightKg ?? 80,
          settings.activity,
        ),
      }),
    [observations, settings, latestWeightKg, kcalPerKgChange],
  );

  const trend = useMemo(() => trendRate(series, 14), [series]);

  const confidence = expenditureConfidence(latest?.expenditureSdKcal ?? Number.POSITIVE_INFINITY);

  // With too little history the filter's estimate is still essentially its own
  // seed, so the UI is told to label it as an estimate from the formula rather
  // than presenting a measured number the data does not support yet.
  const usingSeedEstimate = latest === null || confidence === 'insufficient';

  // Protein from goal, activity, sex and body fat rather than one figure for
  // everyone; see engine/protein.ts for the evidence behind each number. A
  // figure set by hand wins. So does an old fixed figure someone had changed
  // from its 1.8 default, which is the only way to tell it was chosen.
  const proteinOverride =
    settings.proteinOverrideGPerKg ??
    (settings.proteinGPerKg !== DEFAULT_TARGET_OPTIONS.proteinGPerKg ? settings.proteinGPerKg : null);
  const protein = useMemo(
    () =>
      recommendedProtein({
        weightKg: latest?.trendWeightKg ?? latestWeightKg ?? 80,
        bodyFatPct,
        sex: settings.profile.sex,
        activity: settings.activity,
        direction: settings.goal.direction,
      }),
    [latest, latestWeightKg, bodyFatPct, settings.profile.sex, settings.activity, settings.goal.direction],
  );

  const targetOptions = useMemo(
    () => ({
      ...DEFAULT_TARGET_OPTIONS,
      kcalPerKgTissue: kcalPerKgChange,
      // The targets scale protein by trend weight, so the recommendation is
      // handed over in those units; for high body fat it is less than its
      // own g/kg, because it was set from the leaner reference weight.
      proteinGPerKg: proteinOverride ?? protein.gPerKgBodyWeight,
      minFatGPerKg: settings.minFatGPerKg,
    }),
    [kcalPerKgChange, proteinOverride, protein.gPerKgBodyWeight, settings.minFatGPerKg],
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
            weekEndsOn: settings.checkInWeekEndsOn,
          }),
    [usingSeedEstimate, observations, series, filtered, latest, settings.goal, targetOptions, settings.checkInWeekEndsOn],
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
    energyDensity: { kcalPerKg: kcalPerKgChange, bodyFatPct, source: loggedBodyFat?.source ?? null },
    protein,
    proteinOverrideGPerKg: proteinOverride,
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
