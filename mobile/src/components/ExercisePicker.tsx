import { useEffect, useDeferredValue, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnrichmentParseError } from '../ai/exercises';
import type { MovementPattern } from '../ai/exercises';
import { GroundedLookupError, enrichExercises } from '../api/gemini';
import { BUILTIN_CATALOGUE } from '../builtinCatalogue';
import {
  type CardioMode,
  detectCardio,
  detectCardioMode,
} from '../cardio';
import {
  linkExerciseToCatalogue,
  loadAllCatalogueEntries,
  upsertCatalogueEntry,
} from '../db';
import type { CatalogueEntry } from '../db';
import {
  getCachedCatalogue,
  searchExercisesFast,
  updateCatalogueCache,
  warmCatalogueCache,
  type ExerciseSearchResult,
  type KnownExercise,
  type MuscleFilter,
} from '../exerciseSearch';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { ExerciseIcon } from './ExerciseIcon';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

const couldNotLookUp = 'Could not look that up. You can still add it.';

const CARDIO_SUGGESTIONS = [
  'Walking',
  'Jogging',
  'Running',
  'Biking',
  'Cycling',
  'Treadmill Walk',
  'Elliptical',
  'Rowing',
  'Stair Climber',
  'Hiking',
];

const MUSCLE_FILTERS: { key: MuscleFilter; label: string }[] = [
  { key: 'all', label: 'ALL' },
  { key: 'chest', label: 'CHEST' },
  { key: 'back', label: 'BACK' },
  { key: 'legs', label: 'LEGS' },
  { key: 'shoulders', label: 'SHOULDERS' },
  { key: 'arms', label: 'ARMS' },
  { key: 'core', label: 'CORE' },
];

interface ExercisePickerProps {
  /** Exercises already on record, for the history list and the bodyweight flag. */
  known: KnownExercise[];
  /** Movement glyph per name, shared with the block headers. */
  patterns: Record<string, MovementPattern>;
  geminiApiKey: string;
  /**
   * A name was chosen. The recorded name when one exists, never the
   * catalogue's canonical one in its place: `sets` are filed under the name
   * first logged, and logging under a second spelling forks that history in
   * two and blanks both halves.
   */
  onPick: (
    name: string,
    catalogueBodyweight?: boolean,
    cardio?: { isCardio: boolean; mode: CardioMode },
  ) => void;
  onCancel: () => void;
  initialMode?: 'exercise' | 'cardio';
}

/**
 * Finding or naming the next exercise or cardiovascular activity.
 *
 * Ultra-fast tokenized, abbreviation-aware search over in-memory catalogue
 * and user workout history with zero SQLite round-trip lag.
 */
