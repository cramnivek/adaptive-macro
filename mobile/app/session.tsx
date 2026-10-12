import { bodyweightForDates, milestonesOn, todayISO } from '@adaptive-macros/engine';
import type { Milestone, SetType } from '@adaptive-macros/engine';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { type ShareSummary, shareSummary } from '../src/shareCard';
import { createPost } from '../src/social/api';
import { type FinishedWorkout, postPayload } from '../src/social/postPayload';
import { useSocial } from '../src/social/session';
import { ExercisePicker } from '../src/components/ExercisePicker';
import { FadeIn } from '../src/components/FadeIn';
import { CountUp } from '../src/components/CountUp';
import { Screen } from '../src/components/Screen';
import { ImpactFrame } from '../src/components/ImpactFrame';
import { SlashPanel } from '../src/components/SlashPanel';
import { MilestoneSheet } from '../src/components/MilestoneSheet';
import { RestBar } from '../src/components/RestBar';
import { RpeSheet } from '../src/components/RpeSheet';
import { Tappable } from '../src/components/Tappable';
import { impactContent } from '../src/components/setImpact';
import type { ImpactContent } from '../src/components/setImpact';
import {
  activeSession,
  addSetToSession,
  deleteSet,
  discardSession,
  finishSession,
  lastSessionSets,
  listAllSets,
  listExerciseNames,
  catalogueEntryForExercise,
  cataloguePatternsByExerciseName,
  listRoutines,
  sessionSets,
  startSession,
  setSetRpe,
  updateSetValues,
} from '../src/db';
import type { ActiveSession, CatalogueEntry, LoggedSet, Routine } from '../src/db';
import { confirm, notify } from '../src/dialog';
import { displayWeight, parseWeight, weightUnit } from '../src/format';
import { playChime, primeChime } from '../src/platform/chime';
import { thud } from '../src/platform/haptics';
import { usesBarbell } from '../src/plates';
import { PlatePreview, PlateSheet } from '../src/components/PlateSheet';
import { laddersFor } from '../src/milestones';
import { adjustRest } from '../src/rest';
import { draftsToAdd, repsPrefill, resumeOrder, targetLabel } from '../src/routinePlan';
import { nextLoadHint } from '../src/suggestion';
import { formatRpe } from '../src/rpe';
import { useApp } from '../src/state/AppStore';
import Ionicons from '@expo/vector-icons/Ionicons';
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
}

interface Block {
  name: string;
  bodyweightBased: boolean;
  rows: Row[];
  /** The same exercise's sets from the last finished session, by index. */
  previous: LoggedSet[];
  /** What the routine asks for, when the exercise came from one. */
  target: { sets: number; reps: string | null } | null;
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
  const { series, settings, updateSettings } = useApp();
  const unit = weightUnit(settings.units);
  const params = useLocalSearchParams<{ start?: string; routine?: string }>();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
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
  /** Which row the RPE sheet is rating, if it is open. */
  const [rating, setRating] = useState<{ blockIndex: number; rowIndex: number } | null>(null);
  /** The weight the plate sheet is showing, in the display unit; null when closed. */
  const [plating, setPlating] = useState<number | null>(null);

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
  const [finished, setFinished] = useState<{ workout: FinishedWorkout; summary: ShareSummary } | null>(null);
  /** Sign-in is open over the finish sheet. */
  const [signingIn, setSigningIn] = useState(false);
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
    if (settings.restSound) playChime();

