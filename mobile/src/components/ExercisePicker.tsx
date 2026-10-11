import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnrichmentParseError } from '../ai/exercises';
import type { MovementPattern } from '../ai/exercises';
import { GroundedLookupError, enrichExercises } from '../api/gemini';
import {
  type CardioMode,
  detectCardio,
  detectCardioMode,
} from '../cardio';
import { linkExerciseToCatalogue, searchCatalogue, upsertCatalogueEntry } from '../db';
import type { CatalogueEntry } from '../db';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { ExerciseIcon } from './ExerciseIcon';
import { FadeIn } from './FadeIn';
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

interface ExercisePickerProps {
  /** Exercises already on record, for the history list and the bodyweight flag. */
  known: {
    name: string;
    bodyweightBased: boolean;
    isCardio?: boolean;
    cardioMode?: 'treadmill' | 'outside' | null;
  }[];
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
 * Supports auto-detecting cardio inputs (walking, jogging, running, biking, etc.)
 * with explicit selection for treadmill vs outside.
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
  const [matches, setMatches] = useState<CatalogueEntry[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  const [isCardio, setIsCardio] = useState(initialMode === 'cardio');
  const [cardioMode, setCardioMode] = useState<CardioMode>('treadmill');
  const [autoDetected, setAutoDetected] = useState(false);

  const autoEnriched = useRef<Set<string>>(new Set());
  const latestTerm = useRef('');

  // Auto-detect cardio based on search input
  const handleSearchChange = (text: string) => {
    setSearch(text);
    const isDetected = detectCardio(text);
    if (isDetected) {
      setIsCardio(true);
      setAutoDetected(true);
      setCardioMode(detectCardioMode(text));
    } else if (autoDetected && !text.trim()) {
      setAutoDetected(false);
      setIsCardio(initialMode === 'cardio');
    }
  };

  useEffect(() => {
    const term = search.trim();
    latestTerm.current = term;
    setEnrichNote(null);
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

  // Only enrich strength training exercises with Gemini if not in cardio mode
  useEffect(() => {
    const term = search.trim();
    if (isCardio || enriching || term.length < 2) return;
    if (matches.length > 0 || autoEnriched.current.has(term)) return;
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
          const found = await searchCatalogue(entries[0].canonicalName);
          if (latestTerm.current === term) setMatches(found);
        })
        .catch((error) => {
          if (latestTerm.current === term) setEnrichNote(couldNotLookUp);
          if (error instanceof GroundedLookupError || error instanceof EnrichmentParseError) return;
          console.warn('exercise enrichment failed', error);
        })
        .finally(() => setEnriching(false));
    }, 1200);

    return () => clearTimeout(timer);
  }, [search, enriching, matches.length, known, geminiApiKey, isCardio]);

  const term = search.trim().toLowerCase();
  const knownMatches = known.filter(
    (k) =>
      k.name.toLowerCase().includes(term) &&
      !matches.some(
        (m) =>
          m.recordedName?.toLowerCase() === k.name.toLowerCase() ||
          m.canonicalName.toLowerCase() === k.name.toLowerCase(),
      ),
  );

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
        placeholder={isCardio ? 'Search or type cardio (e.g. Walking, Running)' : 'Search or type a new exercise'}
        placeholderTextColor={loud.figureFaint}
        autoFocus
        style={styles.input}
      />

      {/* Treadmill vs Outside selection for cardio */}
      {isCardio && (
        <View style={styles.cardioSelection}>
          <Text style={styles.cardioLabel}>
            {autoDetected ? 'AUTO-DETECTED CARDIO · SELECT MODE:' : 'CARDIO MODE:'}
          </Text>
          <View style={styles.modeRow}>
            <Pressable
              onPress={() => setCardioMode('treadmill')}
              style={[styles.modeChip, cardioMode === 'treadmill' && styles.modeChipActive]}
            >
              <Text style={[styles.modeChipText, cardioMode === 'treadmill' && styles.modeChipTextActive]}>
                🏃 Treadmill / Machine
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

      {/* Quick suggestions when in cardio mode with empty or short search */}
      {isCardio && search.trim().length === 0 && (
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
        {matches.map((item, index) => (
          <FadeIn key={item.id} delay={Math.min(index, 6) * 25}>
            <Tappable
              onPress={() =>
                onPick(item.recordedName ?? item.canonicalName, item.bodyweightBased, {
                  isCardio,
                  mode: cardioMode,
                })
              }
              scaleTo={0.985}
              style={styles.row}
            >
              <ExerciseIcon
                pattern={item.movementPattern}
                isCardio={isCardio}
                size={20}
                color={loud.loud}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.canonicalName}</Text>
                <Text style={styles.meta}>
                  {item.primaryMuscle} · {item.equipment}
                  {item.bodyweightBased ? ' · bodyweight' : ''}
                </Text>
              </View>
            </Tappable>
          </FadeIn>
        ))}
        {knownMatches.length > 0 && <Text style={styles.group}>FROM YOUR HISTORY</Text>}
        {knownMatches.map((item) => {
          const itemIsCardio = item.isCardio ?? isCardio;
          const itemMode = item.cardioMode ?? cardioMode;
          return (
            <Tappable
              key={`known:${item.name}`}
              onPress={() =>
                onPick(item.name, item.bodyweightBased, {
                  isCardio: itemIsCardio,
                  mode: itemMode,
                })
              }
              scaleTo={0.985}
              style={styles.row}
            >
              <ExerciseIcon
                pattern={patterns[item.name]}
                isCardio={itemIsCardio}
                size={20}
                color={loud.loud}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                {itemIsCardio && (
                  <Text style={styles.meta}>
                    Cardio · {itemMode === 'outside' ? 'Outside' : 'Treadmill'}
                  </Text>
                )}
              </View>
            </Tappable>
          );
        })}
        {enriching && <Text style={styles.note}>Looking that exercise up…</Text>}
        {enrichNote !== null && !enriching && <Text style={styles.note}>{enrichNote}</Text>}
      </ScrollView>

      {search.trim() !== '' && (
        <Tappable
          onPress={() => {
            const exact = matches.find((m) => m.canonicalName.toLowerCase() === term);
            onPick(exact?.recordedName ?? search.trim(), exact?.bodyweightBased, {
              isCardio,
              mode: cardioMode,
            });
          }}
          scaleTo={0.97}
        >
          <SlashPanel color={loud.loud} style={styles.slab}>
            <Text style={[styles.slabLabel, { color: loud.onLoud }]} numberOfLines={1}>
              ADD {search.trim().toUpperCase()}
              {isCardio ? ` (${cardioMode.toUpperCase()})` : ''}
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
    marginBottom: space.sm,
    textAlign: 'left',
    fontFamily: font.figure,
    color: loud.figure,
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  cardioSelection: {
    backgroundColor: loud.panel,
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  cardioLabel: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.loud,
    marginBottom: space.xs,
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
    color: loud.figure,
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
