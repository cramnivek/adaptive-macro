import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  type Micronutrients,
  MICRONUTRIENT_KEYS,
  getClinicalRda,
} from '@adaptive-macros/engine';
import { useApp } from '../state/AppStore';
import { font, radius, space, useTheme } from '../theme';

export interface FoodMicronutrientsViewProps {
  micros?: Micronutrients;
  sex?: 'male' | 'female';
  collapsible?: boolean;
  defaultExpanded?: boolean;
  title?: string;
  style?: StyleProp<ViewStyle>;
}

type CategoryTab = 'all' | 'vitamins' | 'minerals' | 'lipids';

export const FoodMicronutrientsView = ({
  micros,
  sex,
  collapsible = true,
  defaultExpanded = true,
  title = 'Micronutrients',
  style,
}: FoodMicronutrientsViewProps) => {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [tab, setTab] = useState<CategoryTab>('all');

  // From the profile unless a caller says otherwise. The log and edit sheets
  // never passed it, so everyone there was measured against the men's targets.
  const { settings } = useApp();
  const profileSex = sex ?? settings.profile.sex;
  const age = settings.profile.age;
  const rdaMap = useMemo(() => getClinicalRda(profileSex, age), [profileSex, age]);

  const activeKeys = useMemo(() => {
    if (!micros) return [];
    return MICRONUTRIENT_KEYS.filter((key) => {
      const val = micros[key];
      return typeof val === 'number' && Number.isFinite(val) && val > 0;
    });
  }, [micros]);

  const vitaminsCount = useMemo(
    () => activeKeys.filter((k) => rdaMap[k]?.category === 'vitamins').length,
    [activeKeys, rdaMap],
  );

  const mineralsCount = useMemo(
    () => activeKeys.filter((k) => rdaMap[k]?.category === 'minerals').length,
    [activeKeys, rdaMap],
  );

  const lipidsCount = useMemo(
    () => activeKeys.filter((k) => rdaMap[k]?.category === 'lipids').length,
    [activeKeys, rdaMap],
  );

  const filteredKeys = useMemo(() => {
    if (tab === 'all') return activeKeys;
    return activeKeys.filter((k) => rdaMap[k]?.category === tab);
  }, [activeKeys, tab, rdaMap]);

  if (activeKeys.length === 0) {
    return (
      <View
        style={[
          styles.emptyBox,
          { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          style,
        ]}
      >
        <Ionicons name="nutrition-outline" size={16} color={colors.textFaint} />
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No micronutrient breakdown recorded for this food.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPress={collapsible ? () => setExpanded((prev) => !prev) : undefined}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${activeKeys.length} nutrients`}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Ionicons name="nutrition" size={14} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <View style={[styles.badge, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>
              {activeKeys.length} {activeKeys.length === 1 ? 'nutrient' : 'nutrients'}
            </Text>
          </View>
        </View>

        {collapsible && (
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.textMuted}
          />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {activeKeys.length > 3 && (
            <View style={styles.tabRow}>
              <Pressable
                onPress={() => setTab('all')}
                style={[
                  styles.tabChip,
                  {
                    backgroundColor: tab === 'all' ? colors.accent : colors.surfaceRaised,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabChipText,
                    { color: tab === 'all' ? colors.onFill : colors.text },
                  ]}
                >
                  All ({activeKeys.length})
                </Text>
              </Pressable>

              {vitaminsCount > 0 && (
                <Pressable
                  onPress={() => setTab('vitamins')}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: tab === 'vitamins' ? colors.accent : colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      { color: tab === 'vitamins' ? colors.onFill : colors.text },
                    ]}
                  >
                    Vitamins ({vitaminsCount})
                  </Text>
                </Pressable>
              )}

              {mineralsCount > 0 && (
                <Pressable
                  onPress={() => setTab('minerals')}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: tab === 'minerals' ? colors.accent : colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      { color: tab === 'minerals' ? colors.onFill : colors.text },
                    ]}
                  >
                    Minerals ({mineralsCount})
                  </Text>
                </Pressable>
              )}

              {lipidsCount > 0 && (
                <Pressable
                  onPress={() => setTab('lipids')}
                  style={[
                    styles.tabChip,
                    {
                      backgroundColor: tab === 'lipids' ? colors.accent : colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      { color: tab === 'lipids' ? colors.onFill : colors.text },
                    ]}
                  >
                    Lipids & Sugars ({lipidsCount})
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <View style={styles.grid}>
            {filteredKeys.map((key) => {
              const target = rdaMap[key];
              const val = micros?.[key] ?? 0;
              const hasRda = target && target.rda > 0;
              const pct = hasRda ? (val / target.rda) * 100 : 0;
              const formattedVal = val < 1 && val > 0 ? val.toFixed(1) : Math.round(val);

              return (
                <View
                  key={key}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.surfaceRaised,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
                      {target?.name ?? key}
                    </Text>
                    <Text style={[styles.cardVal, { color: colors.text }]}>
                      {formattedVal}{' '}
                      <Text style={[styles.cardUnit, { color: colors.textMuted }]}>
                        {target?.unit ?? ''}
                      </Text>
                    </Text>
                  </View>

                  {hasRda ? (
                    <View style={styles.rdaContainer}>
                      <View style={[styles.barBg, { backgroundColor: colors.surface }]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${Math.min(100, Math.round(pct))}%`,
                              backgroundColor: pct >= 100 ? colors.positive : colors.accent,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.rdaText,
                          { color: pct >= 100 ? colors.positive : colors.textFaint },
                        ]}
                      >
                        {Math.round(pct)}% RDA
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.categorySubtitle, { color: colors.textFaint }]}>
                      {target?.category === 'lipids' ? 'Lipid / Sugar' : 'Reference intake'}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: space.sm,
  },
  emptyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginVertical: space.sm,
  },
  emptyText: {
    fontFamily: font.ui,
    fontSize: 12,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
    marginBottom: space.xs,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '600',
  },
  body: {
    marginTop: space.xs,
    gap: space.sm,
  },
  tabRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    marginBottom: space.xs,
  },
  tabChip: {
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tabChipText: {
    fontFamily: font.ui,
    fontSize: 11,
    fontWeight: '600',
  },
  grid: {
    gap: space.xs,
  },
  card: {
    padding: space.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardName: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    flex: 1,
    marginRight: space.sm,
  },
  cardVal: {
    fontFamily: font.figure,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  cardUnit: {
    fontFamily: font.ui,
    fontSize: 11,
    fontWeight: 'normal',
  },
  rdaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  barBg: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  rdaText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  categorySubtitle: {
    fontFamily: font.ui,
    fontSize: 10,
  },
});
