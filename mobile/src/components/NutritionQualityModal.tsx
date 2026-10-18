import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { LogEntry, MicronutrientAnalysis, Nutrients, UserProfile } from '@adaptive-macros/engine';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';
import { FadeIn } from './FadeIn';
import { Tappable } from './Tappable';
import {
  type NutritionAdviceResult,
  requestAiNutritionReview,
  runLocalNutritionDiagnostics,
} from '../ai/nutritionAdvisor';

interface NutritionQualityModalProps {
  visible: boolean;
  onClose: () => void;
  consumed: Nutrients;
  entries: LogEntry[];
  profile: UserProfile;
}

type TabKey = 'overview' | 'vitamins' | 'minerals' | 'lipids';

export const NutritionQualityModal = ({
  visible,
  onClose,
  consumed,
  entries,
  profile,
}: NutritionQualityModalProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { settings } = useApp();

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [aiAdvice, setAiAdvice] = useState<NutritionAdviceResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const diagnostics = useMemo(() => {
    return runLocalNutritionDiagnostics({
      consumed,
      entries,
      profile,
      goal: settings.goal,
    });
  }, [consumed, entries, profile, settings.goal]);

  const { quality, electrolytes, microsList, proteinTimingAdvice, topGaps } = diagnostics;

  const vitamins = useMemo(() => {
    return microsList.filter((m) => m.target.category === 'vitamins');
  }, [microsList]);

  const minerals = useMemo(() => {
    return microsList.filter((m) => m.target.category === 'minerals');
  }, [microsList]);

  const lipids = useMemo(() => {
    return microsList.filter((m) => m.target.category === 'lipids');
  }, [microsList]);

  const handleAskAi = async () => {
    thud('light');
    setAiLoading(true);
    setAiError(null);
    try {
      const result = await requestAiNutritionReview({
        consumed,
        entries,
        profile,
        goal: settings.goal,
        personality: settings.personality,
      });
      setAiAdvice(result);
      thud('heavy');
    } catch (err: any) {
      setAiError(err?.message || 'Could not connect to AI nutrition coach.');
    } finally {
      setAiLoading(false);
    }
  };

  const getStatusColor = (status: MicronutrientAnalysis['status']) => {
    switch (status) {
      case 'optimal':
        return colors.positive;
      case 'adequate':
        return colors.accent;
      case 'low':
        return colors.warning;
      case 'deficient':
        return colors.danger;
      case 'high':
        return colors.danger;
      default:
        return colors.textMuted;
    }
  };

  const renderMicroBar = (item: MicronutrientAnalysis) => {
    const statusColor = getStatusColor(item.status);
    const fillPct = Math.min(100, item.pctOfRda);

    return (
      <View key={item.key} style={[styles.microItem, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        <View style={styles.microHeader}>
          <View style={styles.microNameRow}>
            <Text style={[styles.microName, { color: colors.text }]}>{item.target.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor + '20', borderColor: statusColor }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={[styles.microValue, { color: colors.text }]}>
            {Math.round(item.consumed)} / {item.target.rda} {item.target.unit} ({item.pctOfRda}%)
          </Text>
        </View>

        {/* Progress bar */}
        <View style={[styles.microTrack, { backgroundColor: colors.surface }]}>
          <View
            style={[
              styles.microFill,
              { width: `${fillPct}%`, backgroundColor: statusColor },
            ]}
          />
        </View>

        <Text style={[styles.microDesc, { color: colors.textMuted }]}>
          {item.target.description}
        </Text>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Top App Header */}
        <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
          <View style={styles.modalHeaderLeft}>
            <View style={[styles.iconCircle, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
              <Ionicons name="nutrition" size={20} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.headerSubtitle, { color: colors.accent }]}>CLINICAL NUTRITION</Text>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Quality & Micronutrients</Text>
            </View>
          </View>

          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close nutrition panel"
            style={[styles.closeButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        {/* Tab Navigator */}
        <View style={[styles.tabBar, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
          {(
            [
              { key: 'overview', label: 'AI COACH' },
              { key: 'vitamins', label: `VITAMINS (${vitamins.length})` },
              { key: 'minerals', label: `MINERALS (${minerals.length})` },
              { key: 'lipids', label: 'LIPIDS & SUGAR' },
            ] as const
          ).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Tappable
                key={tab.key}
                onPress={() => {
                  thud('light');
                  setActiveTab(tab.key);
                }}
                style={[
                  styles.tabItem,
                  active && { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? colors.text : colors.textMuted },
                  ]}
                >
                  {tab.label}
                </Text>
              </Tappable>
            );
          })}
        </View>

        {/* Scrollable Content */}
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'overview' && (
            <FadeIn>
              {/* Quality Index Card */}
              <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={styles.cardHeaderRow}>
                  <Text style={[styles.cardTag, { color: colors.accent }]}>NUTRITION QUALITY INDEX</Text>
                  <View style={[styles.scoreBadge, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
                    <Text style={[styles.scoreNumber, { color: colors.accent }]}>{quality.score}</Text>
                    <Text style={[styles.scoreMax, { color: colors.textMuted }]}>/100 · {quality.grade}</Text>
                  </View>
                </View>

                <View style={styles.highlightsList}>
                  {quality.highlights.map((h, i) => (
                    <View key={i} style={styles.highlightRow}>
                      <Ionicons name="checkmark-circle-outline" size={16} color={colors.positive} />
                      <Text style={[styles.highlightText, { color: colors.text }]}>{h}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Protein Timing / mTOR Section */}
              <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="barbell-outline" size={18} color={colors.protein} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Protein Distribution & Timing</Text>
                </View>
                <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                  {proteinTimingAdvice}
                </Text>
              </View>

              {/* Electrolyte Balance Section */}
              <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="water-outline" size={18} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Electrolyte Balance (Na:K)</Text>
                </View>

                <View style={styles.electrolyteGrid}>
                  <View style={[styles.gridCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.gridLabel, { color: colors.textMuted }]}>SODIUM</Text>
                    <Text style={[styles.gridVal, { color: colors.text }]}>{Math.round(electrolytes.sodiumMg)} mg</Text>
                  </View>
                  <View style={[styles.gridCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.gridLabel, { color: colors.textMuted }]}>POTASSIUM</Text>
                    <Text style={[styles.gridVal, { color: colors.text }]}>{Math.round(electrolytes.potassiumMg)} mg</Text>
                  </View>
                  <View style={[styles.gridCell, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={[styles.gridLabel, { color: colors.textMuted }]}>RATIO</Text>
                    <Text style={[styles.gridVal, { color: electrolytes.isOptimalRatio ? colors.positive : colors.accent }]}>
                      {electrolytes.ratio ? `${electrolytes.ratio}:1` : '—'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.cardBody, { color: colors.textMuted, marginTop: space.xs }]}>
                  {electrolytes.advice}
                </Text>
              </View>

              {/* AI Deep Nutrition Review Section */}
              <View style={[styles.card, { backgroundColor: colors.surfaceRaised, borderColor: colors.accent }]}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>AI Nutrition Coach Insights</Text>
                </View>

                {aiAdvice ? (
                  <View style={styles.aiResultWrap}>
                    <Text style={[styles.aiHeadline, { color: colors.accent }]}>"{aiAdvice.headline}"</Text>
                    <Text style={[styles.aiSummary, { color: colors.text }]}>{aiAdvice.summary}</Text>

                    {/* Gap analysis */}
                    {aiAdvice.gapAnalysis.length > 0 && (
                      <View style={styles.gapBox}>
                        <Text style={[styles.gapTitle, { color: colors.text }]}>MICRONUTRIENT GAPS & WHOLE FOODS</Text>
                        {aiAdvice.gapAnalysis.map((gap) => (
                          <View key={gap.nutrient} style={[styles.gapRow, { borderColor: colors.border }]}>
                            <View style={styles.gapTop}>
                              <Text style={[styles.gapNutrient, { color: colors.warning }]}>{gap.nutrient}</Text>
                              <Text style={[styles.gapStatus, { color: colors.textMuted }]}>{gap.status}</Text>
                            </View>
                            <Text style={[styles.gapWhy, { color: colors.textMuted }]}>{gap.whyItMatters}</Text>
                            <View style={styles.foodTagRow}>
                              {gap.wholeFoodSources.map((food) => (
                                <View key={food} style={[styles.foodTag, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                                  <Text style={[styles.foodTagText, { color: colors.text }]}>+ {food}</Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    {/* Practical swaps */}
                    {aiAdvice.practicalSwaps.length > 0 && (
                      <View style={styles.gapBox}>
                        <Text style={[styles.gapTitle, { color: colors.text }]}>PRACTICAL FOOD UPGRADES</Text>
                        {aiAdvice.practicalSwaps.map((swap, idx) => (
                          <View key={idx} style={[styles.swapRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                            <Text style={[styles.swapOriginal, { color: colors.textMuted }]}>Instead of: {swap.original}</Text>
                            <Text style={[styles.swapBetter, { color: colors.positive }]}>→ Try: {swap.betterChoice}</Text>
                            <Text style={[styles.swapBenefit, { color: colors.textMuted }]}>{swap.benefit}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {aiAdvice.scienceQuote && (
                      <Text style={[styles.scienceQuote, { color: colors.textFaint }]}>
                        Reference: {aiAdvice.scienceQuote}
                      </Text>
                    )}

                    <Button
                      label="RE-ANALYZE INTAKE"
                      variant="subtle"
                      onPress={handleAskAi}
                    />
                  </View>
                ) : (
                  <View style={styles.aiPromptWrap}>
                    <Text style={[styles.cardBody, { color: colors.textMuted }]}>
                      Get personalized food additions, micronutrient gap solutions, and whole-food swaps tailored to your goal ({settings.goal.direction}).
                    </Text>

                    {topGaps.length > 0 && (
                      <View style={[styles.gapBox, { marginTop: space.sm, marginBottom: space.sm }]}>
                        <Text style={[styles.gapTitle, { color: colors.text }]}>PRIORITY MICRONUTRIENT NEEDS</Text>
                        {topGaps.map((gap) => (
                          <View key={gap.key} style={[styles.gapRow, { borderColor: colors.border }]}>
                            <View style={styles.gapTop}>
                              <Text style={[styles.gapNutrient, { color: colors.warning }]}>{gap.target.name}</Text>
                              <Text style={[styles.gapStatus, { color: colors.textMuted }]}>{gap.pctOfRda}% of RDA</Text>
                            </View>
                            <Text style={[styles.gapWhy, { color: colors.textMuted }]}>
                              {gap.target.description} · {Math.round(gap.consumed)} / {gap.target.rda} {gap.target.unit}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {aiError && (
                      <Text style={[styles.errorText, { color: colors.danger }]}>{aiError}</Text>
                    )}

                    {aiLoading ? (
                      <View style={styles.loadingWrap}>
                        <ActivityIndicator color={colors.accent} size="small" />
                        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
                          Consulting clinical nutrition engine...
                        </Text>
                      </View>
                    ) : (
                      <Button
                        label="ASK AI NUTRITION COACH"
                        variant="primary"
                        onPress={handleAskAi}
                      />
                    )}
                  </View>
                )}
              </View>
            </FadeIn>
          )}

          {activeTab === 'vitamins' && (
            <FadeIn>
              <View style={styles.listContainer}>
                {vitamins.map(renderMicroBar)}
              </View>
            </FadeIn>
          )}

          {activeTab === 'minerals' && (
            <FadeIn>
              <View style={styles.listContainer}>
                {minerals.map(renderMicroBar)}
              </View>
            </FadeIn>
          )}

          {activeTab === 'lipids' && (
            <FadeIn>
              <View style={styles.listContainer}>
                {lipids.map(renderMicroBar)}
              </View>
            </FadeIn>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  headerSubtitle: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontFamily: font.display,
    fontSize: 16,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: space.md,
    marginVertical: space.sm,
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: space.xl,
    gap: space.md,
  },
  card: {
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: space.sm,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTag: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  scoreNumber: {
    fontFamily: font.figure,
    fontSize: 18,
    fontWeight: '800',
  },
  scoreMax: {
    fontFamily: font.figure,
    fontSize: 11,
    marginLeft: 2,
  },
  highlightsList: {
    gap: 6,
    marginTop: space.xs,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  highlightText: {
    fontFamily: font.ui,
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  sectionTitle: {
    fontFamily: font.uiStrong,
    fontSize: 14,
  },
  cardBody: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  electrolyteGrid: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xs,
  },
  gridCell: {
    flex: 1,
    padding: space.xs + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    gap: 2,
  },
  gridLabel: {
    fontFamily: font.figure,
    fontSize: 9,
    fontWeight: '700',
  },
  gridVal: {
    fontFamily: font.figure,
    fontSize: 13,
    fontWeight: '700',
  },
  aiPromptWrap: {
    gap: space.sm,
  },
  aiResultWrap: {
    gap: space.sm,
  },
  aiHeadline: {
    fontFamily: font.display,
    fontSize: 15,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  aiSummary: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
  },
  gapBox: {
    gap: space.xs,
    marginTop: space.xs,
  },
  gapTitle: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  gapRow: {
    paddingVertical: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  gapTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gapNutrient: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  gapStatus: {
    fontFamily: font.figure,
    fontSize: 11,
  },
  gapWhy: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
  },
  foodTagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  foodTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  foodTagText: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  swapRow: {
    padding: space.xs + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
  swapOriginal: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  swapBetter: {
    fontFamily: font.uiStrong,
    fontSize: 12,
  },
  swapBenefit: {
    fontFamily: font.ui,
    fontSize: 11,
  },
  scienceQuote: {
    fontFamily: font.ui,
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: space.xs,
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.sm,
  },
  loadingText: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  errorText: {
    fontFamily: font.ui,
    fontSize: 12,
  },
  listContainer: {
    gap: space.xs + 2,
  },
  microItem: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  microHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  microNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  microName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusText: {
    fontFamily: font.figure,
    fontSize: 9,
    fontWeight: '700',
  },
  microValue: {
    fontFamily: font.figure,
    fontSize: 11,
  },
  microTrack: {
    height: 5,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  microFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  microDesc: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 15,
  },
});
