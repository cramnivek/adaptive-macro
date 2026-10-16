import {
  bodyweightForDates,
  estimate1RM,
  evaluatePRTarget,
  lbToKg,
  milestonesOn,
  todayISO,
} from '@adaptive-macros/engine';
import type { ExercisePR, Milestone, SetType } from '@adaptive-macros/engine';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { MovementPattern } from '../src/ai/exercises';
import { TOUCH_TARGET } from '../src/components/Controls';
import { ExerciseIcon } from '../src/components/ExerciseIcon';
import { ExerciseInfoSheet } from '../src/components/ExerciseInfoSheet';
import { FinishSheet } from '../src/components/FinishSheet';
import { SaveRoutineSheet } from '../src/components/SaveRoutineSheet';
import { type ShareCard, shareSummary } from '../src/shareCard';
import { createPost } from '../src/social/api';
import { type FinishedWorkout, postPayload } from '../src/social/postPayload';
import { useSocial } from '../src/social/session';
import { ExercisePicker } from '../src/components/ExercisePicker';
import { FadeIn } from '../src/components/FadeIn';
import { CountUp } from '../src/components/CountUp';
import { Screen } from '../src/components/Screen';
import { ImpactFrame } from '../src/components/ImpactFrame';
import { PRCelebration, type PRCelebrationData } from '../src/components/PRCelebration';
import { SlashPanel } from '../src/components/SlashPanel';
import { MilestoneSheet } from '../src/components/MilestoneSheet';
import { SessionOptionsSheet } from '../src/components/SessionOptionsSheet';
import { RestBar } from '../src/components/RestBar';
import { RpeSheet } from '../src/components/RpeSheet';
import { SwapExerciseSheet, type SwapMode } from '../src/components/SwapExerciseSheet';
import { Tappable } from '../src/components/Tappable';
import { impactContent } from '../src/components/setImpact';
import type { ImpactContent } from '../src/components/setImpact';
import {
  activeSession,
  addSetToSession,
  deleteSet,
  discardSession,
  exerciseBestPR,
  finishSession,
  lastSessionSets,
  listAllSets,
  listExerciseNames,
  loadAllCatalogueEntries,
  catalogueEntryForExercise,
  cataloguePatternsByExerciseName,
  listRoutines,
  sessionSets,
  startSession,
  setSetRpe,
  updateExerciseSupersetGroup,
  updateSetsExercise,
  updateSetValues,
} from '../src/db';
import type { ActiveSession, CatalogueEntry, LoggedSet, Routine } from '../src/db';
import { warmCatalogueCache } from '../src/exerciseSearch';
import { exerciseInfoFor } from '../src/exerciseInfo';
import { confirm, notify } from '../src/dialog';
import { displayWeight, parseWeight, weightUnit } from '../src/format';
import { playChime, primeChime } from '../src/platform/chime';
import type { ChimeChoice } from '../src/platform/chimeSound';
import { thud } from '../src/platform/haptics';
import { usesBarbell } from '../src/plates';
import { PlateSheet } from '../src/components/PlateSheet';
import { SupersetSheet, getSupersetStyle } from '../src/components/SupersetSheet';
import type { WarmupSet } from '../src/warmup';
import { laddersFor } from '../src/milestones';
import { adjustRest, MAX_REST_SECONDS, MIN_REST_SECONDS } from '../src/rest';
import { draftsToAdd, repsPrefill, resumeOrder, targetLabel } from '../src/routinePlan';
import { nextLoadHint } from '../src/suggestion';
import { formatRpe } from '../src/rpe';
import { useApp } from '../src/state/AppStore';
import {
  type CardioMode,
  type SpeedUnit,
  calculateCardioSteps,
  calculateTreadmillMetrics,
  detectCardio,
  detectCardioMode,
  displayDistance,
  displaySpeed,
  durationToInputMinutes,
  estimateSteps,
  formatCardioEffort,
  formatLiveCardioEstimate,
  formatStepEstimate,
  parseDistance,
  parseDurationSeconds,
  parseIncline,
  parseSpeed,
} from '../src/cardio';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { font, radius, space } from '../src/theme';
import type { UnitSystem } from '../src/state/settings';
// Aliased: `session` is already the active-workout state in this component.
import { session as loud } from '../src/theme/sessionTheme';

/** One editable row. `id` is present once the set has been written. */
interface Row {
  key: string;
  id: string | null;
  weight: string;
  reps: string;
  setType: SetType;
  done: boolean;
  /** How hard it felt, 6-10 in halves. Null until rated; rating is optional. */
  rpe: number | null;
  // Cardio properties:
  isCardio?: boolean;
  cardioMode?: CardioMode;
  speed?: string;
  incline?: string;
  time?: string;
  distance?: string;
}

interface Block {
  name: string;
  bodyweightBased: boolean;
  isCardio?: boolean;
  cardioMode?: CardioMode;
  rows: Row[];
  /** The same exercise's sets from the last finished session, by index. */
  previous: LoggedSet[];
  /** Historical best estimated 1RM for this exercise. */
  bestPR?: ExercisePR | null;
  /** What the routine asks for, when the exercise came from one. */
  target: {
    sets: number;
    reps: string | null;
    targetTime?: string | null;
    targetDistance?: number | null;
    targetSpeed?: number | null;
    targetIncline?: number | null;
  } | null;
  /** Superset group letter, e.g. 'A', 'B', 'C' */
  supersetGroup?: string | null;
}

const newKey = () => Math.random().toString(36).slice(2, 10);

/**
 * Keeps password managers off the set fields. A number box in a row looks
 * enough like a login to them that they pin their own button inside it, on top
 * of the tick, and a set cannot be recorded until the field loses focus.
 * `dataSet` becomes the data-* attributes each manager checks; React Native's
 * types do not know it, hence the spread.
 */
const NOT_A_LOGIN = {
  autoComplete: 'off',
  dataSet: { lpignore: 'true', '1pIgnore': 'true', bwignore: 'true', formType: 'other' },
} as const;

const elapsed = (startedAt: string, now: number): string => {
  const started = new Date(startedAt).getTime();
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
};

/**
 * Logging a session.
 *
 * Laid out as a list of exercises with editable set rows, rather than a form
 * that adds one set at a time: at the rack you are filling in a grid you can
 * see, and the previous session's numbers for the same set sit beside the
 * boxes you are typing into.
 *
 * A row is a draft until it is ticked. Ticking writes it; editing a ticked row
 * updates it; unticking deletes it. Nothing is written speculatively, so a row
 * half typed and abandoned leaves no trace.
 */