export const ExercisePicker = ({
  known,
  patterns,
  geminiApiKey,
  onPick,
  onCancel,
  initialMode = 'exercise',
}: ExercisePickerProps) => {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>(
    () => getCachedCatalogue() ?? BUILTIN_CATALOGUE,
  );
  const [muscleFilter, setMuscleFilter] = useState<MuscleFilter>('all');
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [isCardio, setIsCardio] = useState(initialMode === 'cardio');
  const [cardioMode, setCardioMode] = useState<CardioMode>('treadmill');
  const [autoDetected, setAutoDetected] = useState(false);

  const autoEnriched = useRef<Set<string>>(new Set());
  const latestTerm = useRef('');

  // Warm in-memory catalogue cache from SQLite (which merges built-in + custom entries)
  useEffect(() => {
    if (!getCachedCatalogue()) {
      void warmCatalogueCache(loadAllCatalogueEntries)
        .then(setCatalogue)
        .catch((err) => console.warn('failed warming catalogue cache', err));
    }
  }, []);

  // Auto-detect cardio based on search input
  const handleSearchChange = (text: string) => {
    setSearch(text);
    const trimmed = text.trim();
    const isDetected = detectCardio(trimmed);
    const historyItem = known.find((k) => k.name.toLowerCase() === trimmed.toLowerCase());

    if (isDetected || historyItem?.isCardio) {
      setIsCardio(true);
      setAutoDetected(true);
      setCardioMode(detectCardioMode(trimmed, historyItem?.cardioMode));
    } else if (autoDetected && !trimmed) {
      setAutoDetected(false);
      setIsCardio(initialMode === 'cardio');
      setCardioMode('treadmill');
    }
  };

  // Instant in-memory search results
  const searchResults = useMemo<ExerciseSearchResult[]>(() => {
    return searchExercisesFast({
      query: deferredSearch,
      catalogue,
      known,
      isCardio,
      muscleFilter,
      limit: 30,
    });
  }, [deferredSearch, catalogue, known, isCardio, muscleFilter]);

  // Only enrich strength training exercises with Gemini if not in cardio mode and no results
  useEffect(() => {
    const term = deferredSearch.trim();
    latestTerm.current = term;
    setEnrichNote(null);

    if (isCardio || enriching || term.length < 2) return;
    if (searchResults.length > 0 || autoEnriched.current.has(term)) return;
    if (known.some((k) => k.name.toLowerCase().includes(term.toLowerCase()))) return;

    const timer = setTimeout(() => {
      autoEnriched.current.add(term);
      setEnriching(true);
      setEnrichNote(null);
      void enrichExercises([term], geminiApiKey)
        .then(async ({ entries }) => {
          if (entries.length === 0) {
            if (latestTerm.current === term) setEnrichNote(couldNotLookUp);
            return;
          }
          const id = await upsertCatalogueEntry(entries[0]);
          await linkExerciseToCatalogue(entries[0].requestedName, id);

          const newEntry: CatalogueEntry = {
            id,
            canonicalName: entries[0].canonicalName,
            recordedName: entries[0].requestedName,
            movementPattern: entries[0].movementPattern,
            primaryMuscle: entries[0].primaryMuscle,
            equipment: entries[0].equipment,
            bodyweightBased: entries[0].bodyweightBased,
            instructions: entries[0].instructions,
            primaryRegion: entries[0].primaryRegion,
            secondaryRegions: entries[0].secondaryRegions,
            steps: entries[0].steps,
          };

          updateCatalogueCache(newEntry);
          setCatalogue((prev) => [...prev.filter((p) => p.id !== id), newEntry]);
        })
        .catch((error) => {
          if (latestTerm.current === term) setEnrichNote(couldNotLookUp);
          if (error instanceof GroundedLookupError || error instanceof EnrichmentParseError) return;
          console.warn('exercise enrichment failed', error);
        })
        .finally(() => setEnriching(false));
    }, 1200);

    return () => clearTimeout(timer);
  }, [deferredSearch, enriching, searchResults.length, known, geminiApiKey, isCardio]);

  const rawTerm = search.trim();
  const lowerTerm = rawTerm.toLowerCase();
  const hasStrengthHistory = useMemo(() => known.some((k) => !k.isCardio), [known]);

  const emptyQueryGroupLabel = useMemo(() => {
    if (isCardio) return 'RECENT CARDIO ACTIVITIES';
    if (muscleFilter !== 'all') return `${muscleFilter.toUpperCase()} EXERCISES`;
    return hasStrengthHistory ? 'RECENT & FREQUENT EXERCISES' : 'POPULAR STARTER EXERCISES';
  }, [isCardio, muscleFilter, hasStrengthHistory]);

  return (
    <View style={styles.picker}>
      {/* Category selector */}
      <View style={styles.tabRow}>
        <Pressable
          onPress={() => {
            setIsCardio(false);
            setAutoDetected(false);
          }}
          style={[styles.tab, !isCardio && styles.tabActive]}
        >
          <Text style={[styles.tabText, !isCardio ? styles.tabTextActive : styles.tabTextInactive]}>
            EXERCISE / LIFT
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setIsCardio(true)}
          style={[styles.tab, isCardio && styles.tabActive]}
        >
          <Text style={[styles.tabText, isCardio ? styles.tabTextActive : styles.tabTextInactive]}>
            CARDIO
          </Text>
        </Pressable>
      </View>

      <TextInput
        value={search}
        onChangeText={handleSearchChange}
        placeholder={isCardio ? 'Search or type cardio (e.g. Walking, Running)' : 'Search (e.g. Bench, Squat, DB, OHP)'}
        placeholderTextColor={loud.figureFaint}
        autoFocus
        style={styles.input}
      />

      {/* Muscle group filter chips for strength exercises */}
      {!isCardio && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.filterBar}
        >
          {MUSCLE_FILTERS.map((f) => {
            const active = muscleFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setMuscleFilter(f.key)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Treadmill vs Outside selection for cardio */}
      {isCardio && (
        <View style={styles.cardioSelection}>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setCardioMode('treadmill')}
              style={[styles.modeChip, cardioMode === 'treadmill' && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, cardioMode === 'treadmill' && styles.modeChipTextActive]}>
                🏃 Machine
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setCardioMode('outside')}
              style={[styles.modeChip, cardioMode === 'outside' && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, cardioMode === 'outside' && styles.modeChipTextActive]}>
                🌲 Outside / Distance
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Quick suggestions when in cardio mode with empty search */}
      {isCardio && rawTerm.length === 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.group}>POPULAR CARDIO ACTIVITIES</Text>
          <View style={styles.suggestionChips}>
            {CARDIO_SUGGESTIONS.map((item) => (
              <Pressable
                key={item}
                onPress={() => handleSearchChange(item)}
                style={styles.suggestionChip}
              >
                <Text style={styles.suggestionText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
        {rawTerm.length === 0 && searchResults.length > 0 && (
          <Text style={styles.group}>{emptyQueryGroupLabel}</Text>
        )}

        {searchResults.map((item) => {
          const itemPattern = (item.movementPattern as MovementPattern) ?? patterns[item.name];
          const itemMode = item.cardioMode ?? cardioMode;

          return (
            <Tappable
              key={item.id}
              onPress={() =>
                onPick(item.name, item.bodyweightBased, {
                  isCardio: isCardio || item.isCardio,
                  mode: itemMode,
                })
              }
              scaleTo={0.985}
              style={styles.row}
            >
              <ExerciseIcon
                pattern={itemPattern}
                isCardio={item.isCardio}
                size={20}
                color={loud.loud}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.isCardio
                    ? `Cardio · ${itemMode === 'outside' ? 'Outside' : 'Machine'}`
                    : `${item.primaryMuscle ?? 'General'} · ${item.equipment ?? 'Custom'}${
                        item.bodyweightBased ? ' · bodyweight' : ''
                      }`}
                </Text>
              </View>
            </Tappable>
          );
        })}

        {enriching && <Text style={styles.note}>Looking that exercise up…</Text>}
        {enrichNote !== null && !enriching && <Text style={styles.note}>{enrichNote}</Text>}
      </ScrollView>

      {rawTerm !== '' && (
        <Tappable
          onPress={() => {
            const exact = searchResults.find(
              (m) =>
                m.canonicalName.toLowerCase() === lowerTerm ||
                m.name.toLowerCase() === lowerTerm,
            );
            const pickedName = exact?.name ?? rawTerm;
            onPick(pickedName, exact?.bodyweightBased, {
              isCardio: isCardio || detectCardio(pickedName),
              mode: cardioMode,
            });
          }}
          scaleTo={0.97}
        >
          <SlashPanel color={loud.loud} style={styles.slab}>
            <Text style={[styles.slabLabel, { color: loud.onLoud }]} numberOfLines={1}>
              ADD {rawTerm.toUpperCase()}
              {isCardio ? ` (${cardioMode === 'outside' ? 'OUTSIDE' : 'MACHINE'})` : ''}
            </Text>
          </SlashPanel>
        </Tappable>
      )}

      <Tappable onPress={onCancel} scaleTo={0.97}>
        <SlashPanel color={loud.panel} style={styles.slab}>
          <Text style={[styles.slabLabel, { color: loud.figureMuted }]}>CANCEL</Text>
        </SlashPanel>
      </Tappable>
    </View>
  );
};

const styles = StyleSheet.create({
  picker: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.sm,
    marginBottom: space.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginBottom: space.sm,
  },
  tab: {
    flex: 1,
    minHeight: TOUCH_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  tabActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  tabText: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.2,
  },
  tabTextActive: {
    color: loud.onLoud,
  },
  tabTextInactive: {
    color: loud.figureFaint,
  },
  input: {
    minHeight: TOUCH_TARGET - 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    marginBottom: space.xs,
    textAlign: 'left',
    fontFamily: font.figure,
    color: loud.figure,
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  filterBar: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 6,
    marginBottom: space.xs,
  },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  filterChipActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  filterChipText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.1,
    color: loud.figureFaint,
  },
  filterChipTextActive: {
    color: loud.onLoud,
  },
  cardioSelection: {
    backgroundColor: loud.panel,
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  modeRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  modeChip: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: loud.ground,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: space.xs,
  },
  modeChipActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  modeChipText: {
    fontFamily: font.uiStrong,
    fontSize: 11,
    color: loud.figureMuted,
  },
  modeChipTextActive: {
    color: loud.onLoud,
  },
  suggestionsContainer: {
    marginBottom: space.sm,
  },
  suggestionChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingVertical: 4,
  },
  suggestionChip: {
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  suggestionText: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  group: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.4,
    color: loud.figureFaint,
    paddingTop: space.sm,
    paddingBottom: 4,
  },
  note: { fontFamily: font.ui, fontSize: 12, padding: space.md, color: loud.figureFaint },
  name: { fontFamily: font.uiStrong, fontSize: 14, color: loud.figure },
  meta: { fontFamily: font.ui, fontSize: 12, color: loud.figureFaint },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  slab: {
    minHeight: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  slabLabel: { fontFamily: font.display, fontSize: 13, letterSpacing: 1.4, textAlign: 'center' },
});
