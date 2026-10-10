import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { EnrichmentParseError } from '../ai/exercises';
import type { MovementPattern } from '../ai/exercises';
import { GroundedLookupError, enrichExercises } from '../api/gemini';
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

interface ExercisePickerProps {
  /** Exercises already on record, for the history list and the bodyweight flag. */
  known: { name: string; bodyweightBased: boolean }[];
  /** Movement glyph per name, shared with the block headers. */
  patterns: Record<string, MovementPattern>;
  geminiApiKey: string;
  /**
   * A name was chosen. The recorded name when one exists, never the
   * catalogue's canonical one in its place: `sets` are filed under the name
   * first logged, and logging under a second spelling forks that history in
   * two and blanks both halves.
   */
  onPick: (name: string, catalogueBodyweight?: boolean) => void;
  onCancel: () => void;
}

/**
 * Finding or naming the next exercise.
 *
 * Lifted out of the session screen, which had grown past 1,100 lines with
 * this living inside it: its own search, its own catalogue lookups, a Gemini
 * enrichment with a debounce and two refs guarding it, and a render a hundred
 * lines long. None of that touches the sets being logged, and the screen is
 * the file edited on nearly every change.
 *
 * Mounted only while picking, so its state starts fresh every time it opens
 * and needs no resetting when it closes — what used to be a `setSearch('')`
 * after every add is simply the component going away.
 */
export const ExercisePicker = ({
  known,
  patterns,
  geminiApiKey,
  onPick,
  onCancel,
}: ExercisePickerProps) => {
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState<CatalogueEntry[]>([]);
  const [enriching, setEnriching] = useState(false);
  // What to say when the lookup came back with nothing. A name the model
  // declines is left unlinked and *reported*, not guessed at; the picker used
  // to swallow it and leave the progress line as the only thing that happened.
  const [enrichNote, setEnrichNote] = useState<string | null>(null);
  // Same guard as the food search: one automatic call per distinct term, so a
  // failed enrichment cannot refire and retyping costs nothing.
  const autoEnriched = useRef<Set<string>>(new Set());
  const latestTerm = useRef('');

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

  // A name the catalogue does not know is the dead end worth removing. Wait for
  // typing to settle, then classify it and write its how-to, once.
  useEffect(() => {
    const term = search.trim();
    if (enriching || term.length < 2) return;
    if (matches.length > 0 || autoEnriched.current.has(term)) return;
    // An exercise already on record is not a dead end, whatever the catalogue
    // knows about it: the picker lists it below and tapping it works. Spending a
    // call to be told what `exercises` already holds is the waste worth avoiding.
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
          // By the name the model returned, which may not contain what was typed.
          const found = await searchCatalogue(entries[0].canonicalName);
          // The user may have kept typing while this was in flight.
          if (latestTerm.current === term) setMatches(found);
        })
        .catch((error) => {
          // Typing the name still works; the failure only means it arrives
          // without a pattern or a how-to, which is better than blocking the set.
          if (latestTerm.current === term) setEnrichNote(couldNotLookUp);
          // Only the two lookup failures are expected; anything else is a bug.
          if (error instanceof GroundedLookupError || error instanceof EnrichmentParseError) return;
          console.warn('exercise enrichment failed', error);
        })
        .finally(() => setEnriching(false));
    }, 1200);

    return () => clearTimeout(timer);
  }, [search, enriching, matches.length, known, geminiApiKey]);

  // Catalogue matches first, then the exercises already on record that no match
  // covers. Rendering matches alone gave a device with a year of history and no
  // seeding run an empty box, and made typing a name it already knew fire a
  // Gemini call for it. A row with no icon and no muscle still logs sets.
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
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search or type a new exercise"
        placeholderTextColor={loud.figureFaint}
        autoFocus
        style={styles.input}
      />
      <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
        {matches.map((item, index) => (
          <FadeIn key={item.id} delay={Math.min(index, 6) * 25}>
            <Tappable
              onPress={() => onPick(item.recordedName ?? item.canonicalName, item.bodyweightBased)}
              scaleTo={0.985}
              style={styles.row}
            >
              <ExerciseIcon pattern={item.movementPattern} size={20} color={loud.loud} />
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
        {knownMatches.map((item) => (
          <Tappable
            key={`known:${item.name}`}
            onPress={() => onPick(item.name)}
            scaleTo={0.985}
            style={styles.row}
          >
            <ExerciseIcon pattern={patterns[item.name]} size={20} color={loud.loud} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
            </View>
          </Tappable>
        ))}
        {enriching && <Text style={styles.note}>Looking that exercise up…</Text>}
        {enrichNote !== null && !enriching && <Text style={styles.note}>{enrichNote}</Text>}
      </ScrollView>

      {search.trim() !== '' && (
        <Tappable
          onPress={() => {
            // Typing a catalogue name out in full is the same tap by another
            // route, so it has to resolve to the same recorded name.
            const exact = matches.find((m) => m.canonicalName.toLowerCase() === term);
            onPick(exact?.recordedName ?? search, exact?.bodyweightBased);
          }}
          scaleTo={0.97}
        >
          <SlashPanel color={loud.loud} style={styles.slab}>
            <Text style={[styles.slabLabel, { color: loud.onLoud }]} numberOfLines={1}>
              ADD {search.trim().toUpperCase()}
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
  group: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.4,
    color: loud.figureFaint,
    paddingTop: space.md,
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
