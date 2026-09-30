import { todayISO } from '@adaptive-macros/engine';
import type { SetType } from '@adaptive-macros/engine';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { EnrichmentParseError } from '../src/ai/exercises';
import { GroundedLookupError, enrichExercises } from '../src/api/gemini';
import { Button, TOUCH_TARGET } from '../src/components/Controls';
import { ExerciseIcon } from '../src/components/ExerciseIcon';
import { ExerciseInfoSheet } from '../src/components/ExerciseInfoSheet';
import { Screen } from '../src/components/Screen';
import {
  activeSession,
  addSetToSession,
  deleteSet,
  discardSession,
  finishSession,
  lastSessionSets,
  listExerciseNames,
  catalogueEntryForExercise,
  linkExerciseToCatalogue,
  listRoutines,
  searchCatalogue,
  startSession,
  updateSetValues,
  upsertCatalogueEntry,
} from '../src/db';
import type { ActiveSession, CatalogueEntry, LoggedSet, Routine } from '../src/db';
import { confirm, notify } from '../src/dialog';
import { displayWeight, parseWeight, weightUnit } from '../src/format';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

/** One editable row. `id` is present once the set has been written. */
interface Row {
  key: string;
  id: string | null;
  weight: string;
  reps: string;
  setType: SetType;
  done: boolean;
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
  const { colors } = useTheme();
  const router = useRouter();
  const { settings } = useApp();
  const unit = weightUnit(settings.units);
  const params = useLocalSearchParams<{ start?: string; routine?: string }>();

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [known, setKnown] = useState<{ name: string; bodyweightBased: boolean }[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [search, setSearch] = useState('');
  const [now, setNow] = useState(Date.now());
  const started = useRef(false);

  const [matches, setMatches] = useState<CatalogueEntry[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [info, setInfo] = useState<CatalogueEntry | null>(null);
  // Same guard as the food search: one automatic call per distinct term, so a
  // failed enrichment cannot refire and retyping costs nothing.
  const autoEnriched = useRef<Set<string>>(new Set());
  const latestTerm = useRef('');

  useEffect(() => {
    const term = search.trim();
    latestTerm.current = term;
    if (term.length < 2) {
      setMatches([]);
      return;
    }
    let current = true;
    void searchCatalogue(term)
      .then((found) => {
        if (current) setMatches(found);
      })
      .catch((error) => console.warn('catalogue search failed', error));
    return () => {
      current = false;
    };
  }, [search]);

  // A name the catalogue does not know is the dead end worth removing. Wait for
  // typing to settle, then classify it and write its how-to, once.
  useEffect(() => {
    const term = search.trim();
    if (!picking || enriching || term.length < 2) return;
    if (matches.length > 0 || autoEnriched.current.has(term)) return;

    const timer = setTimeout(() => {
      autoEnriched.current.add(term);
      setEnriching(true);
      void enrichExercises([term], settings.foodLookup.geminiApiKey)
        .then(async ({ entries }) => {
          if (entries.length === 0) return;
          const id = await upsertCatalogueEntry(entries[0]);
          await linkExerciseToCatalogue(entries[0].requestedName, id);
          // By the name the model returned, which may not contain what was typed.
          const found = await searchCatalogue(entries[0].canonicalName);
          // The user may have kept typing while this was in flight.
          if (latestTerm.current === term) setMatches(found);
        })
        .catch((error) => {
          // Typing the name still works; this only means it arrives without a
          // pattern or a how-to, which is better than blocking the set. Only the
          // two lookup failures are expected; anything else is a real bug.
          if (error instanceof GroundedLookupError || error instanceof EnrichmentParseError) return;
          console.warn('exercise enrichment failed', error);
        })
        .finally(() => setEnriching(false));
    }, 1200);

    return () => clearTimeout(timer);
  }, [search, picking, enriching, matches.length, settings.foodLookup.geminiApiKey]);

  // The header clock. One second is the resolution anyone reads it at.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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
      editRow(blockIndex, rowIndex, { done: false, id: null });
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
    setSearch('');
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
    notify('Workout saved', `${logged} sets logged.`);
    router.back();
  };

  if (loading) {
    return (
      <Screen title="Workout">
        <ActivityIndicator color={colors.accent} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen title="Workout">
        <Text style={[styles.note, { color: colors.textFaint, marginBottom: space.md }]}>
          Start an empty workout, or pick one of your routines.
        </Text>
        <Button
          label="Start an empty workout"
          onPress={() => router.replace('/session?start=blank')}
        />
        {routines.map((routine) => (
          <Button
            key={routine.id}
            label={routine.name}
            variant="subtle"
            onPress={() => router.replace(`/session?routine=${routine.id}`)}
          />
        ))}
      </Screen>
    );
  }

  const loggedCount = blocks.reduce((n, b) => n + b.rows.filter((r) => r.done).length, 0);

  return (
    <Screen title={session.name}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <View>
          <Text style={{ color: colors.text, fontSize: 20, fontFamily: font.figure, fontVariant: ['tabular-nums'] }}>
            {elapsed(session.startedAt, now)}
          </Text>
          <Text style={[styles.note, { color: colors.textFaint }]}>
            {loggedCount} {loggedCount === 1 ? 'set' : 'sets'}
          </Text>
        </View>
        <Pressable
          onPress={() => void finish()}
          style={[styles.finish, { backgroundColor: colors.accent }]}
        >
          <Text style={{ color: colors.onFill, fontFamily: font.uiStrong }}>Finish</Text>
        </Pressable>
      </View>

      {blocks.map((block, blockIndex) => (
        <View key={block.name} style={styles.block}>
          <View style={styles.blockHeader}>
            <Pressable
              onPress={() => void showInfoFor(block.name)}
              style={{ flex: 1, minHeight: TOUCH_TARGET, justifyContent: 'center' }}
              accessibilityLabel={`How to do ${block.name}`}
            >
              <Text style={{ color: colors.accent, fontSize: 16, fontFamily: font.uiStrong }}>
                {block.name}
              </Text>
            </Pressable>
            <Pressable onPress={() => void removeExercise(blockIndex)} style={styles.iconBtn}>
              <Text style={{ color: colors.textFaint }}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.columns}>
            <Text style={[styles.col, styles.colSet, { color: colors.textFaint }]}>SET</Text>
            <Text style={[styles.col, styles.colPrev, { color: colors.textFaint }]}>PREVIOUS</Text>
            <Text style={[styles.col, styles.colNum, { color: colors.textFaint }]}>
              {unit.toUpperCase()}
            </Text>
            <Text style={[styles.col, styles.colNum, { color: colors.textFaint }]}>REPS</Text>
            <View style={styles.colTick} />
          </View>

          {block.rows.map((row, rowIndex) => {
            const previous = block.previous[rowIndex];
            const previousLabel = previous
              ? previous.weightKg === null
                ? `BW × ${previous.reps}`
                : `${displayWeight(previous.weightKg, settings.units).toFixed(1)} × ${previous.reps}`
              : '—';

            return (
              <View
                key={row.key}
                style={[
                  styles.row,
                  {
                    borderColor: colors.border,
                    backgroundColor: row.done ? colors.surfaceRaised : 'transparent',
                  },
                ]}
              >
                <Pressable
                  onPress={() =>
                    editRow(blockIndex, rowIndex, {
                      setType: row.setType === 'normal' ? 'warmup' : 'normal',
                    })
                  }
                  style={styles.colSet}
                >
                  <Text
                    style={{
                      color: row.setType === 'warmup' ? colors.warning : colors.text,
                      fontFamily: font.figure,
                      fontVariant: ['tabular-nums'],
                      textAlign: 'center',
                    }}
                  >
                    {row.setType === 'warmup' ? 'W' : rowIndex + 1}
                  </Text>
                </Pressable>

                <Text
                  style={[styles.colPrev, { color: colors.textFaint, fontSize: 12, fontFamily: font.figure, fontVariant: ['tabular-nums'] }]}
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
                  placeholderTextColor={colors.textFaint}
                  style={[
                    styles.input,
                    styles.colNum,
                    { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                />
                <TextInput
                  value={row.reps}
                  onChangeText={(reps) => editRow(blockIndex, rowIndex, { reps })}
                  onBlur={() => void commitEdit(blockIndex, rowIndex)}
                  keyboardType="number-pad"
                  placeholder="—"
                  placeholderTextColor={colors.textFaint}
                  style={[
                    styles.input,
                    styles.colNum,
                    { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
                  ]}
                />

                <Pressable onPress={() => void toggleRow(blockIndex, rowIndex)} style={styles.colTick}>
                  <Text
                    style={{
                      color: row.done ? colors.positive : colors.textFaint,
                      fontSize: 18,
                      textAlign: 'center',
                    }}
                  >
                    ✓
                  </Text>
                </Pressable>
              </View>
            );
          })}

          <Pressable
            onPress={() => addRow(blockIndex)}
            style={[styles.addSet, { borderColor: colors.border }]}
          >
            <Text style={{ color: colors.accent, fontFamily: font.uiStrong }}>+ Add set</Text>
          </Pressable>
        </View>
      ))}

      {picking ? (
        <View style={[styles.picker, { borderColor: colors.border }]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search or type a new exercise"
            placeholderTextColor={colors.textFaint}
            autoFocus
            style={[
              styles.input,
              { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          />
          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
            {matches.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  void addExercise(item.recordedName ?? item.canonicalName, item.bodyweightBased)
                }
                style={[styles.pickRow, { borderColor: colors.border }]}
              >
                <ExerciseIcon pattern={item.movementPattern} size={20} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontFamily: font.ui }}>
                    {item.canonicalName}
                  </Text>
                  <Text
                    style={{ color: colors.textFaint, fontSize: 12, fontFamily: font.ui }}
                  >
                    {item.primaryMuscle} · {item.equipment}
                    {item.bodyweightBased ? ' · bodyweight' : ''}
                  </Text>
                </View>
              </Pressable>
            ))}
            {enriching && (
              <Text
                style={{
                  color: colors.textFaint,
                  fontSize: 12,
                  fontFamily: font.ui,
                  padding: space.md,
                }}
              >
                Looking that exercise up…
              </Text>
            )}
          </ScrollView>
          {search.trim() !== '' && (
            <Button
              label={`Add "${search.trim()}"`}
              onPress={() => {
                // Typing a catalogue name out in full is the same tap by another
                // route, so it has to resolve to the same recorded name.
                const exact = matches.find(
                  (m) => m.canonicalName.toLowerCase() === search.trim().toLowerCase(),
                );
                void addExercise(exact?.recordedName ?? search, exact?.bodyweightBased);
              }}
            />
          )}
          <Button label="Cancel" variant="subtle" onPress={() => setPicking(false)} />
        </View>
      ) : (
        <Button label="Add exercise" onPress={() => setPicking(true)} />
      )}

      <ExerciseInfoSheet entry={info} onClose={() => setInfo(null)} />

      <Text style={[styles.note, { color: colors.textFaint }]}>
        Tick a set to record it. Tap the set number to mark it a warmup. Leaving without
        finishing keeps this workout open.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { fontFamily: font.ui, fontSize: 12, lineHeight: 17, marginTop: 6 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: space.md,
    marginBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  finish: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
  },
  block: { marginBottom: space.lg },
  blockHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: space.xs },
  columns: { flexDirection: 'row', alignItems: 'center', paddingBottom: 4 },
  col: { fontFamily: font.uiStrong, fontSize: 11, letterSpacing: 0.5 },
  colSet: { width: 34, textAlign: 'center' },
  colPrev: { flex: 1, textAlign: 'center' },
  colNum: { width: 64, textAlign: 'center', marginHorizontal: 3 },
  colTick: { width: 40, alignItems: 'center', justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TOUCH_TARGET,
    borderRadius: radius.sm,
    marginBottom: 4,
  },
  input: {
    minHeight: TOUCH_TARGET - 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  addSet: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    marginTop: 4,
  },
  iconBtn: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.sm,
    marginBottom: space.md,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
