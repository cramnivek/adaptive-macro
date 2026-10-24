import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AccessibilityInfo, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CheckInRecapMetrics } from '../checkInRecap';
import { buildCheckInRecap } from '../checkInRecap';
import { formatDateLong } from '../format';
import type { UnitSystem } from '../state/settings';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { BrandLockup } from './BrandLockup';
import { FadeIn } from './FadeIn';

interface CheckInRecapProps {
  metrics: CheckInRecapMetrics;
  units: UnitSystem;
  mode: 'weekly' | 'monthly';
  showModeSwitch: boolean;
  longDays: number;
  longName: 'Monthly' | 'Quarterly';
  nextStep: string;
  weightReadings?: readonly { date: string; kg: number }[];
  onModeChange: (mode: 'weekly' | 'monthly') => void;
  onSummary: () => void;
  onClose: () => void;
}

export const CheckInRecap = ({
  metrics,
  units,
  mode,
  showModeSwitch,
  longDays,
  longName,
  nextStep,
  weightReadings,
  onModeChange,
  onSummary,
  onClose,
}: CheckInRecapProps) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [index, setIndex] = useState(0);
  const recap = buildCheckInRecap(metrics, units, nextStep, weightReadings);
  const chapter = recap.chapters[index];
  const last = index === recap.chapters.length - 1;
  const announcement = `Chapter ${index + 1} of ${recap.chapters.length}. ${chapter.title}. ${chapter.value}. ${chapter.label}. ${chapter.detail}`;
  useEffect(() => {
    if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(announcement);
  }, [announcement]);

  const move = (direction: -1 | 1) => {
    if (direction === 1 && last) {
      onSummary();
      return;
    }
    setIndex((current) => Math.max(0, Math.min(recap.chapters.length - 1, current + direction)));
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.md }]}>
      <View style={styles.top}>
        <View style={styles.topLabel}>
          <BrandLockup markColor={loud.loud} textColor={loud.figure} size={24} />
          <Text style={styles.period}>CHECK-IN RECAP</Text>
          <Text style={styles.periodRange}>
            {formatDateLong(metrics.period.from)} – {formatDateLong(metrics.period.to)}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Close check-in recap"
        >
          <Ionicons name="close" size={23} color={loud.figure} />
        </Pressable>
      </View>

      {showModeSwitch && (
        <View style={styles.modeSwitch}>
          <Pressable
            onPress={() => onModeChange('weekly')}
            style={[styles.modeButton, mode === 'weekly' && { backgroundColor: colors.brand.fill }]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'weekly' }}
          >
            <Text style={[styles.modeText, mode === 'weekly' && { color: colors.brand.onFill }]}>WEEKLY · 7D</Text>
          </Pressable>
          <Pressable
            onPress={() => onModeChange('monthly')}
            style={[styles.modeButton, mode === 'monthly' && { backgroundColor: colors.brand.fill }]}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'monthly' }}
          >
            <Text style={[styles.modeText, mode === 'monthly' && { color: colors.brand.onFill }]}>
              {`${longName.toUpperCase()} · ${longDays}D`}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.progress} accessibilityLabel={`Chapter ${index + 1} of ${recap.chapters.length}`}>
        {recap.chapters.map((item, position) => (
          <View
            key={item.kind}
            style={[styles.segment, { backgroundColor: position <= index ? loud.loud : loud.rule }]}
          />
        ))}
      </View>
      {/* The web announcement API is a no-op; keep this live region mounted
          while Next/Back change its text and retain keyboard focus. */}
      {Platform.OS === 'web' && <Text accessibilityLiveRegion="polite" aria-atomic style={styles.announcement}>{announcement}</Text>}

      <ScrollView
        key={chapter.kind}
        style={styles.story}
        contentContainerStyle={styles.storyContent}
        showsVerticalScrollIndicator={false}
        alwaysBounceVertical={false}
      >
        <FadeIn style={styles.chapter}>
          <Text style={styles.chapterNumber}>0{index + 1} / 05</Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
          <Text style={[styles.figure, chapter.kind === 'next' && styles.recommendation]}>
            {chapter.value}
          </Text>
          <Text style={styles.figureLabel}>{chapter.label}</Text>
          <View style={styles.rule} />
          <Text style={styles.detail}>{chapter.detail}</Text>
        </FadeIn>
      </ScrollView>

      <View style={styles.actions}>
        <Pressable
          onPress={onSummary}
          style={styles.skip}
          accessibilityRole="button"
          accessibilityLabel="Skip to summary"
        >
          <Text style={styles.skipText}>SKIP TO SUMMARY</Text>
          <Ionicons name="arrow-forward" size={17} color={loud.figure} />
        </Pressable>
        <View style={styles.navigation}>
          <Pressable
            onPress={() => move(-1)}
            disabled={index === 0}
            style={[styles.navButton, index === 0 && styles.navDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Previous chapter"
          >
            <Ionicons name="arrow-back" size={18} color={loud.figure} />
            <Text style={styles.navText}>BACK</Text>
          </Pressable>
          <Pressable
            onPress={() => move(1)}
            style={[styles.navButton, styles.nextButton]}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Continue to summary' : 'Next chapter'}
          >
            <Text style={[styles.navText, styles.nextText]}>{last ? 'SUMMARY' : 'NEXT'}</Text>
            <Ionicons name={last ? 'checkmark' : 'arrow-forward'} size={18} color={loud.onLoud} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  announcement: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  screen: {
    flex: 1,
    backgroundColor: loud.ground,
    paddingHorizontal: space.lg,
  },
  top: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topLabel: {
    flex: 1,
    minWidth: 0,
    paddingRight: space.sm,
    gap: 2,
  },
  period: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    color: loud.figureMuted,
    letterSpacing: 1.2,
  },
  periodRange: {
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureMuted,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
  },
  modeSwitch: {
    flexDirection: 'row',
    padding: 3,
    gap: space.xs,
    marginTop: space.xs,
    borderRadius: radius.md,
    backgroundColor: loud.panel,
  },
  modeButton: {
    minHeight: 44,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  modeText: {
    fontFamily: font.uiStrong,
    color: loud.figureMuted,
    fontSize: 11,
    letterSpacing: 0.5,
  },
  progress: {
    flexDirection: 'row',
    gap: space.xs,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  segment: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
  },
  story: {
    flex: 1,
  },
  storyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingVertical: space.xl,
  },
  chapter: {
    alignItems: 'flex-start',
    width: '100%',
  },
  chapterNumber: {
    fontFamily: font.figure,
    color: loud.loud,
    fontSize: 13,
    letterSpacing: 1.4,
    marginBottom: space.md,
  },
  chapterTitle: {
    fontFamily: font.display,
    color: loud.figure,
    fontSize: 43,
    lineHeight: 48,
    letterSpacing: -1.8,
    marginBottom: space.xl,
  },
  figure: {
    width: '100%',
    fontFamily: font.display,
    color: loud.figure,
    fontSize: 76,
    lineHeight: 82,
    letterSpacing: -3,
  },
  figureLabel: {
    fontFamily: font.uiStrong,
    color: loud.figureMuted,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 1.1,
    marginTop: space.sm,
  },
  recommendation: { fontSize: 32, lineHeight: 38, letterSpacing: -0.8 },
  rule: {
    width: 52,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: loud.loud,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  detail: {
    maxWidth: 540,
    fontFamily: font.ui,
    color: loud.figure,
    fontSize: 18,
    lineHeight: 27,
  },
  actions: {
    gap: space.sm,
    paddingTop: space.sm,
  },
  skip: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  skipText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 1,
    color: loud.figure,
  },
  navigation: {
    flexDirection: 'row',
    gap: space.sm,
  },
  navButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.rule,
    backgroundColor: loud.panel,
  },
  navDisabled: {
    opacity: 0.45,
  },
  nextButton: {
    backgroundColor: loud.loud,
    borderColor: loud.loud,
  },
  navText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 1,
    color: loud.figure,
  },
  nextText: {
    color: loud.onLoud,
  },
});