export default function SessionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { series, settings, updateSettings } = useApp();
  const unit = weightUnit(settings.units);
  const currentBodyweightKg = useMemo(
    () => series[series.length - 1]?.trendWeightKg ?? settings.goalWeightKg ?? null,
    [series, settings.goalWeightKg],
  );
  const params = useLocalSearchParams<{ start?: string; routine?: string; cardio?: string }>();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickerMode, setPickerMode] = useState<'exercise' | 'cardio'>('exercise');
  const [known, setKnown] = useState<Awaited<ReturnType<typeof listExerciseNames>>>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [now, setNow] = useState(Date.now());
  const started = useRef(false);

  const [info, setInfo] = useState<CatalogueEntry | null>(null);
  /**
   * The set that just went down, and what to shout about it. Keyed on the row
   * so each tick mounts a fresh frame rather than reusing a half-finished one.
   */
  const [landed, setLanded] = useState<{ rowKey: string; content: ImpactContent } | null>(null);
  // Stable, so the once-a-second clock re-render cannot restart a frame mid-flight.
  const clearLanded = useCallback(() => setLanded(null), []);
  /** Active all-time PR celebration data; null when dismissed. */
  const [celebrationPR, setCelebrationPR] = useState<PRCelebrationData | null>(null);
  /** Which row the RPE sheet is rating, if it is open. */
  const [rating, setRating] = useState<{ blockIndex: number; rowIndex: number } | null>(null);
  /** Whether the session options (units, alert chime) sheet is open. */
  const [optionsOpen, setOptionsOpen] = useState(false);
  /** Active target for the barbell plate calculator; null when closed. */
  const [calcTarget, setCalcTarget] = useState<{
    blockIndex: number | null;
    rowIndex: number | null;
    exerciseName: string | null;
    initialWeight: number | null;
    mode: 'plates' | 'warmup';
    isBarbell: boolean;
  } | null>(null);
  /** Which exercise is currently opening the superset management sheet; null when closed. */
  const [supersetTargetIndex, setSupersetTargetIndex] = useState<number | null>(null);
  /** Which exercise is currently opening the swap sheet; null when closed. */
  const [swapTargetIndex, setSwapTargetIndex] = useState<number | null>(null);
  /** Full catalogue cache for swap recommendations and search. */
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);

  /**
   * The running rest, as the wall-clock time it ends at.
   *
   * An end time rather than a remaining count, so it rides the clock that
   * already ticks for the header instead of starting a second interval, and so
   * the value stays true across a re-render, a backgrounded app or a locked
   * phone. A decrementing counter would quietly lose time in all three.
   *
   * What it does NOT survive is the *display* being live while hidden: browsers
   * throttle timers in a background tab, so the face freezes. Measured on the
   * deployed build — five real seconds passed with the countdown reading the
   * same value and `document.hidden` true. Because the end time is wall-clock,
   * coming back jumps straight to the truth rather than resuming from where it
   * froze, which is the whole reason for storing it this way.
   *
   * The cost is that the rest ending while you are elsewhere is announced late,
   * when you return, rather than at the moment it ends. Signalling on time from
   * the background needs a scheduled local notification, which is its own
   * feature — and one the iOS PWA cannot have at all.
   */
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  /** Shown once the workout is saved, when the day was worth marking. */
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  /** The finished workout and its card, for the sheet that offers to share and post it. */
  const [finished, setFinished] = useState<{ workout: FinishedWorkout; summary: ShareCard } | null>(null);
  /** Sign-in is open over the finish sheet. */
  const [signingIn, setSigningIn] = useState(false);
  /** The save-as-routine sheet is open over the finish sheet, and whether it has been saved. */
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [routineSaved, setRoutineSaved] = useState(false);
  const social = useSocial();
  // Back from sign-in (or profile setup), the sheet comes back with its caption.
  useFocusEffect(useCallback(() => setSigningIn(false), []));
  /** Which rest has already announced itself, so the thud fires once. */
  const announced = useRef<number | null>(null);
  /** Movement pattern per recorded name, for the glyph on each block header. */
  const [patterns, setPatterns] = useState<Record<string, MovementPattern>>({});
  // Reloaded whenever a block is added, because a newly catalogued exercise has
  // no entry in the map that was fetched when the screen mounted.
  useEffect(() => {
    void cataloguePatternsByExerciseName().then(setPatterns);
  }, [blocks.length]);

  // The header clock. One second is the resolution anyone reads it at.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  /** Seconds left on the rest, derived from the clock above rather than counted. */
  const restRemaining = rest === null ? null : Math.max(0, Math.ceil((rest.endsAt - now) / 1000));

  useEffect(() => {
    if (rest === null || restRemaining !== 0) return;
    if (announced.current === rest.endsAt) return;
    announced.current = rest.endsAt;
    thud('heavy');
    if (settings.restSound) playChime(settings.restChimeChoice ?? 'chime');

    // Said where it will be seen wherever the screen is scrolled: the bar sits
    // at the top of the workout, often off screen while the next set is set up.
    const nextBlock = blocks.find((block) => block.rows.some((row) => !row.done));
    const nextRow = nextBlock ? nextBlock.rows.findIndex((row) => !row.done) : -1;
    const supersetNotice = nextBlock?.supersetGroup ? ` (Superset ${nextBlock.supersetGroup})` : '';
    notify(
      'Rest is up',
      nextBlock ? `Next: ${nextBlock.name}${supersetNotice}, set ${nextRow + 1}.` : 'On to the next one.',
    );

    // Left on screen for a moment rather than cleared at once. On the iOS PWA
    // there is no vibration API, so this bar is the only thing those users get
    // telling them the rest is up.
    const id = setTimeout(() => setRest(null), 6000);
    return () => clearTimeout(id);
    // `announced` holds it to once per rest, so the extra dependencies cannot
    // make it fire twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rest, restRemaining]);

  /**
   * Moves the running rest, and the stored default with it.
   *
   * Reaching for +15 says the default is wrong, not that this one set was
   * unusual — so the change sticks rather than being asked for again next
   * workout. The end time shifts by the difference instead of restarting:
   * "+15" means fifteen more seconds, not back to the top.
   */
  const changeRestSeconds = (next: number) => {
    const clamped = Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, next));
    const delta = (clamped - settings.restSeconds) * 1000;
    void updateSettings({ restSeconds: clamped });
    setRest((current) =>
      current === null ? null : { endsAt: current.endsAt + delta, total: clamped },
    );
  };

  const stepRestSeconds = (steps: number) => {
    const next = adjustRest(settings.restSeconds, steps);
    changeRestSeconds(next);
  };

  const nudgeRest = (steps: number) => {
    stepRestSeconds(steps);
  };

    /** Active speed unit: locked setting, or active speed unit if switchable (default kph). */
  const speedUnit: SpeedUnit =
    settings.speedUnitSetting === 'kph' || settings.speedUnitSetting === 'mph'
      ? settings.speedUnitSetting
      : (settings.activeSpeedUnit ?? 'kph');

  const totalSteps = useMemo(() => {
    let completedSteps = 0;
    let draftSteps = 0;

    for (const block of blocks) {
      if (!block.isCardio) continue;
      const mode = block.cardioMode ?? 'treadmill';
      for (const row of block.rows) {
        const steps = calculateCardioSteps({
          mode,
          speedKph: row.speed?.trim() ? parseSpeed(row.speed, speedUnit) : null,
          inclinePct: row.incline?.trim() ? parseIncline(row.incline) : null,
          durationSeconds: row.time?.trim() ? parseDurationSeconds(row.time) : null,
          distanceKm: row.distance?.trim() ? parseDistance(row.distance) : null,
        });
        if (row.done) {
          completedSteps += steps;
        } else {
          draftSteps += steps;
        }
      }
    }

    return completedSteps > 0 ? completedSteps : draftSteps;
  }, [blocks, speedUnit]);

  /**
   * Switches between kilograms and pounds directly within the session view,
   * converting displayed weights in active rows so what the user typed adapts.
   */
  const toggleWeightUnits = () => {
    const nextUnits: UnitSystem = settings.units === 'metric' ? 'imperial' : 'metric';
    const fromUnits = settings.units;

    setBlocks((current) =>
      current.map((block) => ({
        ...block,
        rows: block.rows.map((row) => {
          if (row.isCardio || block.isCardio) return row;
          if (!row.weight.trim()) return row;
          const kg = parseWeight(row.weight, fromUnits);
          if (kg === null) return row;
          return {
            ...row,
            weight: String(displayWeight(kg, nextUnits).toFixed(1)),
          };
        }),
      })),
    );

    void updateSettings({ units: nextUnits });
    notify('Weight unit updated', `Switched to ${nextUnits === 'metric' ? 'kg' : 'lbs'}.`);
  };

  /**
   * Switches treadmill speed display between kph and mph directly within the session view,
   * converting displayed speeds in active cardio rows. Outside distance remains strictly km.
   */
  const toggleSpeedUnits = () => {
    const fromUnit: SpeedUnit = speedUnit;
    const nextUnit: SpeedUnit = fromUnit === 'kph' ? 'mph' : 'kph';

    setBlocks((current) =>
      current.map((block) => ({
        ...block,
        rows: block.rows.map((row) => {
          if (!row.isCardio && !block.isCardio) return row;
          let nextSpeed = row.speed ?? '';
          if (row.speed?.trim()) {
            const kph = parseSpeed(row.speed, fromUnit);
            if (kph != null) {
              const spd = displaySpeed(kph, nextUnit);
              nextSpeed = spd != null ? spd.toFixed(1) : row.speed;
            }
          }
          return {
            ...row,
            speed: nextSpeed,
          };
        }),
      })),
    );

    void updateSettings({ activeSpeedUnit: nextUnit });
    notify('Speed unit updated', `Switched to ${nextUnit.toUpperCase()}.`);
  };

  /**
   * Toggles the rest completion alert on or off during the session.
   * When enabled, primes the audio element and plays a confirmation chime.
   */
  const toggleAlert = () => {
    const next = !settings.restSound;
    if (next) {
      primeChime(settings.restChimeChoice ?? 'chime');
      playChime(settings.restChimeChoice ?? 'chime');
    }
    void updateSettings({ restSound: next });
    notify(
      next ? 'Rest alert on' : 'Rest alert off',
      next ? 'Chimes when each rest period finishes.' : 'Rest timer will be silent.',
    );
  };

  const changeChimeChoice = (choice: ChimeChoice) => {
    void updateSettings({ restChimeChoice: choice });
  };

  const showWeightSwitcher = settings.weightUnitSetting !== 'kg' && settings.weightUnitSetting !== 'lbs';
  const showSpeedSwitcher =
    settings.speedUnitSetting !== 'kph' &&
    settings.speedUnitSetting !== 'mph' &&
    blocks.some((b) => b.isCardio);

  const renderControls = () => (
    <View style={styles.headerControls}>
      <Tappable
        onPress={() => setOptionsOpen(true)}
        scaleTo={0.9}
        style={styles.headerHit}
        accessibilityRole="button"
        accessibilityLabel="Workout options"
      >
        <View style={styles.gearBtn}>
          <Ionicons name="settings-outline" size={17} color={loud.figureMuted} />
        </View>
      </Tappable>
    </View>
  );

  const blockFor = useCallback(
    async (
      name: string,
      bodyweightBased: boolean,
      rows: Row[] = [],
      target: Block['target'] = null,
      isCardio = false,
      cardioMode: CardioMode = 'treadmill',
      supersetGroup: string | null = null,
    ): Promise<Block> => ({
      name,
      bodyweightBased,
      isCardio,
      cardioMode,
      rows,
      previous: await lastSessionSets(name),
      bestPR: await exerciseBestPR(name, bodyweightBased, series, currentBodyweightKg),
      target,
      supersetGroup,
    }),
    [series, currentBodyweightKg],
  );

  /**
   * Draft rows up to the routine's target, each prefilled from the same set
   * last time. Drafts are not written, so an untouched one costs nothing.
   */
  const withTargetRows = useCallback(
    (block: Block): Block => {
      const target = block.target;
      if (block.isCardio) {
        if (block.rows.length > 0) return block;
        const previous = block.previous[0];
        return {
          ...block,
          rows: [
            {
              key: newKey(),
              id: null,
              weight: '',
              reps: '0',
              setType: 'normal',
              rpe: null,
              done: false,
              isCardio: true,
              cardioMode: block.cardioMode,
              speed:
                previous?.speedKph != null
                  ? String(displaySpeed(previous.speedKph, settings.units)?.toFixed(1))
                  : target?.targetSpeed != null
                    ? String(displaySpeed(target.targetSpeed, settings.units)?.toFixed(1))
                    : '',
              incline:
                previous?.inclinePct != null
                  ? String(previous.inclinePct)
                  : target?.targetIncline != null
                    ? String(target.targetIncline)
                    : '',
              time:
                previous?.durationSeconds != null
                  ? durationToInputMinutes(previous.durationSeconds)
                  : target?.targetTime
                    ? target.targetTime.replace(/[^\d.]/g, '')
                    : '',
              distance:
                previous?.distanceKm != null
                  ? String(displayDistance(previous.distanceKm, settings.units)?.toFixed(1))
                  : target?.targetDistance != null
                    ? String(displayDistance(target.targetDistance, settings.units)?.toFixed(1))
                    : '',
            },
          ],
        };
      }
      if (target === null) return block;
      const start = block.rows.length;
      const drafts: Row[] = Array.from({ length: draftsToAdd(target.sets, start) }, (_, offset) => {
        const previous = block.previous[start + offset];
        return {
          key: newKey(),
          id: null,
          weight:
            previous?.weightKg == null
              ? ''
              : String(displayWeight(previous.weightKg, settings.units).toFixed(1)),
          reps: repsPrefill(previous?.reps, target.reps),
          setType: 'normal',
          rpe: null,
          done: false,
        };
      });
      return { ...block, rows: [...block.rows, ...drafts] };
    },
    [settings.units],
  );

  /** Rebuilds the on-screen blocks from what is already written. */
  const blocksFromSession = useCallback(
    async (open: ActiveSession, plan: Routine['exercises'] = []): Promise<Block[]> => {
      const names = resumeOrder(
        plan.map((e) => e.name),
        open.sets.map((s) => s.exerciseName),
      );

      return Promise.all(
        names.map(async (name) => {
          const mine = open.sets.filter((s) => s.exerciseName === name);
          const planned = plan.find((e) => e.name === name);
          const isCardio = mine[0]?.isCardio ?? planned?.isCardio ?? detectCardio(name);
          const cardioMode = (mine[0]?.cardioMode ?? planned?.cardioMode ?? detectCardioMode(name)) as CardioMode;
          const supersetGroup = mine[0]?.supersetGroup ?? planned?.supersetGroup ?? null;
          const block = await blockFor(
            name,
            mine[0]?.bodyweightBased ?? planned?.bodyweightBased ?? false,
            mine.map((s) => ({
              key: s.id,
              id: s.id,
              weight:
                s.weightKg === null ? '' : String(displayWeight(s.weightKg, settings.units).toFixed(1)),
              reps: String(s.reps),
              setType: s.setType,
              rpe: s.rpe,
              done: true,
              isCardio: s.isCardio,
              cardioMode: (s.cardioMode as CardioMode) ?? cardioMode,
              speed:
                s.speedKph != null ? String(displaySpeed(s.speedKph, speedUnit)?.toFixed(1)) : '',
              incline: s.inclinePct != null ? String(s.inclinePct) : '',
              time: s.durationSeconds != null ? durationToInputMinutes(s.durationSeconds) : '',
              distance:
                s.distanceKm != null ? String(displayDistance(s.distanceKm)?.toFixed(1)) : '',
            })),
            planned
              ? {
                  sets: planned.targetSets,
                  reps: planned.targetReps,
                  targetTime: planned.targetTime,
                  targetDistance: planned.targetDistance,
                  targetSpeed: planned.targetSpeed,
                  targetIncline: planned.targetIncline,
                }
              : null,
            isCardio,
            cardioMode,
            supersetGroup,
          );
          return withTargetRows(block);
        }),
      );
    },
    [blockFor, withTargetRows, settings.units, speedUnit],
  );

  /**
   * Which `start`/`routine` the blocks were last loaded for. The loaders depend on
   * the units, so switching kg/lb mid-workout re-runs this effect — and reloading
   * from the database would drop every set not yet ticked. Loading is for arriving,
   * not for a change of units; `toggleUnits` converts the rows on screen itself.
   */
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${params.start ?? ''}|${params.routine ?? ''}`;
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    void (async () => {
      const [existing, loadedRoutines, names, allCatalogue] = await Promise.all([
        activeSession(),
        listRoutines(),
        listExerciseNames(),
        loadAllCatalogueEntries(),
      ]);
      setRoutines(loadedRoutines);
      setKnown(names);
      setCatalogue(allCatalogue);
      void warmCatalogueCache(loadAllCatalogueEntries);

      if (existing) {
        // The routine's exercises come back too, not only those with a set
        // logged: on iOS the browser can drop a backgrounded page mid-workout,
        // and reopening it used to lose everything not yet started.
        const routine = loadedRoutines.find((r) => r.id === existing.routineId);
        setSession(existing);
        setBlocks(await blocksFromSession(existing, routine?.exercises ?? []));
      } else if (!started.current && (params.start === 'blank' || params.routine)) {
        started.current = true;
        const routine = loadedRoutines.find((r) => r.id === params.routine);
        const fresh = await startSession(routine?.name ?? 'Workout', todayISO(), routine?.id ?? null);
        setSession(fresh);
        setBlocks(
          await Promise.all(
            (routine?.exercises ?? []).map(async (e) =>
              withTargetRows(
                await blockFor(
                  e.name,
                  e.bodyweightBased,
                  [],
                  {
                    sets: e.targetSets,
                    reps: e.targetReps,
                    targetTime: e.targetTime,
                    targetDistance: e.targetDistance,
                    targetSpeed: e.targetSpeed,
                    targetIncline: e.targetIncline,
                  },
                  e.isCardio ?? false,
                  (e.cardioMode as CardioMode) ?? 'treadmill',
                  e.supersetGroup ?? null,
                ),
              ),
            ),
          ),
        );
        if (params.cardio === '1') {
          setPickerMode('cardio');
          setPicking(true);
        }
      }
      setLoading(false);
    })();
  }, [params.start, params.routine, params.cardio, blockFor, blocksFromSession, withTargetRows]);

  const editRow = (blockIndex: number, rowIndex: number, patch: Partial<Row>) =>
    setBlocks((current) =>
      current.map((block, bi) =>
        bi !== blockIndex
          ? block
          : {
              ...block,
              rows: block.rows.map((row, ri) => (ri !== rowIndex ? row : { ...row, ...patch })),
            },
      ),
    );

  const addRow = (blockIndex: number) =>
    setBlocks((current) =>
      current.map((block, bi) => {
        if (bi !== blockIndex) return block;
        const last = block.rows[block.rows.length - 1];
        if (block.isCardio) {
          return {
            ...block,
            rows: [
              ...block.rows,
              {
                key: newKey(),
                id: null,
                weight: '',
                reps: '0',
                setType: 'normal',
                rpe: null,
                done: false,
                isCardio: true,
                cardioMode: block.cardioMode,
                speed: last?.speed ?? '',
                incline: last?.incline ?? '',
                time: last?.time ?? '',
                distance: last?.distance ?? '',
              },
            ],
          };
        }
        // A new row copies the one above, because the next set is usually the
        // same weight; failing that, the previous session's set at that index.
        const previous = block.previous[block.rows.length];
        return {
          ...block,
          rows: [
            ...block.rows,
            {
              key: newKey(),
              id: null,
              weight:
                last?.weight ??
                (previous?.weightKg == null
                  ? ''
                  : String(displayWeight(previous.weightKg, settings.units).toFixed(1))),
              reps: last?.reps ?? (previous ? String(previous.reps) : ''),
              setType: 'normal',
              rpe: null,
              done: false,
            },
          ],
        };
      }),
    );

  const toggleBlockCardioMode = async (blockIndex: number, mode: CardioMode) => {
    const block = blocks[blockIndex];
    if (!block) return;
    setBlocks((current) =>
      current.map((b, idx) => {
        if (idx !== blockIndex) return b;
        return {
          ...b,
          cardioMode: mode,
          rows: b.rows.map((r) => ({ ...r, cardioMode: mode })),
        };
      }),
    );
    for (const r of block.rows) {
      if (r.done && r.id) {
        await updateSetValues(r.id, null, 0, { cardioMode: mode });
      }
    }
  };

  const weightOfRow = (row: Row): number => {
    const val = Number.parseFloat(row.weight.replace(',', '.'));
    return Number.isFinite(val) ? val : 0;
  };

  /**
   * The plates for the set about to be done: the first one not yet ticked that
   * has a weight in it, or failing that the last weight entered.
   */
  const plateWeightFor = (block: Block): number | null => {
    const next = block.rows.find((row) => !row.done && weightOfRow(row) > 0);
    const last = [...block.rows].reverse().find((row) => weightOfRow(row) > 0);
    const chosen = next ?? last;
    return chosen ? weightOfRow(chosen) : null;
  };

  const openPlates = (block: Block, blockIndex: number, mode: 'plates' | 'warmup' = 'plates') => {
    const nextIndex = block.rows.findIndex((row) => !row.done && row.setType !== 'warmup');
    const fallbackIndex = block.rows.findIndex((row) => !row.done);
    const targetIndex =
      nextIndex !== -1
        ? nextIndex
        : fallbackIndex !== -1
          ? fallbackIndex
          : block.rows.length > 0
            ? block.rows.length - 1
            : null;
    const initialWeight = plateWeightFor(block);

    setCalcTarget({
      blockIndex,
      rowIndex: targetIndex,
      exerciseName: block.name,
      initialWeight,
      mode,
      isBarbell: usesBarbell(block.name),
    });
  };

  /**
   * Writes the calculated plate total back into the targeted set row.
   * If the row was already marked done, updates the logged set in the database.
   */
  const applyCalculatedWeight = async (w: number) => {
    if (calcTarget?.blockIndex != null && calcTarget.rowIndex != null) {
      const bi = calcTarget.blockIndex;
      const ri = calcTarget.rowIndex;
      const block = blocks[bi];
      const row = block?.rows[ri];
      if (row) {
        editRow(bi, ri, { weight: String(w) });
        if (row.done && row.id) {
          const reps = Number(row.reps);
          if (Number.isFinite(reps) && reps > 0) {
            const kg = parseWeight(String(w), settings.units);
            await updateSetValues(row.id, kg, reps);
            setSession(await activeSession());
          }
        }
      }
    }
    setCalcTarget(null);
  };

  /**
   * Inserts the generated warm-up sets into the active exercise block.
   * Prepends the warm-up rows before any existing working sets.
   */
  const insertWarmups = (warmupSets: WarmupSet[]) => {
    if (calcTarget?.blockIndex == null) return;
    const bi = calcTarget.blockIndex;
    const block = blocks[bi];
    if (!block) return;

    const warmupRows: Row[] = warmupSets.map((ws) => ({
      key: newKey(),
      id: null,
      weight: String(ws.weight),
      reps: String(ws.reps),
      setType: 'warmup',
      done: false,
      rpe: null,
    }));

    setBlocks((current) =>
      current.map((b, index) => {
        if (index !== bi) return b;
        const firstWorkingIndex = b.rows.findIndex((r) => r.setType !== 'warmup');
        const insertAt = firstWorkingIndex !== -1 ? firstWorkingIndex : 0;
        const newRows = [...b.rows];
        newRows.splice(insertAt, 0, ...warmupRows);
        return { ...b, rows: newRows };
      }),
    );

    thud('heavy');
    notify('Warm-ups added', `Added ${warmupSets.length} warm-up sets for ${block.name}.`);
    setCalcTarget(null);
  };

  const addCustomPlate = async (plate: number) => {
    const current = settings.customPlates?.[settings.units] ?? [];
    if (current.includes(plate)) return;
    const updated = [...current, plate].sort((a, b) => b - a);
    await updateSettings({
      customPlates: { ...settings.customPlates, [settings.units]: updated },
    });
  };

  const removeCustomPlate = async (plate: number) => {
    const current = settings.customPlates?.[settings.units] ?? [];
    const updated = current.filter((p) => p !== plate);
    await updateSettings({
      customPlates: { ...settings.customPlates, [settings.units]: updated },
    });
  };

  /** Links multiple exercise blocks into a superset group. */
  const assignSupersetGroup = async (exerciseIndices: number[], group: string) => {
    setBlocks((current) =>
      current.map((b, idx) => {
        if (exerciseIndices.includes(idx)) {
          return { ...b, supersetGroup: group };
        }
        return b;
      }),
    );

    if (session) {
      for (const idx of exerciseIndices) {
        const b = blocks[idx];
        if (b) {
          await updateExerciseSupersetGroup(session.id, b.name, group);
        }
      }
      setSession(await activeSession());
    }
    thud('heavy');
    notify(
      `Superset ${group} linked`,
      `${exerciseIndices.map((i) => blocks[i]?.name).filter(Boolean).join(' & ')} are now paired.`,
    );
  };

  /** Unlinks a single exercise from its superset group. Disbands if only 1 remains. */
  const unlinkExerciseFromSuperset = async (exerciseIndex: number) => {
    const block = blocks[exerciseIndex];
    if (!block || !block.supersetGroup) return;
    const group = block.supersetGroup;
    const othersInGroup = blocks.filter((b, idx) => idx !== exerciseIndex && b.supersetGroup === group);

    const shouldDisband = othersInGroup.length <= 1;

    setBlocks((current) =>
      current.map((b, idx) => {
        if (idx === exerciseIndex || (shouldDisband && b.supersetGroup === group)) {
          return { ...b, supersetGroup: null };
        }
        return b;
      }),
    );

    if (session) {
      await updateExerciseSupersetGroup(session.id, block.name, null);
      if (shouldDisband) {
        for (const other of othersInGroup) {
          await updateExerciseSupersetGroup(session.id, other.name, null);
        }
      }
      setSession(await activeSession());
    }
    thud('light');
    notify('Unlinked', `${block.name} unlinked from Superset ${group}.`);
  };

  /** Disbands an entire superset group, unlinking all exercises in it. */
  const disbandSupersetGroup = async (group: string) => {
    const affectedBlocks = blocks.filter((b) => b.supersetGroup === group);
    setBlocks((current) =>
      current.map((b) => (b.supersetGroup === group ? { ...b, supersetGroup: null } : b)),
    );

    if (session) {
      for (const b of affectedBlocks) {
        await updateExerciseSupersetGroup(session.id, b.name, null);
      }
      setSession(await activeSession());
    }
    thud('light');
    notify('Disbanded', `Superset ${group} removed.`);
  };

  /**
   * Evaluates the best e1RM for an exercise, checking both history and any
   * working sets completed in the current workout session.
   */
  const effectiveBestPRFor = useCallback(
    (block: Block): ExercisePR | null => {
      let best = block.bestPR ? { ...block.bestPR } : null;
      for (const row of block.rows) {
        if (!row.done || row.setType === 'warmup') continue;
        const reps = Number(row.reps);
        if (!Number.isFinite(reps) || reps <= 0) continue;
        let kg: number | null = null;
        if (block.bodyweightBased) {
          const added = row.weight.trim() ? parseWeight(row.weight, settings.units) : 0;
          if (currentBodyweightKg !== null) {
            kg = currentBodyweightKg + (added ?? 0);
          }
        } else {
          kg = row.weight.trim() ? parseWeight(row.weight, settings.units) : null;
        }
        if (kg === null || kg <= 0) continue;
        const e1rm = estimate1RM(kg, reps);
        if (!best || e1rm > best.e1rm) {
          best = { e1rm, weight: kg, reps, date: todayISO() };
        }
      }
      return best;
    },
    [currentBodyweightKg, settings.units],
  );

  /** Ticking writes the set; unticking removes it. */
  const toggleRow = async (blockIndex: number, rowIndex: number) => {
    if (!session) return;
    const block = blocks[blockIndex];
    const row = block.rows[rowIndex];

    if (row.done && row.id) {
      await deleteSet(row.id);
      // The rating belonged to the set that was just deleted, not to the draft
      // row left behind, so it goes with it.
      editRow(blockIndex, rowIndex, { done: false, id: null, rpe: null });
      return;
    }

    if (block.isCardio || row.isCardio) {
      const isOutside = block.cardioMode === 'outside';
      const parsedTime = row.time?.trim() ? parseDurationSeconds(row.time) : null;
      const parsedSpeed = row.speed?.trim() ? parseSpeed(row.speed, speedUnit) : null;
      const parsedIncline = row.incline?.trim() ? parseIncline(row.incline) : null;
      const parsedDistance = row.distance?.trim() ? parseDistance(row.distance) : null;

      if (isOutside) {
        if (!parsedDistance && !parsedTime) {
          notify('Enter distance or time', 'Fill in your distance or time before ticking.');
          return;
        }
      } else {
        if (!parsedSpeed && !parsedTime) {
          notify('Enter speed or time', 'Fill in your speed or time before ticking.');
          return;
        }
      }

      await addSetToSession(session.id, {
        exerciseName: block.name,
        bodyweightBased: false,
        setIndex: rowIndex,
        weightKg: null,
        reps: 0,
        setType: 'normal',
        rpe: null,
        isCardio: true,
        cardioMode: block.cardioMode,
        speedKph: parsedSpeed,
        inclinePct: parsedIncline,
        durationSeconds: parsedTime,
        distanceKm: parsedDistance,
        supersetGroup: block.supersetGroup ?? null,
      });

      const refreshed = await activeSession();
      setSession(refreshed);
      const written = refreshed?.sets.filter((s) => s.exerciseName === block.name) ?? [];
      editRow(blockIndex, rowIndex, { done: true, id: written[written.length - 1]?.id ?? null });

      const estimatedSteps = isOutside
        ? estimateSteps(
            parsedDistance,
            parsedTime && parsedDistance ? parsedDistance / (parsedTime / 3600) : null,
          )
        : calculateTreadmillMetrics(parsedSpeed, parsedIncline, parsedTime).estimatedSteps;

      thud('heavy');
      setLanded({
        rowKey: row.key,
        content: {
          figure: estimatedSteps
            ? formatStepEstimate(estimatedSteps).toUpperCase()
            : isOutside
              ? row.distance?.trim()
                ? `${row.distance.trim()} KM`
                : `${row.time?.trim() ?? ''} MIN`
              : row.speed?.trim()
                ? `${row.speed.trim()} ${speedUnit.toUpperCase()}`
                : `${row.time?.trim() ?? ''} MIN`,
          verdict: 'CARDIO DONE',
        },
      });

      if (block.supersetGroup) {
        const groupBlocks = blocks.filter((b) => b.supersetGroup === block.supersetGroup);
        const myIndexInGroup = groupBlocks.findIndex((b) => b.name === block.name);
        const isLastInGroup = myIndexInGroup === groupBlocks.length - 1;

        if (!isLastInGroup) {
          const nextBlock = groupBlocks[myIndexInGroup + 1];
          setRest(null);
          notify(`Next Up · Superset ${block.supersetGroup}`, `Move straight to ${nextBlock.name}!`);
        } else {
          const completedRounds = block.rows.slice(0, rowIndex + 1).filter((r) => r.done || r.key === row.key).length;
          if (settings.restSound) primeChime();
          setRest({ endsAt: Date.now() + settings.restSeconds * 1000, total: settings.restSeconds });
          notify(`Round ${completedRounds} Done!`, `Rest now before the next round of Superset ${block.supersetGroup}.`);
        }
      }
      return;
    }

    const reps = Number(row.reps);
    if (!Number.isFinite(reps) || reps <= 0) {
      notify('How many reps?', 'Enter a rep count above zero before ticking the set.');
      return;
    }
    const kg = row.weight.trim() ? parseWeight(row.weight, settings.units) : null;
    if (row.weight.trim() && kg === null) {
      notify('That weight did not parse', `Enter a number in ${unit}, or leave it blank.`);
      return;
    }

    await addSetToSession(session.id, {
      exerciseName: block.name,
      bodyweightBased: block.bodyweightBased,
      setIndex: rowIndex,
      weightKg: kg,
      reps,
      setType: row.setType,
      rpe: null,
      supersetGroup: block.supersetGroup ?? null,
    });

    const refreshed = await activeSession();
    setSession(refreshed);
    const written = refreshed?.sets.filter((s) => s.exerciseName === block.name) ?? [];
    editRow(blockIndex, rowIndex, { done: true, id: written[written.length - 1]?.id ?? null });

    const currentBestPR = effectiveBestPRFor(block);
    const effectiveKg = block.bodyweightBased
      ? (currentBodyweightKg !== null ? currentBodyweightKg + (kg ?? 0) : null)
      : kg;
    const isNewPR =
      row.setType !== 'warmup' &&
      effectiveKg !== null &&
      effectiveKg > 0 &&
      (!currentBestPR || estimate1RM(effectiveKg, reps) > currentBestPR.e1rm);

    if (isNewPR) {
      thud('heavy');
      const e1rm = estimate1RM(effectiveKg, reps);
      const targetE1rm = currentBestPR?.e1rm ?? 0;
      const delta = targetE1rm > 0 ? Math.max(0, e1rm - targetE1rm) : 0;
      const isFirstLog = !currentBestPR;
      const loadText = block.bodyweightBased
        ? (kg !== null && kg > 0 ? `+${displayWeight(kg, settings.units).toFixed(1)} ${unit}` : 'BW')
        : `${displayWeight(kg ?? 0, settings.units).toFixed(1)} ${unit}`;
      setCelebrationPR({
        exerciseName: block.name,
        figure: `${loadText} × ${reps}`,
        e1rm,
        delta,
        isFirstLog,
      });
    }

    // Written, so now say so. The frame draws itself over the row and takes no
    // touches, so ticking the next set during it behaves as normal.
    setLanded({
      rowKey: row.key,
      content: impactContent(
        kg === null ? null : displayWeight(kg, settings.units),
        reps,
        row.setType,
        isNewPR,
      ),
    });

    if (block.supersetGroup) {
      const groupBlocks = blocks.filter((b) => b.supersetGroup === block.supersetGroup);
      const myIndexInGroup = groupBlocks.findIndex((b) => b.name === block.name);
      const isLastInGroup = myIndexInGroup === groupBlocks.length - 1;

      if (!isLastInGroup) {
        // Not the last in round: prompt next exercise immediately with zero rest delay
        const nextBlock = groupBlocks[myIndexInGroup + 1];
        setRest(null);
        notify(
          `Next Up · Superset ${block.supersetGroup}`,
          `Move straight to ${nextBlock.name}!`,
        );
      } else {
        // Last exercise in the superset round completed: trigger full rest timer!
        const completedRounds = block.rows.slice(0, rowIndex + 1).filter((r) => r.done || r.key === row.key).length;
        if (settings.restSound) primeChime(settings.restChimeChoice ?? 'chime');
        setRest({ endsAt: Date.now() + settings.restSeconds * 1000, total: settings.restSeconds });
        notify(
          `Round ${completedRounds} Done!`,
          `Rest now before the next round of Superset ${block.supersetGroup}.`,
        );
      }
    } else {
      // Rest starts itself. The alternative is tapping "start rest" after every
      // set, which nobody does twice. The tick is a tap, which is what a browser
      // needs before it will let the chime play when the rest runs out.
      if (settings.restSound) primeChime(settings.restChimeChoice ?? 'chime');
      setRest({ endsAt: Date.now() + settings.restSeconds * 1000, total: settings.restSeconds });
    }
  };

  /** Keeps an already-written set in step with an edited row. */
  const commitEdit = async (blockIndex: number, rowIndex: number) => {
    const row = blocks[blockIndex].rows[rowIndex];
    if (!row.done || !row.id) return;

    if (row.isCardio || blocks[blockIndex].isCardio) {
      const parsedTime = row.time?.trim() ? parseDurationSeconds(row.time) : null;
      const parsedSpeed = row.speed?.trim() ? parseSpeed(row.speed, speedUnit) : null;
      const parsedIncline = row.incline?.trim() ? parseIncline(row.incline) : null;
      const parsedDistance = row.distance?.trim() ? parseDistance(row.distance) : null;
      await updateSetValues(row.id, null, 0, {
        speedKph: parsedSpeed,
        inclinePct: parsedIncline,
        durationSeconds: parsedTime,
        distanceKm: parsedDistance,
        cardioMode: blocks[blockIndex].cardioMode,
      });
      setSession(await activeSession());
      return;
    }

    const reps = Number(row.reps);
    if (!Number.isFinite(reps) || reps <= 0) return;
    const kg = row.weight.trim() ? parseWeight(row.weight, settings.units) : null;

    await updateSetValues(row.id, kg, reps);
    setSession(await activeSession());
  };

  /**
   * Adds a block. `name` is the name the sets will be written under.
   *
   * Never the catalogue's `canonicalName` when a recorded name exists: `sets`
   * carries its own `exercise_name` and PREVIOUS, the progression list and the
   * icon map all key on it, so logging the model's spelling of a lift already on
   * record forks it in two and blanks the history of both halves.
   */
  const addExercise = async (
    name: string,
    catalogueBodyweight?: boolean,
    cardio?: { isCardio: boolean; mode: CardioMode },
  ) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (blocks.some((b) => b.name === trimmed)) {
      setPicking(false);
      return notify('Already here', `${trimmed} is already in this session.`);
    }
    // The stored flag first, the catalogue's second. `exercises.bodyweight_based`
    // may hold a correction the user made through Settings, and the model's
    // guess must not quietly overwrite it — a row on record beats a guess.
    const isDetectedCardio = detectCardio(trimmed);
    const isCardio =
      cardio?.isCardio ||
      (known.find((k) => k.name === trimmed)?.isCardio ?? false) ||
      isDetectedCardio;
    const cardioMode = (cardio?.mode ??
      known.find((k) => k.name === trimmed)?.cardioMode ??
      detectCardioMode(trimmed)) as CardioMode;
    const bodyweightBased =
      known.find((k) => k.name === trimmed)?.bodyweightBased ?? catalogueBodyweight ?? false;
    const block = await blockFor(trimmed, bodyweightBased, [], null, isCardio, cardioMode);
    const withRows = withTargetRows(block);
    setBlocks((current) => [...current, withRows]);
    setPicking(false);
  };

  /**
   * Opens the how-to sheet, or says why it cannot.
   *
   * A tap that resolves to `null` used to do nothing at all, which reads as a
   * broken control rather than as an absence.
   */
  const showInfoFor = async (name: string) => {
    const entry = await exerciseInfoFor(name, settings.foodLookup.geminiApiKey);
    if (entry) {
      void loadAllCatalogueEntries().then((entries) => {
        setCatalogue(entries);
        warmCatalogueCache(entries);
      });
      void cataloguePatternsByExerciseName().then(setPatterns);
      return setInfo(entry);
    }
    notify(
      'No how-to yet',
      `Nothing is catalogued for ${name}. Settings can build the catalogue from your history.`,
    );
  };

  /**
   * Records a rating against the written set.
   *
   * Only reachable from a ticked row, so `id` is present — but it is checked
   * anyway rather than asserted, because the row could be unticked underneath
   * an open sheet.
   */
  const rateRow = async (blockIndex: number, rowIndex: number, rpe: number | null) => {
    setRating(null);
    const row = blocks[blockIndex]?.rows[rowIndex];
    if (!row?.id) return;
    await setSetRpe(row.id, rpe);
    editRow(blockIndex, rowIndex, { rpe });
  };

  const removeExercise = async (blockIndex: number) => {
    const block = blocks[blockIndex];
    const sure = await confirm({
      title: `Remove ${block.name}?`,
      message: block.rows.some((r) => r.done)
        ? 'Its logged sets will be deleted too.'
        : undefined,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!sure) return;

    for (const row of block.rows) if (row.id) await deleteSet(row.id);
    setBlocks((current) => current.filter((_, i) => i !== blockIndex));
    setSession(await activeSession());
  };

  /**
   * Replaces an exercise block with an alternative mid-workout.
   *
   * If 'swap-all' (or if no sets are logged yet), converts the block and any
   * logged sets to the new exercise.
   * If 'swap-remaining', keeps completed sets on the original exercise block,
   * and splits the remaining planned sets into a new block for the replacement.
   */
  const swapExercise = async (
    blockIndex: number,
    newExercise: {
      name: string;
      bodyweightBased: boolean;
      isCardio: boolean;
      cardioMode?: CardioMode | null;
    },
    mode: SwapMode,
  ) => {
    const targetBlock = blocks[blockIndex];
    if (!targetBlock) return;
    const trimmed = newExercise.name.trim();
    if (!trimmed || trimmed.toLowerCase() === targetBlock.name.toLowerCase()) return;

    const isDetectedCardio = detectCardio(trimmed);
    const isCardio =
      newExercise.isCardio ||
      (known.find((k) => k.name === trimmed)?.isCardio ?? false) ||
      isDetectedCardio;
    const cardioMode = (newExercise.cardioMode ??
      known.find((k) => k.name === trimmed)?.cardioMode ??
      detectCardioMode(trimmed)) as CardioMode;
    const bodyweightBased =
      known.find((k) => k.name === trimmed)?.bodyweightBased ?? newExercise.bodyweightBased;

    const [newPrevious, newBestPR] = await Promise.all([
      lastSessionSets(trimmed),
      exerciseBestPR(trimmed, bodyweightBased, series, currentBodyweightKg),
    ]);

    const completedRows = targetBlock.rows.filter((r) => r.done && r.id != null);
    const hasLoggedSets = completedRows.length > 0;

    if (mode === 'swap-all' || !hasLoggedSets) {
      if (hasLoggedSets) {
        const setIds = completedRows.map((r) => r.id!).filter(Boolean);
        await updateSetsExercise(setIds, trimmed, bodyweightBased, isCardio, cardioMode);
        setSession(await activeSession());
      }

      const updatedRows: Row[] = targetBlock.rows.map((row, idx) => {
        if (row.done) {
          return {
            ...row,
            isCardio,
            cardioMode,
          };
        }
        const prev = newPrevious[idx];
        return {
          ...row,
          weight:
            prev?.weightKg != null
              ? String(displayWeight(prev.weightKg, settings.units).toFixed(1))
              : row.weight,
          reps: prev?.reps != null ? String(prev.reps) : row.reps || targetBlock.target?.reps || '8',
          isCardio,
          cardioMode,
        };
      });

      setBlocks((current) =>
        current.map((b, bi) =>
          bi !== blockIndex
            ? b
            : {
                ...b,
                name: trimmed,
                bodyweightBased,
                isCardio,
                cardioMode,
                previous: newPrevious,
                bestPR: newBestPR,
                rows: updatedRows,
              },
        ),
      );

      void cataloguePatternsByExerciseName().then(setPatterns);
      void listExerciseNames().then(setKnown);
      notify('Movement swapped', `Replaced ${targetBlock.name} with ${trimmed}.`);
    } else {
      // mode === 'swap-remaining'
      const completedList = targetBlock.rows.filter((r) => r.done);
      const remainingDrafts = targetBlock.rows.filter((r) => !r.done);
      const remainingCount = Math.max(1, remainingDrafts.length);

      const newDraftRows: Row[] = Array.from({ length: remainingCount }, (_, offset) => {
        const prev = newPrevious[offset];
        return {
          key: newKey(),
          id: null,
          weight:
            prev?.weightKg != null
              ? String(displayWeight(prev.weightKg, settings.units).toFixed(1))
              : '',
          reps: repsPrefill(prev?.reps, targetBlock.target?.reps ?? null),
          setType: 'normal',
          rpe: null,
          done: false,
          isCardio,
          cardioMode,
        };
      });

      const newBlock: Block = {
        name: trimmed,
        bodyweightBased,
        isCardio,
        cardioMode,
        rows: newDraftRows,
        previous: newPrevious,
        bestPR: newBestPR,
        target: targetBlock.target
          ? { ...targetBlock.target, sets: remainingCount }
          : null,
        supersetGroup: targetBlock.supersetGroup ?? null,
      };

      setBlocks((current) => {
        const next = [...current];
        const updatedTargetBlock: Block = {
          ...targetBlock,
          rows: completedList,
          target: targetBlock.target ? { ...targetBlock.target, sets: completedList.length } : null,
        };
        next.splice(blockIndex, 1, updatedTargetBlock, newBlock);
        return next;
      });

      void cataloguePatternsByExerciseName().then(setPatterns);
      void listExerciseNames().then(setKnown);
      notify(
        'Swapped remaining sets',
        `${trimmed} added for remaining ${remainingCount} set${remainingCount > 1 ? 's' : ''}.`,
      );
    }
  };

  const finish = async () => {
    if (!session) return;
    const logged = blocks.reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);

    if (logged === 0) {
      const sure = await confirm({
        title: 'Nothing logged',
        message: 'No sets were ticked. Discard this session?',
        confirmLabel: 'Discard',
        destructive: true,
      });
      if (!sure) return;
      await discardSession(session.id);
      router.back();
      return;
    }

    await finishSession(session.id);

    /*
      Checked after the session is written, so today's sets are part of the
      history being judged against. At most one is shown — the list comes back
      rarest first, and a day that happens to cross three rungs is still one
      moment, not three dialogs.

      A failure here must not strand someone in a finished workout, so it falls
      through to leaving: the milestone is the reward, not the receipt.
    */
    try {
      const allSets = await listAllSets();
      const reached = milestonesOn(
        allSets,
        bodyweightForDates(series, allSets.map((entry) => entry.date), { extend: true }),
        session.date,
        laddersFor(settings.units),
      );
      if (reached[0] !== undefined) setMilestone(reached[0]);
      // The milestone's celebration comes first; the share sheet waits behind it.
      const workout: FinishedWorkout = {
        sessionId: session.id,
        title: session.name,
        date: session.date,
        startedAt: session.startedAt,
        finishedAt: new Date(),
        sets: await sessionSets(session.id),
        milestone: reached[0] ?? null,
      };
      setFinished({ workout, summary: shareSummary({ ...workout, units: settings.units }) });
      return;
    } catch {
      // Nothing to say, and nothing worth blocking the exit for.
    }

    const strengthLogged = blocks.filter((b) => !b.isCardio).reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);
    const cardioLogged = blocks.filter((b) => b.isCardio).reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);
    const message =
      strengthLogged > 0
        ? `${strengthLogged} ${strengthLogged === 1 ? 'set' : 'sets'} logged${cardioLogged > 0 ? ` + ${cardioLogged} cardio` : ''}.`
        : `${cardioLogged} cardio logged.`;
    notify('Workout saved', message);
    router.back();
  };

  if (loading) {
    return (
      <Screen tone="loud">
        <ActivityIndicator color={loud.loud} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen tone="loud">
        <View style={styles.headerRow}>
          <Text style={styles.screenTitle}>WORKOUT</Text>
          {renderControls()}
        </View>
        <Text style={[styles.note, { marginBottom: space.lg }]}>
          Start an empty workout, or pick one of your routines.
        </Text>
        <Tappable onPress={() => router.replace('/session?start=blank')} scaleTo={0.97}>
          <SlashPanel color={loud.loud} style={styles.slab}>
            <Text style={[styles.slabLabel, { color: loud.onLoud }]}>START AN EMPTY WORKOUT</Text>
          </SlashPanel>
        </Tappable>
        {routines.map((routine, index) => (
          <FadeIn key={routine.id} delay={Math.min(index, 5) * 40}>
            <Tappable onPress={() => router.replace(`/session?routine=${routine.id}`)} scaleTo={0.97}>
              <SlashPanel color={loud.panel} style={styles.slab}>
                <Text style={[styles.slabLabel, { color: loud.figure }]}>
                  {routine.name.toUpperCase()}
                </Text>
              </SlashPanel>
            </Tappable>
          </FadeIn>
        ))}
        <SessionOptionsSheet
          open={optionsOpen}
          onClose={() => setOptionsOpen(false)}
          units={settings.units}
          onToggleUnits={toggleWeightUnits}
          speedUnit={speedUnit}
          onToggleSpeedUnits={toggleSpeedUnits}
          showWeightSwitcher={showWeightSwitcher}
          showSpeedSwitcher={showSpeedSwitcher}
          restSound={settings.restSound}
          onToggleAlert={toggleAlert}
          restChimeChoice={settings.restChimeChoice ?? 'chime'}
          onChangeChimeChoice={changeChimeChoice}
          restSeconds={settings.restSeconds}
          onChangeRestSeconds={changeRestSeconds}
          onStepRestSeconds={stepRestSeconds}
        />
      </Screen>
    );
  }

  const strengthCount = blocks.filter((b) => !b.isCardio).reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);
  const cardioCount = blocks.filter((b) => b.isCardio).reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);

  return (
    <View style={styles.sessionRoot}>
      <Screen tone="loud">
        <View style={styles.headerRow}>
        <Text style={styles.screenTitle} numberOfLines={1}>
          {session.name.toUpperCase()}
        </Text>
        {renderControls()}
      </View>

      {/*
        The clock is the hero figure now. It was 20px with the set count as a
        footnote beneath it, which for a screen you glance at from arm's length
        between sets had the emphasis exactly backwards.
      */}
      <View style={styles.hero}>
        <View style={styles.heroFigures}>
          <Text style={styles.clock}>{elapsed(session.startedAt, now)}</Text>
          <View style={styles.heroCounts}>
            {strengthCount > 0 ? (
              <View style={styles.heroCount}>
                <CountUp value={strengthCount} style={styles.countFigure} />
                <Text style={styles.countLabel}>{strengthCount === 1 ? 'SET' : 'SETS'}</Text>
              </View>
            ) : totalSteps === 0 && cardioCount === 0 ? (
              <View style={styles.heroCount}>
                <CountUp value={0} style={styles.countFigure} />
                <Text style={styles.countLabel}>SETS</Text>
              </View>
            ) : null}
            {totalSteps > 0 && (
              <>
                {strengthCount > 0 && <Text style={styles.heroCountDivider}>·</Text>}
                <View style={styles.heroCount}>
                  <CountUp
                    value={totalSteps}
                    format={(n) => `~${Math.round(n).toLocaleString('en-US')}`}
                    style={styles.countFigure}
                  />
                  <Text style={styles.countLabel}>STEPS</Text>
                </View>
              </>
            )}
          </View>
        </View>
        <Tappable onPress={() => void finish()} scaleTo={0.93}>
          <SlashPanel color={loud.loud} style={styles.finish}>
            <Text style={styles.finishLabel}>FINISH</Text>
          </SlashPanel>
        </Tappable>
      </View>

      {/*
        Above the exercises rather than pinned to the screen: it belongs to the
        set you just finished, and the thing you look at next is the row under
        it. A floating bar would cover a row at the exact moment you want to
        read it.
      */}
      {rest !== null && restRemaining !== null && (
        <RestBar
          remaining={restRemaining}
          total={rest.total}
          onAdjust={nudgeRest}
          onSkip={() => setRest(null)}
          soundOn={settings.restSound}
          onToggleSound={toggleAlert}
        />
      )}

      {blocks.map((block, blockIndex) => {
        const group = block.supersetGroup;
        const supersetStyle = group ? getSupersetStyle(group) : null;
        const countInGroup = group ? blocks.filter((b) => b.supersetGroup === group).length : 0;
        const isGiantSet = countInGroup >= 3;
        const isLastInGroup = group
          ? blockIndex === blocks.length - 1 || blocks[blockIndex + 1]?.supersetGroup !== group
          : true;

        return (
          <FadeIn key={block.name} delay={Math.min(blockIndex, 4) * 40}>
            <View
              style={[
                styles.block,
                supersetStyle && {
                  borderLeftWidth: 3,
                  borderLeftColor: supersetStyle.border,
                  paddingLeft: space.sm + 2,
                  marginBottom: isLastInGroup ? space.xl : space.md,
                },
              ]}
            >
              {/*
                A red tab holding the movement glyph, then the name on its own
                leaning slab. The name was 16px semibold beside a muted glyph,
                which is most of why this screen read as a spreadsheet with a
                title on it.
              */}
              <View style={styles.blockHeader}>
                <Tappable
                  onPress={() => void showInfoFor(block.name)}
                  style={styles.blockTitle}
                  scaleTo={0.985}
                  accessibilityRole="button"
                  accessibilityLabel={`How to do ${block.name}`}
                >
                  <SlashPanel color={loud.loud} style={styles.glyphTab}>
                    <ExerciseIcon
                      pattern={patterns[block.name]}
                      isCardio={block.isCardio}
                      size={18}
                      color={loud.onLoud}
                    />
                  </SlashPanel>
                  <SlashPanel color={loud.panel} style={styles.nameSlab}>
                    <View style={styles.nameSlabRow}>
                      <Text style={styles.blockName} numberOfLines={1}>
                        {block.name.toUpperCase()}
                      </Text>
                      <Ionicons name="information-circle-outline" size={15} color={loud.figureMuted} />
                    </View>
                  </SlashPanel>
                </Tappable>

                <Tappable
                  onPress={() => void removeExercise(blockIndex)}
                  style={styles.iconBtn}
                  scaleTo={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${block.name}`}
                >
                  <Text style={styles.remove}>✕</Text>
                </Tappable>
              </View>

              {/* Compact exercise action bar: How-To, Warm-up, Plates, Swap, Superset */}
              <View style={styles.blockActionsRow}>
                <Tappable
                  onPress={() => void showInfoFor(block.name)}
                  style={styles.actionPillBtn}
                  scaleTo={0.92}
                  accessibilityRole="button"
                  accessibilityLabel={`Exercise details and form guide for ${block.name}`}
                >
                  <View style={styles.actionPill}>
                    <Ionicons name="body-outline" size={12} color={loud.figureMuted} />
                    <Text style={styles.actionPillText}>FORM</Text>
                  </View>
                </Tappable>

                {!block.isCardio && !block.bodyweightBased && (
                  <Tappable
                    onPress={() => openPlates(block, blockIndex, 'warmup')}
                    style={styles.actionPillBtn}
                    scaleTo={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={`Generate warm-up sets for ${block.name}`}
                  >
                    <View style={styles.actionPill}>
                      <Ionicons name="flame-outline" size={12} color={loud.warn} />
                      <Text style={styles.actionPillText}>WARM-UP</Text>
                    </View>
                  </Tappable>
                )}

                {!block.isCardio && !block.bodyweightBased && usesBarbell(block.name) && (
                  <Tappable
                    onPress={() => openPlates(block, blockIndex, 'plates')}
                    style={styles.actionPillBtn}
                    scaleTo={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={`Barbell plate calculator for ${block.name}`}
                  >
                    <View style={styles.actionPill}>
                      <Ionicons name="barbell-outline" size={12} color={loud.figureMuted} />
                      <Text style={styles.actionPillText}>PLATES</Text>
                    </View>
                  </Tappable>
                )}

                <Tappable
                  onPress={() => setSwapTargetIndex(blockIndex)}
                  style={styles.actionPillBtn}
                  scaleTo={0.92}
                  accessibilityRole="button"
                  accessibilityLabel={`Swap ${block.name} with an alternative`}
                >
                  <View style={styles.actionPill}>
                    <Ionicons name="swap-horizontal" size={12} color={loud.figureMuted} />
                    <Text style={styles.actionPillText}>SWAP</Text>
                  </View>
                </Tappable>

                {block.supersetGroup ? (
                  <Tappable
                    onPress={() => setSupersetTargetIndex(blockIndex)}
                    style={styles.actionPillBtn}
                    scaleTo={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={`${isGiantSet ? 'Giant Set' : 'Superset'} ${block.supersetGroup}. Tap to manage.`}
                  >
                    <View
                      style={[
                        styles.supersetBadge,
                        {
                          borderColor: supersetStyle?.border ?? loud.rule,
                          backgroundColor: supersetStyle?.bg ?? loud.panel,
                        },
                      ]}
                    >
                      <Ionicons
                        name={isGiantSet ? 'flash' : 'link'}
                        size={11}
                        color={supersetStyle?.text ?? loud.figure}
                      />
                      <Text
                        style={[
                          styles.supersetBadgeText,
                          { color: supersetStyle?.text ?? loud.figure },
                        ]}
                      >
                        {isGiantSet ? 'GIANT' : 'SUPER'} {block.supersetGroup}
                      </Text>
                    </View>
                  </Tappable>
                ) : (
                  <Tappable
                    onPress={() => setSupersetTargetIndex(blockIndex)}
                    style={styles.actionPillBtn}
                    scaleTo={0.92}
                    accessibilityRole="button"
                    accessibilityLabel={`Link ${block.name} into a superset`}
                  >
                    <View style={styles.actionPill}>
                      <Ionicons name="link-outline" size={12} color={loud.figureMuted} />
                      <Text style={styles.actionPillText}>LINK</Text>
                    </View>
                  </Tappable>
                )}
              </View>

            {block.isCardio && (
              <View style={styles.cardioModeRow}>
                <Tappable
                  onPress={() => void toggleBlockCardioMode(blockIndex, 'treadmill')}
                  style={[
                    styles.cardioModeChip,
                    block.cardioMode === 'treadmill' && styles.cardioModeChipActive,
                  ]}
                  scaleTo={0.95}
                >
                  <Text
                    style={[
                      styles.cardioModeChipText,
                      block.cardioMode === 'treadmill' && styles.cardioModeChipTextActive,
                    ]}
                  >
                    🏃 MACHINE
                  </Text>
                </Tappable>
                <Tappable
                  onPress={() => void toggleBlockCardioMode(blockIndex, 'outside')}
                  style={[
                    styles.cardioModeChip,
                    block.cardioMode === 'outside' && styles.cardioModeChipActive,
                  ]}
                  scaleTo={0.95}
                >
                  <Text
                    style={[
                      styles.cardioModeChipText,
                      block.cardioMode === 'outside' && styles.cardioModeChipTextActive,
                    ]}
                  >
                    🌲 OUTSIDE / DISTANCE
                  </Text>
                </Tappable>
              </View>
            )}

            {!block.isCardio && (() => {
              const best = effectiveBestPRFor(block);
              const targetText = block.target ? targetLabel(block.target.sets, block.target.reps) : null;
              if (!best && !targetText) return null;
              return (
                <View style={styles.blockMetaRow}>
                  {targetText && <Text style={styles.target}>{targetText}</Text>}
                  {best && (
                    <View style={styles.prHeaderBadge}>
                      <Text style={styles.prHeaderLabel}>PR</Text>
                      <Text style={styles.prHeaderValue}>
                        {displayWeight(best.weight, settings.units).toFixed(1)} {unit.toUpperCase()} × {best.reps}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })()}
            {block.isCardio && block.target && (
              <Text style={styles.target}>
                {block.target.targetTime ? `Target: ${block.target.targetTime}` : ''}
                {block.target.targetDistance != null
                  ? ` · ${displayDistance(block.target.targetDistance)?.toFixed(1)} km`
                  : ''}
                {block.target.targetSpeed != null
                  ? ` · ${displaySpeed(block.target.targetSpeed, speedUnit)?.toFixed(1)} ${speedUnit}`
                  : ''}
                {block.target.targetIncline != null ? ` · ${block.target.targetIncline}%` : ''}
              </Text>
            )}

            {!block.isCardio && (
              <View style={styles.columns}>
                <Text style={[styles.col, styles.colSet]}>SET</Text>
                <Text style={[styles.col, styles.colPrev]}>PREVIOUS</Text>
                <Text style={[styles.col, styles.colNum]}>{unit.toUpperCase()}</Text>
                <Text style={[styles.col, styles.colNum]}>REPS</Text>
                <Text style={[styles.col, styles.colRpe]}>RPE</Text>
                <View style={styles.colTick} />
              </View>
            )}
            {block.isCardio && block.cardioMode === 'treadmill' && (
              <View style={styles.columns}>
                <Text style={[styles.col, styles.colSet]}>#</Text>
                <Text style={[styles.col, styles.colPrev]}>PREVIOUS</Text>
                <Text style={[styles.col, styles.colCardioSpd]}>{speedUnit.toUpperCase()}</Text>
                <Text style={[styles.col, styles.colCardioInc]}>INCL%</Text>
                <Text style={[styles.col, styles.colCardioTime]}>MIN</Text>
                <View style={styles.colTick} />
              </View>
            )}
            {block.isCardio && block.cardioMode === 'outside' && (
              <View style={styles.columns}>
                <Text style={[styles.col, styles.colSet]}>#</Text>
                <Text style={[styles.col, styles.colPrev]}>PREVIOUS</Text>
                <Text style={[styles.col, styles.colCardioDist]}>KM</Text>
                <Text style={[styles.col, styles.colCardioTimeWide]}>MIN</Text>
                <View style={styles.colTick} />
              </View>
            )}

            {block.rows.map((row, rowIndex) => {
                const previous = block.previous[rowIndex];
                const previousLabel = previous
                  ? block.isCardio
                    ? formatCardioEffort(previous, speedUnit)
                    : `${
                        previous.weightKg === null
                          ? 'BW'
                          : displayWeight(previous.weightKg, settings.units).toFixed(1)
                      } × ${previous.reps}${previous.rpe === null ? '' : ` @${formatRpe(previous.rpe)}`}`
                  : '—';
                const on = row.done ? loud.onLoud : loud.figure;

                const liveEstimate = block.isCardio
                  ? formatLiveCardioEstimate(
                      {
                        mode: block.cardioMode ?? 'treadmill',
                        speedKph: row.speed?.trim() ? parseSpeed(row.speed, speedUnit) : null,
                        inclinePct: row.incline?.trim() ? parseIncline(row.incline) : null,
                        durationSeconds: row.time?.trim() ? parseDurationSeconds(row.time) : null,
                        distanceKm: row.distance?.trim() ? parseDistance(row.distance) : null,
                      },
                      speedUnit,
                    )
                  : null;

                return (
                  <View key={row.key}>
                    <View
                      style={[
                        styles.row,
                        row.done
                          ? { backgroundColor: loud.loud, borderColor: loud.loud }
                          : { backgroundColor: 'transparent', borderColor: loud.rule },
                      ]}
                    >
                      <Tappable
                        onPress={() =>
                          !block.isCardio &&
                          editRow(blockIndex, rowIndex, {
                            setType: row.setType === 'normal' ? 'warmup' : 'normal',
                          })
                        }
                        scaleTo={block.isCardio ? 1 : 0.8}
                        style={styles.colSet}
                      >
                        <Text
                          style={[
                            styles.setFigure,
                            { color: row.setType === 'warmup' && !row.done ? loud.warn : on },
                          ]}
                        >
                          {/* Working sets are numbered among themselves, so a warm-up first
                              gives "W, 1, 2" rather than "W, 2, 3" — as the past workout reads. */}
                          {row.setType === 'warmup'
                            ? 'W'
                            : block.rows.slice(0, rowIndex + 1).filter((r) => r.setType !== 'warmup').length}
                        </Text>
                      </Tappable>

                      <Text
                        style={[
                          styles.previous,
                          styles.colPrev,
                          { color: row.done ? loud.onLoud : loud.figureFaint },
                        ]}
                        numberOfLines={1}
                      >
                        {previousLabel}
                      </Text>

                      {block.isCardio ? (
                        block.cardioMode === 'outside' ? (
                          <>
                            <TextInput
                              value={row.distance ?? ''}
                              onChangeText={(distance) => editRow(blockIndex, rowIndex, { distance })}
                              onBlur={() => void commitEdit(blockIndex, rowIndex)}
                              {...NOT_A_LOGIN}
                              keyboardType="decimal-pad"
                              placeholder="—"
                              placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                              style={[
                                styles.input,
                                styles.colCardioDist,
                                row.done ? styles.inputOnLoud : styles.inputOnGround,
                                { color: on },
                              ]}
                            />
                            <TextInput
                              value={row.time ?? ''}
                              onChangeText={(time) => editRow(blockIndex, rowIndex, { time })}
                              onBlur={() => void commitEdit(blockIndex, rowIndex)}
                              {...NOT_A_LOGIN}
                              keyboardType="decimal-pad"
                              placeholder="30"
                              placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                              style={[
                                styles.input,
                                styles.colCardioTimeWide,
                                row.done ? styles.inputOnLoud : styles.inputOnGround,
                                { color: on },
                              ]}
                            />
                          </>
                        ) : (
                          <>
                            <TextInput
                              value={row.speed ?? ''}
                              onChangeText={(speed) => editRow(blockIndex, rowIndex, { speed })}
                              onBlur={() => void commitEdit(blockIndex, rowIndex)}
                              {...NOT_A_LOGIN}
                              keyboardType="decimal-pad"
                              placeholder="—"
                              placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                              style={[
                                styles.input,
                                styles.colCardioSpd,
                                row.done ? styles.inputOnLoud : styles.inputOnGround,
                                { color: on },
                              ]}
                            />
                            <TextInput
                              value={row.incline ?? ''}
                              onChangeText={(incline) => editRow(blockIndex, rowIndex, { incline })}
                              onBlur={() => void commitEdit(blockIndex, rowIndex)}
                              {...NOT_A_LOGIN}
                              keyboardType="decimal-pad"
                              placeholder="0"
                              placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                              style={[
                                styles.input,
                                styles.colCardioInc,
                                row.done ? styles.inputOnLoud : styles.inputOnGround,
                                { color: on },
                              ]}
                            />
                            <TextInput
                              value={row.time ?? ''}
                              onChangeText={(time) => editRow(blockIndex, rowIndex, { time })}
                              onBlur={() => void commitEdit(blockIndex, rowIndex)}
                              {...NOT_A_LOGIN}
                              keyboardType="decimal-pad"
                              placeholder="30"
                              placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                              style={[
                                styles.input,
                                styles.colCardioTime,
                                row.done ? styles.inputOnLoud : styles.inputOnGround,
                                { color: on },
                              ]}
                            />
                          </>
                        )
                      ) : (
                        <>
                          <TextInput
                            value={row.weight}
                            onChangeText={(weight) => editRow(blockIndex, rowIndex, { weight })}
                            onBlur={() => void commitEdit(blockIndex, rowIndex)}
                            {...NOT_A_LOGIN}
                            keyboardType="decimal-pad"
                            placeholder={block.bodyweightBased ? 'BW' : '—'}
                            placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                            style={[
                              styles.input,
                              styles.colNum,
                              row.done ? styles.inputOnLoud : styles.inputOnGround,
                              { color: on },
                            ]}
                          />
                          <TextInput
                            value={row.reps}
                            onChangeText={(reps) => editRow(blockIndex, rowIndex, { reps })}
                            onBlur={() => void commitEdit(blockIndex, rowIndex)}
                            {...NOT_A_LOGIN}
                            keyboardType="number-pad"
                            placeholder="—"
                            placeholderTextColor={row.done ? loud.onLoud : loud.figureFaint}
                            style={[
                              styles.input,
                              styles.colNum,
                              row.done ? styles.inputOnLoud : styles.inputOnGround,
                              { color: on },
                            ]}
                          />
                          {row.done ? (
                            <Tappable
                              onPress={() => setRating({ blockIndex, rowIndex })}
                              scaleTo={0.82}
                              style={styles.colRpe}
                              accessibilityLabel={
                                row.rpe === null
                                  ? 'Rate how hard this set felt'
                                  : `Rated ${formatRpe(row.rpe)}. Change it.`
                              }
                            >
                              <View
                                style={[
                                  styles.rpeChip,
                                  row.rpe === null ? styles.rpeChipEmpty : styles.rpeChipSet,
                                ]}
                              >
                                <Text style={[styles.rpeValue, { color: loud.onLoud }]}>
                                  {row.rpe === null ? '+' : formatRpe(row.rpe)}
                                </Text>
                              </View>
                            </Tappable>
                          ) : (
                            <View style={styles.colRpe} />
                          )}
                        </>
                      )}

                      <Tappable
                        onPress={() => void toggleRow(blockIndex, rowIndex)}
                        scaleTo={0.78}
                        style={styles.colTick}
                        accessibilityLabel={row.done ? 'Undo this set' : 'Record this set'}
                      >
                        <Text style={[styles.tick, { color: row.done ? loud.onLoud : loud.figureFaint }]}>
                          ✓
                        </Text>
                      </Tappable>

                      {landed?.rowKey === row.key && (
                        <ImpactFrame content={landed.content} onDone={clearLanded} />
                      )}
                    </View>

                    {block.isCardio && liveEstimate ? (
                      <View style={styles.cardioLiveBadge}>
                        <Text style={styles.cardioLiveText}>{liveEstimate}</Text>
                      </View>
                    ) : null}

                    {!block.isCardio && row.done && row.setType !== 'warmup' && (() => {
                      const currentBest = effectiveBestPRFor(block);
                      let parsedWeight: number | null = null;
                      if (block.bodyweightBased) {
                        const added = row.weight.trim() ? parseWeight(row.weight, settings.units) : 0;
                        if (currentBodyweightKg !== null) {
                          parsedWeight = currentBodyweightKg + (added ?? 0);
                        }
                      } else {
                        parsedWeight = row.weight.trim() ? parseWeight(row.weight, settings.units) : null;
                      }
                      const parsedReps = Number(row.reps);
                      const validReps = Number.isFinite(parsedReps) && parsedReps > 0 ? parsedReps : 0;

                      if (parsedWeight === null || parsedWeight <= 0 || validReps <= 0) return null;

                      const evalResult = evaluatePRTarget({
                        weight: parsedWeight,
                        reps: validReps,
                        bestPR: currentBest,
                        stepKg: settings.units === 'metric' ? 2.5 : lbToKg(5),
                      });

                      if (evalResult.status !== 'pr') return null;

                      return (
                        <View style={[styles.prRowBadge, styles.prRowBadgePR]}>
                          <Text style={styles.prRowTextPR}>
                            {evalResult.isFirstLog
                              ? `⭐ BASELINE PR · ${displayWeight(evalResult.e1rm, settings.units).toFixed(1)} ${unit.toUpperCase()} EST. 1RM`
                              : `🔥 ALL-TIME PR · ${displayWeight(evalResult.e1rm, settings.units).toFixed(1)} ${unit.toUpperCase()} EST. 1RM (+${displayWeight(evalResult.delta, settings.units).toFixed(1)} ${unit.toUpperCase()})`}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>
                );
              })}

            <Tappable onPress={() => addRow(blockIndex)} style={styles.addSet} scaleTo={0.98}>
              <Text style={styles.addSetLabel}>{block.isCardio ? '+ ADD INTERVAL' : '+ ADD SET'}</Text>
            </Tappable>
          </View>
        </FadeIn>
      );
    })}

      {picking ? (
        <ExercisePicker
          known={known}
          patterns={patterns}
          geminiApiKey={settings.foodLookup.geminiApiKey}
          initialMode={pickerMode}
          onPick={(name, catalogueBodyweight, cardio) => void addExercise(name, catalogueBodyweight, cardio)}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <View style={styles.addButtonsRow}>
          <Tappable
            onPress={() => {
              setPickerMode('exercise');
              setPicking(true);
            }}
            style={{ flex: 1 }}
            scaleTo={0.97}
          >
            <SlashPanel color={loud.panel} style={styles.slab}>
              <Text style={[styles.slabLabel, { color: loud.figure }]}>+ ADD EXERCISE</Text>
            </SlashPanel>
          </Tappable>
          <Tappable
            onPress={() => {
              setPickerMode('cardio');
              setPicking(true);
            }}
            style={{ flex: 1 }}
            scaleTo={0.97}
          >
            <SlashPanel color={loud.loud} style={styles.slab}>
              <Text style={[styles.slabLabel, { color: loud.onLoud }]}>+ ADD CARDIO</Text>
            </SlashPanel>
          </Tappable>
        </View>
      )}

      <ExerciseInfoSheet entry={info} onClose={() => setInfo(null)} />

      {/* The workout is already saved by the time this shows; dismissing it
          is what leaves the screen. */}
      <MilestoneSheet
        milestone={milestone}
        units={settings.units}
        onDismiss={() => {
          setMilestone(null);
          if (finished === null) router.back();
        }}
      />

      <FinishSheet
        summary={milestone === null ? (finished?.summary ?? null) : null}
        hidden={signingIn || savingRoutine}
        account={
          !social.configured
            ? 'unavailable'
            : !social.session
              ? 'signed-out'
              : social.profile === null
                ? 'needs-profile'
                : 'ready'
        }
        postFirst={settings.postWorkouts}
        onPost={async (caption) => {
          if (finished === null) return;
          await createPost(postPayload(finished.workout, caption));
          if (!settings.postWorkouts) void updateSettings({ postWorkouts: true });
        }}
        onNeedAccount={() => {
          setSigningIn(true);
          router.push(social.session ? '/profile-setup' : '/sign-in');
        }}
        onSaveAsRoutine={() => setSavingRoutine(true)}
        routineSaved={routineSaved}
        onDone={(posted) => {
          if (social.configured && !posted && settings.postWorkouts) void updateSettings({ postWorkouts: false });
          setFinished(null);
          router.back();
        }}
      />

      {/* The finish sheet is hidden, not closed, behind this one: it keeps its caption, and two modals never stack. */}
      <SaveRoutineSheet
        visible={savingRoutine}
        initialName={finished?.workout.title === 'Workout' ? '' : (finished?.workout.title ?? '')}
        sets={finished?.workout.sets ?? []}
        existingNames={routines.map((r) => r.name)}
        onCancel={() => setSavingRoutine(false)}
        onSaved={() => {
          setSavingRoutine(false);
          setRoutineSaved(true);
        }}
      />

      <RpeSheet
        open={rating !== null}
        current={rating ? (blocks[rating.blockIndex]?.rows[rating.rowIndex]?.rpe ?? null) : null}
        onChoose={(rpe) => {
          if (rating) void rateRow(rating.blockIndex, rating.rowIndex, rpe);
        }}
        onClose={() => setRating(null)}
      />

      <SessionOptionsSheet
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        units={settings.units}
        onToggleUnits={toggleWeightUnits}
        speedUnit={speedUnit}
        onToggleSpeedUnits={toggleSpeedUnits}
        showWeightSwitcher={showWeightSwitcher}
        showSpeedSwitcher={showSpeedSwitcher}
        restSound={settings.restSound}
        onToggleAlert={toggleAlert}
        restChimeChoice={settings.restChimeChoice ?? 'chime'}
        onChangeChimeChoice={changeChimeChoice}
        restSeconds={settings.restSeconds}
        onChangeRestSeconds={changeRestSeconds}
        onStepRestSeconds={stepRestSeconds}
      />

      <Text style={[styles.note, { marginBottom: space.xxl }]}>
        Tick a set to record it. Tap the set number to mark it a warmup. Leaving without
        finishing keeps this workout open.
      </Text>
    </Screen>

    <PlateSheet
      open={calcTarget !== null}
      initialMode={calcTarget?.mode ?? 'plates'}
      isBarbell={calcTarget?.isBarbell ?? true}
      weight={calcTarget?.initialWeight ?? null}
      exerciseName={calcTarget?.exerciseName ?? null}
      units={settings.units}
      bar={settings.barbell}
      customPlates={settings.customPlates?.[settings.units] ?? []}
      onAddCustomPlate={addCustomPlate}
      onRemoveCustomPlate={removeCustomPlate}
      onBarChange={(barbell) => void updateSettings({ barbell })}
      onApplyWeight={
        calcTarget?.blockIndex !== null && calcTarget?.rowIndex !== null
          ? (w) => void applyCalculatedWeight(w)
          : undefined
      }
      onInsertWarmups={
        calcTarget?.blockIndex !== null
          ? insertWarmups
          : undefined
      }
      onClose={() => setCalcTarget(null)}
    />

    <SupersetSheet
      open={supersetTargetIndex !== null}
      exerciseIndex={supersetTargetIndex}
      blocks={blocks}
      onAssignGroup={assignSupersetGroup}
      onUnlink={unlinkExerciseFromSuperset}
      onDisband={disbandSupersetGroup}
      onClose={() => setSupersetTargetIndex(null)}
    />

    {swapTargetIndex !== null && blocks[swapTargetIndex] && (
      <SwapExerciseSheet
        open={swapTargetIndex !== null}
        currentExerciseName={blocks[swapTargetIndex].name}
        hasLoggedSets={blocks[swapTargetIndex].rows.some((r) => r.done && r.id != null)}
        loggedSetsCount={blocks[swapTargetIndex].rows.filter((r) => r.done && r.id != null).length}
        catalogue={catalogue}
        known={known}
        patterns={patterns}
        onSelectSwap={(opt, mode) => {
          void swapExercise(swapTargetIndex, opt, mode);
        }}
        onClose={() => setSwapTargetIndex(null)}
      />
    )}

    {celebrationPR && (
      <PRCelebration
        data={celebrationPR}
        units={settings.units}
        onDone={() => setCelebrationPR(null)}
      />
    )}
  </View>
);
}

/**
 * Everything here reads from `loud` rather than from the theme hook, because
 * this screen is deliberately the same in both colour schemes — the reasoning
 * is in `theme/sessionTheme.ts`.
 */
const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.sm,
    gap: space.sm,
  },
  /**
   * The header's controls are drawn about 28 high to sit beside the title, but a
   * finger needs the app's 44. Padding makes the touch area and the negative margin
   * gives the height back, so the header does not grow. Padding, not hitSlop: the
   * web build, which is what iPhones run, ignores hitSlop.
   */
  headerHit: {
    paddingVertical: 8,
    marginVertical: -8,
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  screenTitle: {
    fontFamily: font.display,
    fontSize: 26,
    letterSpacing: -0.4,
    color: loud.figure,
    flex: 1,
  },
  gearBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    marginTop: space.md,
    color: loud.figureFaint,
  },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
    marginBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  heroFigures: { flex: 1 },
  clock: {
    fontFamily: font.figure,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -2,
    color: loud.figure,
    fontVariant: ['tabular-nums'],
  },
  heroCounts: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  heroCount: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  heroCountDivider: {
    fontFamily: font.display,
    fontSize: 14,
    color: loud.figureFaint,
  },
  countFigure: {
    fontFamily: font.figure,
    fontSize: 14,
    color: loud.loud,
    fontVariant: ['tabular-nums'],
  },
  countLabel: { fontFamily: font.display, fontSize: 10, letterSpacing: 2, color: loud.figureFaint },
  finish: {
    minHeight: TOUCH_TARGET,
    paddingHorizontal: space.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  finishLabel: { fontFamily: font.display, fontSize: 14, letterSpacing: 1.6, color: loud.onLoud },

  block: { marginBottom: space.xl },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  blockTitle: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 3, minHeight: 38 },
  glyphTab: { width: 38, alignItems: 'center', justifyContent: 'center' },
  nameSlab: { flex: 1, justifyContent: 'center', paddingHorizontal: space.md },
  nameSlabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  blockName: { flex: 1, fontFamily: font.display, fontSize: 17, letterSpacing: 0.2, color: loud.figure },
  remove: { color: loud.figureFaint, fontSize: 15 },
  blockActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.xs,
  },
  actionPillBtn: {
    minHeight: 32,
    justifyContent: 'center',
  },
  actionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    backgroundColor: loud.panel,
  },
  actionPillText: {
    fontFamily: font.display,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: loud.figureMuted,
  },
  blockMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space.sm,
    marginBottom: space.xs,
  },
  supersetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  supersetBadgeText: {
    fontFamily: font.display,
    fontSize: 9.5,
    letterSpacing: 0.9,
    fontWeight: '700',
  },

  hint: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.loud, marginBottom: space.sm },
  target: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1,
    color: loud.figureMuted,
  },
  columns: { flexDirection: 'row', alignItems: 'center', paddingBottom: 5 },
  col: { fontFamily: font.display, fontSize: 9, letterSpacing: 1.4, color: loud.figureFaint },
  colSet: { width: 34, textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  colPrev: { flex: 1, textAlign: 'center' },
  colNum: { width: 64, textAlign: 'center', marginHorizontal: 3 },
  colCardioSpd: { width: 54, textAlign: 'center', marginHorizontal: 2 },
  colCardioInc: { width: 44, textAlign: 'center', marginHorizontal: 2 },
  colCardioTime: { width: 52, textAlign: 'center', marginHorizontal: 2 },
  colCardioDist: { width: 64, textAlign: 'center', marginHorizontal: 3 },
  colCardioTimeWide: { width: 64, textAlign: 'center', marginHorizontal: 3 },
  colRpe: { width: 44, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  colTick: { width: 40, alignItems: 'center', justifyContent: 'center' },

  cardioModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: space.sm,
  },
  cardioModeChip: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardioModeChipActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  cardioModeChipText: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureFaint,
  },
  cardioModeChipTextActive: {
    color: loud.onLoud,
  },
  addButtonsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginBottom: space.sm,
  },
  cardioLiveBadge: {
    alignSelf: 'flex-end',
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: -2,
    marginBottom: 6,
    marginRight: 42,
  },
  cardioLiveText: {
    fontFamily: font.figure,
    fontSize: 10,
    color: loud.figureMuted,
    fontVariant: ['tabular-nums'],
  },
  prHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: space.xs,
    paddingHorizontal: 2,
  },
  prHeaderLabel: {
    fontFamily: font.display,
    fontSize: 9.5,
    letterSpacing: 1.1,
    color: loud.warn,
  },
  prHeaderValue: {
    fontFamily: font.figure,
    fontSize: 12,
    color: loud.figure,
    fontWeight: '700',
  },
  prHeaderE1rm: {
    fontFamily: font.figure,
    fontSize: 11,
    color: loud.figureMuted,
    fontWeight: '400',
  },
  prRowBadge: {
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: -2,
    marginBottom: 6,
    marginRight: 42,
  },
  prRowBadgePR: {
    backgroundColor: 'rgba(232, 183, 48, 0.14)',
    borderColor: 'rgba(232, 183, 48, 0.5)',
  },
  prRowBadgeClose: {
    backgroundColor: 'rgba(235, 87, 87, 0.14)',
    borderColor: 'rgba(235, 87, 87, 0.5)',
  },
  prRowBadgeTarget: {
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  prRowTextPR: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: loud.warn,
  },
  prRowTextClose: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: loud.loud,
  },
  prRowTextTarget: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 0.8,
    color: loud.figureMuted,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 5,
  },
  setFigure: {
    fontFamily: font.figure,
    fontSize: 14,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  previous: { fontFamily: font.figure, fontSize: 12, fontVariant: ['tabular-nums'] },
  tick: { fontSize: 19, textAlign: 'center' },
  rpeValue: { fontFamily: font.figure, fontSize: 12, fontVariant: ['tabular-nums'] },
  rpeChip: {
    minWidth: 36,
    paddingHorizontal: 3,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The same box as the weight and rep inputs on an inverted row.
  rpeChipSet: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)' },
  rpeChipEmpty: { borderColor: 'rgba(255,255,255,0.45)', borderStyle: 'dashed' },
  input: {
    minHeight: TOUCH_TARGET - 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    textAlign: 'center',
    fontFamily: font.figure,
  },
  inputOnGround: { backgroundColor: loud.panel, borderColor: loud.rule },
  // On an inverted row the boxes have to lift off the red without introducing
  // a fourth colour, so they are the same white at low opacity.
  inputOnLoud: { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.35)' },

  addSet: {
    minHeight: TOUCH_TARGET - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: loud.rule,
    marginTop: 2,
  },
  addSetLabel: { fontFamily: font.display, fontSize: 11, letterSpacing: 1.6, color: loud.loud },

  slab: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  slabLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.4, textAlign: 'center' },

  iconBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionRoot: {
    flex: 1,
    backgroundColor: loud.ground,
  },
  fabContainer: {
    position: 'absolute',
    right: space.lg,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  fabRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 3,
    minHeight: TOUCH_TARGET,
  },
  fabGlyphTab: {
    width: TOUCH_TARGET,
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabTextSlab: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  fabLabel: {
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 1.2,
    color: loud.figure,
  },
});
