import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { MovementPattern } from '../ai/exercises';
import type { CardioMode } from '../cardio';
import type { CatalogueEntry } from '../db';
import {
  searchExercisesFast,
  type KnownExercise,
} from '../exerciseSearch';
import {
  findSubstitutes,
  groupSubstitutesByEquipment,
} from '../exerciseSubstitutes';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { ExerciseIcon } from './ExerciseIcon';
import { Tappable } from './Tappable';

export type SwapMode = 'swap-remaining' | 'swap-all';

interface SwapExerciseSheetProps {
  open: boolean;
  currentExerciseName: string;
  hasLoggedSets: boolean;
  loggedSetsCount: number;
  catalogue: CatalogueEntry[];
  known: KnownExercise[];
  patterns: Record<string, MovementPattern>;
  onSelectSwap: (
    option: {
      name: string;
      bodyweightBased: boolean;
      isCardio: boolean;
      cardioMode?: CardioMode | null;
    },
    mode: SwapMode,
  ) => void;
  onClose: () => void;
}

export const SwapExerciseSheet = ({
  open,
  currentExerciseName,
  hasLoggedSets,
  loggedSetsCount,
  catalogue,
  known,
  patterns,
  onSelectSwap,
  onClose,
}: SwapExerciseSheetProps) => {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [activeEquipment, setActiveEquipment] = useState<string>('ALL');
  const [swapMode, setSwapMode] = useState<SwapMode>(
    hasLoggedSets ? 'swap-remaining' : 'swap-all',
  );

  // 1. Intelligent substitutes sharing same movement pattern & primary muscle
  const substitutes = useMemo(() => {
    return findSubstitutes({
      currentExerciseName,
      catalogue,
      known,
      patterns,
      limit: 25,
    });
  }, [currentExerciseName, catalogue, known, patterns]);

  const equipmentGroups = useMemo(() => {
    return groupSubstitutesByEquipment(substitutes);
  }, [substitutes]);

  const equipmentTabs = useMemo(() => {
    return ['ALL', ...equipmentGroups.map((g) => g.equipment)];
  }, [equipmentGroups]);

  // Filtered by equipment if search is empty
  const displayedSubstitutes = useMemo(() => {
    if (activeEquipment === 'ALL') return substitutes;
    const group = equipmentGroups.find((g) => g.equipment === activeEquipment);
    return group ? group.substitutes : substitutes;
  }, [activeEquipment, substitutes, equipmentGroups]);

  // 2. Search results if user types custom query
  const searchResults = useMemo(() => {
    const trimmed = search.trim();
    if (!trimmed) return [];
    return searchExercisesFast({
      query: trimmed,
      catalogue,
      known,
      limit: 20,
    });
  }, [search, catalogue, known]);

  if (!open) return null;

  const currentPattern = patterns[currentExerciseName] ?? 'isolation';

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: Math.max(space.lg, insets.bottom + space.sm) }]}>
        {/* Handle */}
        <View style={styles.handleContainer}>
          <View style={styles.handle} />
        </View>

        {/* Sheet Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIconTab}>
              <Ionicons name="swap-horizontal" size={18} color={loud.loud} />
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.sheetTitle}>SWAP MOVEMENT</Text>
              <Text style={styles.currentName} numberOfLines={1}>
                {currentExerciseName.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.patternCue}>
            Finding alternative {currentPattern.toUpperCase()} movements with matching stimulus
          </Text>
        </View>

        {/* Mode Selector (When sets were already performed) */}
        {hasLoggedSets && (
          <View style={styles.modeSection}>
            <Text style={styles.modeHeading}>SETS ALREADY COMPLETED</Text>
            <View style={styles.modeRow}>
              <Pressable
                onPress={() => setSwapMode('swap-remaining')}
                style={[
                  styles.modeButton,
                  swapMode === 'swap-remaining' && styles.modeButtonActive,
                ]}
              >
                <Ionicons
                  name={swapMode === 'swap-remaining' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={swapMode === 'swap-remaining' ? loud.loud : loud.figureMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.modeButtonTitle,
                      swapMode === 'swap-remaining' && styles.modeButtonTitleActive,
                    ]}
                  >
                    SWAP REMAINING
                  </Text>
                  <Text style={styles.modeButtonSub}>
                    Keep {loggedSetsCount} logged set{loggedSetsCount > 1 ? 's' : ''} on {currentExerciseName}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => setSwapMode('swap-all')}
                style={[styles.modeButton, swapMode === 'swap-all' && styles.modeButtonActive]}
              >
                <Ionicons
                  name={swapMode === 'swap-all' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={swapMode === 'swap-all' ? loud.loud : loud.figureMuted}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.modeButtonTitle,
                      swapMode === 'swap-all' && styles.modeButtonTitleActive,
                    ]}
                  >
                    CONVERT ALL
                  </Text>
                  <Text style={styles.modeButtonSub}>
                    Update all sets to new movement
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        {/* Search input */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={`Search all exercises or pick below`}
          placeholderTextColor={loud.figureFaint}
          style={styles.searchInput}
        />

        {/* Equipment Filter Chips (when not actively searching) */}
        {search.trim().length === 0 && equipmentTabs.length > 2 && (
          <View style={styles.equipmentTabsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.equipmentTabs}
            >
              {equipmentTabs.map((tab) => {
                const active = activeEquipment === tab;
                return (
                  <Pressable
                    key={tab}
                    onPress={() => setActiveEquipment(tab)}
                    style={[styles.equipmentTab, active && styles.equipmentTabActive]}
                  >
                    <Text
                      style={[
                        styles.equipmentTabText,
                        active ? styles.equipmentTabTextActive : styles.equipmentTabTextInactive,
                      ]}
                    >
                      {tab.toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Alternatives List */}
        <ScrollView style={styles.listContainer} keyboardShouldPersistTaps="handled">
          {search.trim().length > 0 ? (
            /* Search Results */
            <>
              <Text style={styles.sectionLabel}>SEARCH RESULTS</Text>
              {searchResults.length === 0 ? (
                <Text style={styles.emptyNote}>No matching exercises found.</Text>
              ) : (
                searchResults.map((item) => (
                  <Tappable
                    key={item.id}
                    onPress={() => {
                      onSelectSwap(
                        {
                          name: item.name,
                          bodyweightBased: item.bodyweightBased,
                          isCardio: item.isCardio,
                          cardioMode: item.cardioMode,
                        },
                        swapMode,
                      );
                      onClose();
                    }}
                    scaleTo={0.985}
                    style={styles.candidateRow}
                  >
                    <ExerciseIcon
                      pattern={item.movementPattern ?? patterns[item.name]}
                      isCardio={item.isCardio}
                      size={20}
                      color={loud.loud}
                    />
                    <View style={styles.candidateInfo}>
                      <Text style={styles.candidateName}>{item.name}</Text>
                      <Text style={styles.candidateMeta}>
                        {item.equipment ?? 'Equipment'} · {item.primaryMuscle ?? 'General'}
                        {item.bodyweightBased ? ' · bodyweight' : ''}
                      </Text>
                    </View>
                    <View style={styles.swapActionBadge}>
                      <Text style={styles.swapActionText}>SWAP</Text>
                    </View>
                  </Tappable>
                ))
              )}
            </>
          ) : (
            /* Recommended Substitutes */
            <>
              <Text style={styles.sectionLabel}>
                RECOMMENDED SUBSTITUTES ({displayedSubstitutes.length})
              </Text>
              {displayedSubstitutes.length === 0 ? (
                <Text style={styles.emptyNote}>
                  No direct substitutes found for this equipment. Try searching above.
                </Text>
              ) : (
                displayedSubstitutes.map((item) => {
                  const isExact = item.matchTier === 'same-muscle-and-pattern';
                  return (
                    <Tappable
                      key={item.id}
                      onPress={() => {
                        onSelectSwap(
                          {
                            name: item.name,
                            bodyweightBased: item.bodyweightBased,
                            isCardio: item.isCardio,
                            cardioMode: item.cardioMode,
                          },
                          swapMode,
                        );
                        onClose();
                      }}
                      scaleTo={0.985}
                      style={styles.candidateRow}
                    >
                      <ExerciseIcon
                        pattern={item.pattern}
                        isCardio={item.isCardio}
                        size={20}
                        color={loud.loud}
                      />
                      <View style={styles.candidateInfo}>
                        <View style={styles.candidateNameRow}>
                          <Text style={styles.candidateName}>{item.name}</Text>
                          {isExact && (
                            <View style={styles.exactBadge}>
                              <Text style={styles.exactBadgeText}>MATCH</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.candidateMeta}>
                          {item.equipment ?? 'Equipment'}
                          {item.primaryMuscle ? ` · ${item.primaryMuscle}` : ''}
                          {item.isHistory ? ' · in history' : ''}
                        </Text>
                      </View>

                      <View style={styles.swapActionBadge}>
                        <Text style={styles.swapActionText}>SWAP</Text>
                      </View>
                    </Tappable>
                  );
                })
              )}
            </>
          )}
        </ScrollView>

        {/* Cancel Button */}
        <Tappable onPress={onClose} scaleTo={0.97}>
          <View style={[styles.cancelSlab, { backgroundColor: loud.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: loud.rule }]}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </View>
        </Tappable>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    maxHeight: '85%',
    paddingHorizontal: space.md,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: loud.rule,
  },
  header: {
    marginBottom: space.sm,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerIconTab: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: loud.panel,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  headerTextCol: {
    flex: 1,
  },
  sheetTitle: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.4,
    color: loud.figureFaint,
  },
  currentName: {
    fontFamily: font.display,
    fontSize: 15,
    letterSpacing: 0.3,
    color: loud.figure,
  },
  patternCue: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
    marginTop: 4,
  },
  modeSection: {
    backgroundColor: loud.panel,
    borderRadius: radius.md,
    padding: space.sm,
    marginBottom: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  modeHeading: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginBottom: 6,
  },
  modeRow: {
    flexDirection: 'column',
    gap: 6,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: loud.ground,
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  modeButtonActive: {
    borderColor: loud.loud,
  },
  modeButtonTitle: {
    fontFamily: font.display,
    fontSize: 11,
    letterSpacing: 1.1,
    color: loud.figureMuted,
  },
  modeButtonTitleActive: {
    color: loud.figure,
  },
  modeButtonSub: {
    fontFamily: font.ui,
    fontSize: 10,
    color: loud.figureFaint,
    marginTop: 1,
  },
  searchInput: {
    minHeight: TOUCH_TARGET - 8,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
    fontFamily: font.figure,
    color: loud.figure,
    backgroundColor: loud.panel,
    borderColor: loud.rule,
  },
  equipmentTabsWrapper: {
    marginBottom: space.sm,
  },
  equipmentTabs: {
    flexDirection: 'row',
    gap: 6,
  },
  equipmentTab: {
    backgroundColor: loud.panel,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  equipmentTabActive: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  equipmentTabText: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.1,
  },
  equipmentTabTextActive: {
    color: loud.onLoud,
  },
  equipmentTabTextInactive: {
    color: loud.figureFaint,
  },
  listContainer: {
    maxHeight: 280,
    marginBottom: space.sm,
  },
  sectionLabel: {
    fontFamily: font.display,
    fontSize: 9,
    letterSpacing: 1.3,
    color: loud.figureFaint,
    marginBottom: space.xs,
  },
  emptyNote: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureFaint,
    paddingVertical: space.md,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TOUCH_TARGET + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    paddingVertical: 4,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  candidateName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    color: loud.figure,
  },
  exactBadge: {
    backgroundColor: '#14261C',
    borderColor: '#234430',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  exactBadgeText: {
    fontFamily: font.display,
    fontSize: 8,
    letterSpacing: 1,
    color: '#6FB58A',
  },
  candidateMeta: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    marginTop: 1,
  },
  swapActionBadge: {
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.loud,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  swapActionText: {
    fontFamily: font.display,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.loud,
  },
  cancelSlab: {
    minHeight: TOUCH_TARGET - 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
  },
  cancelText: {
    fontFamily: font.display,
    fontSize: 12,
    letterSpacing: 1.4,
    color: loud.figureMuted,
  },
});