    // Said where it will be seen wherever the screen is scrolled: the bar sits
    // at the top of the workout, often off screen while the next set is set up.
    const nextBlock = blocks.find((block) => block.rows.some((row) => !row.done));
    const nextRow = nextBlock ? nextBlock.rows.findIndex((row) => !row.done) : -1;
    notify(
      'Rest is up',
      nextBlock ? `Next: ${nextBlock.name}, set ${nextRow + 1}.` : 'On to the next one.',
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
  const nudgeRest = (steps: number) => {
    const next = adjustRest(settings.restSeconds, steps);
    const delta = (next - settings.restSeconds) * 1000;
    void updateSettings({ restSeconds: next });
    setRest((current) =>
      current === null ? null : { endsAt: current.endsAt + delta, total: next },
    );
  };

  /**
   * Switches between kilograms and pounds directly within the session view,
   * converting displayed weights in active rows so what the user typed adapts.
   */
  const toggleUnits = () => {
    const nextUnits: UnitSystem = settings.units === 'metric' ? 'imperial' : 'metric';
    const fromUnits = settings.units;

    setBlocks((current) =>
      current.map((block) => ({
        ...block,
        rows: block.rows.map((row) => {
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
    notify('Units updated', `Switched to ${nextUnits === 'metric' ? 'kg' : 'lbs'}.`);
  };

  /**
   * Toggles the rest completion alert on or off during the session.
   * When enabled, primes the audio element and plays a confirmation chime.
   */
  const toggleAlert = () => {
    const next = !settings.restSound;
    if (next) {
      primeChime();
      playChime();
    }
    void updateSettings({ restSound: next });
    notify(
      next ? 'Rest alert on' : 'Rest alert off',
      next ? 'Chimes when each rest period finishes.' : 'Rest timer will be silent.',
    );
  };

  const renderControls = () => (
    <View style={styles.headerControls}>
      <Tappable
        onPress={toggleUnits}
        scaleTo={0.92}
        style={[styles.unitToggle, styles.headerHit]}
        accessibilityRole="button"
        accessibilityLabel={`Switch units, currently ${settings.units === 'metric' ? 'kilograms' : 'pounds'}`}
      >
        <View style={styles.unitToggleTrack}>
          <View
            style={[
              styles.unitToggleThumb,
              settings.units === 'metric' ? styles.unitThumbActive : styles.unitThumbInactive,
            ]}
          >
            <Text
              style={[
                styles.unitToggleText,
                { color: settings.units === 'metric' ? loud.onLoud : loud.figureFaint },
              ]}
            >
              KG
            </Text>
          </View>
          <View
            style={[
              styles.unitToggleThumb,
              settings.units === 'imperial' ? styles.unitThumbActive : styles.unitThumbInactive,
            ]}
          >
            <Text
              style={[
                styles.unitToggleText,
                { color: settings.units === 'imperial' ? loud.onLoud : loud.figureFaint },
              ]}
            >
              LBS
            </Text>
          </View>
        </View>
      </Tappable>

      <Tappable
        onPress={toggleAlert}
        scaleTo={0.9}
        style={styles.headerHit}
        accessibilityRole="switch"
        accessibilityState={{ checked: settings.restSound }}
        accessibilityLabel={settings.restSound ? 'Rest alert on' : 'Rest alert off'}
      >
        <View style={[styles.alertBtn, settings.restSound ? styles.alertBtnActive : styles.alertBtnInactive]}>
          <Ionicons
            name={settings.restSound ? 'notifications' : 'notifications-off-outline'}
            size={15}
            color={settings.restSound ? loud.onLoud : loud.figureMuted}
          />
          <Text
            style={[
              styles.alertBtnLabel,
              { color: settings.restSound ? loud.onLoud : loud.figureMuted },
            ]}
          >
            ALERT
          </Text>
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
    ): Promise<Block> => ({
      name,
      bodyweightBased,
      rows,
      previous: await lastSessionSets(name),
      target,
    }),
    [],
  );

  /**
   * Draft rows up to the routine's target, each prefilled from the same set
   * last time. Drafts are not written, so an untouched one costs nothing.
   */
  const withTargetRows = useCallback(
    (block: Block): Block => {
      const target = block.target;
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
            })),
            planned ? { sets: planned.targetSets, reps: planned.targetReps } : null,
          );
          return withTargetRows(block);
        }),
      );
    },
    [blockFor, withTargetRows, settings.units],
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
      const [existing, loadedRoutines, names] = await Promise.all([
        activeSession(),
        listRoutines(),
        listExerciseNames(),
      ]);
      setRoutines(loadedRoutines);
      setKnown(names);

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
                await blockFor(e.name, e.bodyweightBased, [], { sets: e.targetSets, reps: e.targetReps }),
              ),
            ),
          ),
        );
      }
      setLoading(false);
    })();
  }, [params.start, params.routine, blockFor, blocksFromSession, withTargetRows]);

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
        // A new row copies the one above, because the next set is usually the
        // same weight; failing that, the previous session's set at that index.
        const last = block.rows[block.rows.length - 1];
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

  /**
   * The plates for the set about to be done: the first one not yet ticked that
   * has a weight in it, or failing that the last weight entered.
   */
  const plateWeightFor = (block: Block): number | null => {
    const weightOf = (row: Row) => Number.parseFloat(row.weight.replace(',', '.'));
    const next = block.rows.find((row) => !row.done && weightOf(row) > 0);
    const last = [...block.rows].reverse().find((row) => weightOf(row) > 0);
    const chosen = next ?? last;
    return chosen ? weightOf(chosen) : null;
  };

  const openPlates = (block: Block) => {
    const weight = plateWeightFor(block);
    if (weight === null) return notify('No weight yet', 'Enter a weight in a set to see its plates.');
    setPlating(weight);
  };

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
    });

    const refreshed = await activeSession();
    setSession(refreshed);
    const written = refreshed?.sets.filter((s) => s.exerciseName === block.name) ?? [];
    editRow(blockIndex, rowIndex, { done: true, id: written[written.length - 1]?.id ?? null });

    // Written, so now say so. The frame draws itself over the row and takes no
    // touches, so ticking the next set during it behaves as normal.
    setLanded({
      rowKey: row.key,
      content: impactContent(
        kg === null ? null : displayWeight(kg, settings.units),
        reps,
        row.setType,
      ),
    });

    // Rest starts itself. The alternative is tapping "start rest" after every
    // set, which nobody does twice. The tick is a tap, which is what a browser
    // needs before it will let the chime play when the rest runs out.
    if (settings.restSound) primeChime();
    setRest({ endsAt: Date.now() + settings.restSeconds * 1000, total: settings.restSeconds });
  };

  /** Keeps an already-written set in step with an edited row. */
  const commitEdit = async (blockIndex: number, rowIndex: number) => {
    const row = blocks[blockIndex].rows[rowIndex];
    if (!row.done || !row.id) return;

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
  const addExercise = async (name: string, catalogueBodyweight?: boolean) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (blocks.some((b) => b.name === trimmed)) {
      setPicking(false);
      return notify('Already here', `${trimmed} is already in this session.`);
    }
    // The stored flag first, the catalogue's second. `exercises.bodyweight_based`
    // may hold a correction the user made through Settings, and the model's
    // guess must not quietly overwrite it — a row on record beats a guess.
    const bodyweightBased =
      known.find((k) => k.name === trimmed)?.bodyweightBased ?? catalogueBodyweight ?? false;
    const block = await blockFor(trimmed, bodyweightBased);
    setBlocks((current) => [...current, { ...block, rows: [] }]);
    setPicking(false);
  };

  /**
   * Opens the how-to sheet, or says why it cannot.
   *
   * A tap that resolves to `null` used to do nothing at all, which reads as a
   * broken control rather than as an absence.
   */
  const showInfoFor = async (name: string) => {
    const entry = await catalogueEntryForExercise(name);
    if (entry) return setInfo(entry);
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

    notify('Workout saved', `${logged} ${logged === 1 ? 'set' : 'sets'} logged.`);
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
      </Screen>
    );
  }

  const loggedCount = blocks.reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);

  return (
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
          <View style={styles.heroCount}>
            <CountUp value={loggedCount} style={styles.countFigure} />
            <Text style={styles.countLabel}>{loggedCount === 1 ? 'SET' : 'SETS'}</Text>
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

      {blocks.map((block, blockIndex) => (
        <FadeIn key={block.name} delay={Math.min(blockIndex, 4) * 40}>
          <View style={styles.block}>
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
                accessibilityLabel={`How to do ${block.name}`}
              >
                <SlashPanel color={loud.loud} style={styles.glyphTab}>
                  <ExerciseIcon pattern={patterns[block.name]} size={18} color={loud.onLoud} />
                </SlashPanel>
                <SlashPanel color={loud.panel} style={styles.nameSlab}>
                  <Text style={styles.blockName} numberOfLines={1}>
                    {block.name.toUpperCase()}
                  </Text>
                </SlashPanel>
              </Tappable>
              <Tappable
                onPress={() => void removeExercise(blockIndex)}
                style={styles.iconBtn}
                scaleTo={0.85}
              >
                <Text style={styles.remove}>✕</Text>
              </Tappable>
            </View>

            {/*
              What to load, from how the last top set felt. Only when that set
              was rated — the hint is RPE paying for itself, and with no rating
              there is nothing honest to say.
            */}
            {(() => {
              const hint = nextLoadHint(block.previous, settings.units);
              return hint === null ? null : <Text style={styles.hint}>{hint}</Text>;
            })()}
            {block.target && (
              <Text style={styles.target}>{targetLabel(block.target.sets, block.target.reps)}</Text>
            )}
            {/*
              Barbell lifts only, recognised by name: a plate count on a bar of
              unknown weight would be confidently wrong.
            */}
            {!block.bodyweightBased && usesBarbell(block.name) && (
              <PlatePreview
                weight={plateWeightFor(block)}
                units={settings.units}
                bar={settings.barbell}
                onPress={() => openPlates(block)}
              />
            )}

            <View style={styles.columns}>
              <Text style={[styles.col, styles.colSet]}>SET</Text>
              <Text style={[styles.col, styles.colPrev]}>PREVIOUS</Text>
              <Text style={[styles.col, styles.colNum]}>{unit.toUpperCase()}</Text>
              <Text style={[styles.col, styles.colNum]}>REPS</Text>
              <Text style={[styles.col, styles.colRpe]}>RPE</Text>
              <View style={styles.colTick} />
            </View>

            {block.rows.map((row, rowIndex) => {
              const previous = block.previous[rowIndex];
              /*
                The rating is appended when the last session recorded one. A
                Hevy import has always parsed RPE and written it, so a history
                brought over from Hevy may already be full of these — this is
                the first place in the app they have ever been visible.
              */
              const previousLabel = previous
                ? `${
                    previous.weightKg === null
                      ? 'BW'
                      : displayWeight(previous.weightKg, settings.units).toFixed(1)
                  } × ${previous.reps}${previous.rpe === null ? '' : ` @${formatRpe(previous.rpe)}`}`
                : '—';
              /*
                A completed set inverts to red rather than acquiring a green
                tick. With three colours on the screen inversion is the loudest
                signal available, and it still reads at a glance from a bench,
                which a recoloured tick does not.
              */
              const on = row.done ? loud.onLoud : loud.figure;

              return (
                <View
                  key={row.key}
                  style={[
                    styles.row,
                    row.done
                      ? { backgroundColor: loud.loud, borderColor: loud.loud }
                      : { backgroundColor: 'transparent', borderColor: loud.rule },
                  ]}
                >
                  <Tappable
                    onPress={() =>
                      editRow(blockIndex, rowIndex, {
                        setType: row.setType === 'normal' ? 'warmup' : 'normal',
                      })
                    }
                    scaleTo={0.8}
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

                  {/*
                    Blank until the set is written, so the column holds its
                    width and nothing jumps when a row is ticked — and so an
                    optional field never sits there looking required on a row
                    you have not done yet.
                  */}
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
                      {/*
                        A chip, not a bare glyph. An em dash sitting in a cell
                        reads as "nothing here" rather than "tap me" — so an
                        unrated set gets a dashed outline and a plus, which is
                        the same language "+ ADD SET" already uses two rows
                        down, and a rated one gets the same filled box as the
                        weight and rep fields beside it, which says editable
                        without spending a word on it.
                      */}
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
              );
            })}

            <Tappable onPress={() => addRow(blockIndex)} style={styles.addSet} scaleTo={0.98}>
              <Text style={styles.addSetLabel}>+ ADD SET</Text>
            </Tappable>
          </View>
        </FadeIn>
      ))}

      {picking ? (
        <ExercisePicker
          known={known}
          patterns={patterns}
          geminiApiKey={settings.foodLookup.geminiApiKey}
          onPick={(name, catalogueBodyweight) => void addExercise(name, catalogueBodyweight)}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <Tappable onPress={() => setPicking(true)} scaleTo={0.97}>
          <SlashPanel color={loud.panel} style={styles.slab}>
            <Text style={[styles.slabLabel, { color: loud.figure }]}>+ ADD EXERCISE</Text>
          </SlashPanel>
        </Tappable>
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
        hidden={signingIn}
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
        onDone={(posted) => {
          if (social.configured && !posted && settings.postWorkouts) void updateSettings({ postWorkouts: false });
          setFinished(null);
          router.back();
        }}
      />

      <PlateSheet
        weight={plating}
        units={settings.units}
        bar={settings.barbell}
        onBarChange={(barbell) => void updateSettings({ barbell })}
        onClose={() => setPlating(null)}
      />

      <RpeSheet
        open={rating !== null}
        current={rating ? (blocks[rating.blockIndex]?.rows[rating.rowIndex]?.rpe ?? null) : null}
        onChoose={(rpe) => {
          if (rating) void rateRow(rating.blockIndex, rating.rowIndex, rpe);
        }}
        onClose={() => setRating(null)}
      />

      <Text style={styles.note}>
        Tick a set to record it. Tap the set number to mark it a warmup. Leaving without
        finishing keeps this workout open.
      </Text>
    </Screen>
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
  unitToggle: {
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  unitToggleTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    borderRadius: radius.sm,
    padding: 2,
  },
  unitToggleThumb: {
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitThumbActive: {
    backgroundColor: loud.loud,
  },
  unitThumbInactive: {
    backgroundColor: 'transparent',
  },
  unitToggleText: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1,
  },
  alertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm + 1,
    paddingVertical: 5,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 28,
  },
  alertBtnActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  alertBtnInactive: {
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  alertBtnLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
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
  heroCount: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
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
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.sm },
  blockTitle: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 3, minHeight: 38 },
  glyphTab: { width: 38, alignItems: 'center', justifyContent: 'center' },
  nameSlab: { flex: 1, justifyContent: 'center', paddingHorizontal: space.md },
  blockName: { fontFamily: font.display, fontSize: 17, letterSpacing: 0.2, color: loud.figure },
  remove: { color: loud.figureFaint, fontSize: 15 },

  hint: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, color: loud.loud, marginBottom: space.sm },
  target: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    letterSpacing: 1,
    color: loud.figureMuted,
    marginBottom: space.sm,
  },
  columns: { flexDirection: 'row', alignItems: 'center', paddingBottom: 5 },
  col: { fontFamily: font.display, fontSize: 9, letterSpacing: 1.4, color: loud.figureFaint },
  colSet: { width: 34, textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  colPrev: { flex: 1, textAlign: 'center' },
  colNum: { width: 64, textAlign: 'center', marginHorizontal: 3 },
  colRpe: { width: 44, alignItems: 'center', justifyContent: 'center', textAlign: 'center' },
  colTick: { width: 40, alignItems: 'center', justifyContent: 'center' },

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
});
