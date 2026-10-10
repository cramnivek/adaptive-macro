import { bodyweightForDates, milestonesOn, todayISO } from '@adaptive-macros/engine';
import type { Milestone, SetType } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  startSession,
  setSetRpe,
  updateSetValues,
} from '../src/db';
import type { ActiveSession, CatalogueEntry, LoggedSet, Routine } from '../src/db';
import { confirm, notify } from '../src/dialog';
import { displayWeight, parseWeight, weightUnit } from '../src/format';
import { thud } from '../src/platform/haptics';
import { laddersFor } from '../src/milestones';
import { adjustRest } from '../src/rest';
import { nextLoadHint } from '../src/suggestion';
import { formatRpe } from '../src/rpe';
import { useApp } from '../src/state/AppStore';
import { font, radius, space } from '../src/theme';
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
}

const newKey = () => Math.random().toString(36).slice(2, 10);

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

    // Left on screen for a moment rather than cleared at once. On the iOS PWA
    // there is no vibration API, so this bar is the only thing those users get
    // telling them the rest is up.
    const id = setTimeout(() => setRest(null), 6000);
    return () => clearTimeout(id);
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

  const blockFor = useCallback(
    async (name: string, bodyweightBased: boolean, rows: Row[] = []): Promise<Block> => ({
      name,
      bodyweightBased,
      rows,
      previous: await lastSessionSets(name),
    }),
    [],
  );

  /** Rebuilds the on-screen blocks from what is already written. */
  const blocksFromSession = useCallback(
    async (open: ActiveSession, plan: string[] = []): Promise<Block[]> => {
      const names: string[] = [];
      for (const set of open.sets) if (!names.includes(set.exerciseName)) names.push(set.exerciseName);
      for (const name of plan) if (!names.includes(name)) names.push(name);

      return Promise.all(
        names.map(async (name) => {
          const mine = open.sets.filter((s) => s.exerciseName === name);
          return blockFor(
            name,
            mine[0]?.bodyweightBased ?? false,
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
          );
        }),
      );
    },
    [blockFor, settings.units],
  );

  useEffect(() => {
    void (async () => {
      const [existing, loadedRoutines, names] = await Promise.all([
        activeSession(),
        listRoutines(),
        listExerciseNames(),
      ]);
      setRoutines(loadedRoutines);
      setKnown(names);

      if (existing) {
        setSession(existing);
        setBlocks(await blocksFromSession(existing));
      } else if (!started.current && (params.start === 'blank' || params.routine)) {
        started.current = true;
        const routine = loadedRoutines.find((r) => r.id === params.routine);
        const fresh = await startSession(routine?.name ?? 'Workout', todayISO());
        setSession(fresh);
        setBlocks(
          await Promise.all(
            (routine?.exercises ?? []).map((e) => blockFor(e.name, e.bodyweightBased)),
          ),
        );
      }
      setLoading(false);
    })();
  }, [params.start, params.routine, blockFor, blocksFromSession]);

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
    // set, which nobody does twice.
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
    notify('Workout saved', `${logged} ${logged === 1 ? 'set' : 'sets'} logged.`);

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
      if (reached[0] !== undefined) {
        setMilestone(reached[0]);
        return;
      }
    } catch {
      // Nothing to say, and nothing worth blocking the exit for.
    }

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
        <Text style={styles.screenTitle}>WORKOUT</Text>
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
      <Text style={styles.screenTitle} numberOfLines={1}>
        {session.name.toUpperCase()}
      </Text>

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
                      {row.setType === 'warmup' ? 'W' : rowIndex + 1}
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
          router.back();
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
  screenTitle: {
    fontFamily: font.display,
    fontSize: 26,
    letterSpacing: -0.4,
    color: loud.figure,
    marginBottom: space.sm,
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
