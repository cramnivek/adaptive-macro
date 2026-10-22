import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { Nutrients, UserProfile } from '@adaptive-macros/engine';
import { thud } from '../platform/haptics';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { FadeIn } from './FadeIn';
import { Tappable } from './Tappable';
import StickerDrawerDom from './StickerDrawerDom';
import type { ShareCard } from '../shareCard';
import { ALL_BLOCKS } from '../shareCardPlacement';
import type { TemplateId } from '../shareCardTemplate';
import {
  cardFontsReady,
  copyStickerToClipboard,
  drawNutritionOverlay,
  drawOverlay,
  exportStickerCanvas,
  shareStickerPng,
  type StickerExport,
  type NativeStickerExport,
  type StickerTheme,
} from '../platform/shareImage';

export interface TransparentStickerModalProps {
  visible: boolean;
  onClose: () => void;
  mode?: 'workout' | 'nutrition';
  workoutSummary?: ShareCard | null;
  nutritionData?: {
    consumed: Nutrients;
    profile: UserProfile;
  } | null;
}

export const TransparentStickerModal = ({
  visible,
  onClose,
  mode = 'workout',
  workoutSummary,
  nutritionData,
}: TransparentStickerModalProps) => {
  const insets = useSafeAreaInsets();

  const [theme, setTheme] = useState<StickerTheme>('glass');
  const [template, setTemplate] = useState<TemplateId>('block');
  const blocks = ALL_BLOCKS;
  const [sticker, setSticker] = useState<StickerExport | NativeStickerExport | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [renderAttempt, setRenderAttempt] = useState(0);
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRenderTimer = () => {
    if (renderTimer.current !== null) clearTimeout(renderTimer.current);
    renderTimer.current = null;
  };
  const request = useMemo(() => {
    if (!visible) return null;
    if (mode === 'nutrition') {
      return nutritionData ? { mode, ...nutritionData, theme, template } : null;
    }
    return workoutSummary ? { mode, summary: workoutSummary, theme, template } : null;
  }, [visible, mode, nutritionData, workoutSummary, theme, template]);
  const requestKey = JSON.stringify({ request, renderAttempt });
  const currentRequest = useRef(requestKey);
  currentRequest.current = requestKey;

  // Redraw transparent sticker whenever options change
  useEffect(() => {
    if (!visible) return;
    let alive = true;
    setSticker(null);
    setToast(null);
    setDrawing(request !== null);
    // Phones draw inside the DOM component below, where Canvas and fonts exist.
    if (Platform.OS !== 'web') {
      renderTimer.current = setTimeout(() => {
        setDrawing(false);
        setToast('The sticker renderer took too long to load. Check the development connection and retry.');
      }, 45000);
      return stopRenderTimer;
    }

    void (async () => {
      await cardFontsReady();
      if (mode === 'nutrition' && nutritionData) {
        const canvas = drawNutritionOverlay(nutritionData.consumed, nutritionData.profile, theme);
        return exportStickerCanvas(canvas, 'nutrition-quality');
      } else if (workoutSummary) {
        const canvas = drawOverlay(workoutSummary, blocks, template, theme);
        return exportStickerCanvas(canvas, workoutSummary.title);
      }
      return null;
    })()
      .then((res) => {
        if (!alive) return;
        setSticker(res);
      })
      .catch((err) => {
        console.warn('Failed to draw sticker:', err);
        if (alive) {
          setToast('That sticker could not be drawn.');
        }
      })
      .finally(() => {
        if (alive) setDrawing(false);
      });

    return () => {
      alive = false;
    };
    // Parent screens recreate data objects; identical inputs must not clear an already drawn preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // Replaced previews release their browser object URL; native previews are data URLs.
  useEffect(() => () => {
    if (sticker?.url.startsWith('blob:')) URL.revokeObjectURL(sticker.url);
  }, [sticker]);

  const handleCopy = async () => {
    if (!sticker || drawing || !('blob' in sticker)) return;
    thud('light');
    const success = await copyStickerToClipboard(sticker.blob);
    if (success) {
      thud('heavy');
      setToast('✓ Sticker copied! Switch to Instagram / Stories to paste');
      setTimeout(() => setToast(null), 3800);
    } else {
      // If direct clipboard write is blocked by browser permission, fallback to share/save
      const outcome = await shareStickerPng(
        mode === 'nutrition' ? 'Nutrition Quality' : (workoutSummary?.title ?? 'Ascend Workout'),
        sticker,
      );
      if (outcome === 'downloaded') {
        setToast('✓ Transparent PNG saved to Downloads');
        setTimeout(() => setToast(null), 3800);
      } else if (outcome === 'failed') {
        setToast('That PNG could not be shared; please try again.');
      }
    }
  };

  const handleShare = async () => {
    if (!sticker || drawing) return;
    thud('light');
    const outcome = await shareStickerPng(
      mode === 'nutrition' ? 'Nutrition Quality' : (workoutSummary?.title ?? 'Ascend Workout'),
      sticker,
    );
    if (outcome === 'downloaded') {
      setToast('✓ Transparent PNG saved to Downloads');
      setTimeout(() => setToast(null), 3800);
    } else if (outcome === 'failed') {
      setToast('That PNG could not be shared; please try again.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View
        style={[
          styles.root,
          {
            backgroundColor: loud.ground,
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {Platform.OS !== 'web' && request && (
          <View pointerEvents="none" style={styles.drawer}>
          <StickerDrawerDom
            key={renderAttempt}
            request={request}
            requestKey={requestKey}
            onDrawn={async (drawnKey, result) => {
              // A theme change or closing the sheet can overtake a bridge response.
              if (currentRequest.current !== drawnKey) return;
              stopRenderTimer();
              setSticker(result);
              setDrawing(false);
              if (!result) setToast('That sticker could not be drawn; please reopen the studio to try again.');
            }}
            dom={{
              style: { width: 1, height: 1 },
              containerStyle: { position: 'absolute', width: 1, height: 1 },
              scrollEnabled: false,
              onError: () => {
                if (currentRequest.current !== requestKey) return;
                stopRenderTimer();
                setDrawing(false);
                setToast('That sticker could not be drawn; please reopen the studio to try again.');
              },
            }}
          />
          </View>
        )}
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.badgeRow}>
              <Text style={styles.headerTag}>TRANSPARENT STICKER</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>INSTAGRAM · TIKTOK · SNAP</Text>
              </View>
            </View>
            <Text style={styles.headerTitle}>
              {mode === 'nutrition' ? 'Nutrition Quality Overlay' : 'Workout Story Overlay'}
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close sticker studio"
            style={styles.closeBtn}
          >
            <Ionicons name="close" size={22} color={loud.figure} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Transparency Stage with Checkerboard */}
          <View style={styles.stageCard}>
            <View style={styles.checkerboard}>
              {drawing ? (
                <View style={styles.loaderWrap}>
                  <ActivityIndicator color={loud.loud} size="large" />
                  <Text style={styles.loaderText}>Generating transparent sticker…</Text>
                </View>
              ) : sticker ? (
                <View style={styles.stickerWrap}>
                  <Image
                    source={{ uri: sticker.url }}
                    // Sized from the width and capped in height, never the
                    // other way: a fixed 260 high made a 760-wide sticker
                    // wider than a phone's stage, and both sides were cut off.
                    // `contain` keeps the proportions when the cap applies.
                    style={{
                      width: '100%',
                      maxHeight: 268,
                      aspectRatio: sticker.width / sticker.height,
                    }}
                    resizeMode="contain"
                    accessibilityLabel="Transparent sticker preview"
                  />
                </View>
              ) : null}

              {/* Toast banner overlay */}
              {toast && (
                <FadeIn style={styles.toastWrap}>
                  <View style={styles.toastPill}>
                    <Ionicons name="sparkles" size={16} color={loud.onLoud} />
                    <Text style={styles.toastText}>{toast}</Text>
                  </View>
                </FadeIn>
              )}
              {!drawing && !sticker && (
                <Tappable onPress={() => setRenderAttempt((value) => value + 1)} accessibilityRole="button" style={styles.retry}>
                  <Text style={{ color: loud.figure, fontFamily: font.uiStrong }}>Retry sticker</Text>
                </Tappable>
              )}
            </View>
            <View style={styles.stageFooter}>
              <Ionicons name="checkmark-done" size={14} color={loud.loud} />
              <Text style={styles.stageFooterText}>True alpha transparency (lossless PNG)</Text>
            </View>
          </View>

          {/* Theme Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionHeading}>STICKER STYLE</Text>
            <View style={styles.pillRow}>
              {(
                [
                  { id: 'glass', label: '🪟 Frosted Glass' },
                  { id: 'hud', label: '🎯 Floating HUD' },
                  { id: 'solid', label: '⬛ Stealth Dark' },
                  { id: 'prism', label: '⚡ Prism Glow' },
                ] as const
              ).map((t) => {
                const active = theme === t.id;
                return (
                  <Tappable
                    key={t.id}
                    onPress={() => {
                      thud('light');
                      setTheme(t.id);
                    }}
                    style={[
                      styles.pill,
                      active && styles.pillActive,
                    ]}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {t.label}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
          </View>

          {/* Workout Layout Selector (only for workout mode) */}
          {mode === 'workout' && (
            <View style={styles.section}>
              <Text style={styles.sectionHeading}>LAYOUT FORMAT</Text>
              <View style={styles.pillRow}>
                {(
                  [
                    { id: 'block', label: 'Full Session' },
                    { id: 'bar', label: 'Compact Bar' },
                    { id: 'tag', label: 'Minimal Tag' },
                    { id: 'figure', label: 'Pure Stats' },
                  ] as const
                ).map((tpl) => {
                  const active = template === tpl.id;
                  return (
                    <Tappable
                      key={tpl.id}
                      onPress={() => {
                        thud('light');
                        setTemplate(tpl.id);
                      }}
                      style={[
                        styles.pill,
                        active && styles.pillActive,
                      ]}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>
                        {tpl.label}
                      </Text>
                    </Tappable>
                  );
                })}
              </View>
            </View>
          )}

          {/* How to use tip */}
          <View style={styles.tipBox}>
            <Ionicons name="information-circle-outline" size={18} color={loud.figureMuted} />
            {Platform.OS === 'web' ? (
              <Text style={styles.tipText}>
                Tap <Text style={{ color: loud.figure, fontWeight: '700' }}>Copy Sticker</Text>, open
                Instagram Stories or camera, and tap <Text style={{ color: loud.loud, fontWeight: '700' }}>Paste Sticker</Text> to
                float your stats over any video, gym photo, or post-workout meal.
              </Text>
            ) : (
              <Text style={styles.tipText}>
                Share the transparent PNG to a compatible app, or choose a save option in your phone's
                share sheet. Image clipboard paste is unavailable here; your destination app controls
                how it imports the overlay.
              </Text>
            )}
          </View>

          {/* Primary Action Buttons */}
          <View style={styles.actionsWrap}>
            {Platform.OS === 'web' && (
              <Tappable
                onPress={() => void handleCopy()}
                disabled={drawing || !sticker}
                scaleTo={0.97}
                accessibilityRole="button"
                style={styles.primaryBtnWrap}
              >
                <View style={styles.primaryBtn}>
                  <Ionicons name="copy" size={18} color={loud.onLoud} />
                  <Text style={styles.primaryBtnText}>COPY STICKER TO CLIPBOARD</Text>
                </View>
              </Tappable>
            )}

            <Tappable
              onPress={() => void handleShare()}
              disabled={drawing || !sticker}
              scaleTo={0.97}
              accessibilityRole="button"
              style={styles.secondaryBtnWrap}
            >
              <View style={styles.secondaryBtn}>
                <Ionicons name="share-outline" size={18} color={loud.figure} />
                <Text style={styles.secondaryBtnText}>SAVE / SHARE TRANSPARENT PNG</Text>
              </View>
            </Tappable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  drawer: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  retry: { minHeight: 44, paddingHorizontal: space.md, justifyContent: 'center', alignItems: 'center' },
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: loud.rule,
  },
  headerTitleWrap: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    marginBottom: 2,
  },
  headerTag: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: loud.loud,
  },
  badge: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    fontFamily: font.figure,
    fontSize: 9,
    fontWeight: '700',
    color: loud.loud,
  },
  headerTitle: {
    fontFamily: font.display,
    fontSize: 18,
    letterSpacing: 0.5,
    color: loud.figure,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: space.lg,
    paddingBottom: space.xxl,
  },
  stageCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    marginBottom: space.lg,
  },
  checkerboard: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F1014',
    padding: space.md,
    position: 'relative',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? {
          backgroundImage:
            'linear-gradient(45deg, #181920 25%, transparent 25%), linear-gradient(-45deg, #181920 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #181920 75%), linear-gradient(-45deg, transparent 75%, #181920 75%)',
          // No backgroundPosition: '0 0' is the default already, and
          // react-native-web rejects the two-value form with an error on
          // every load of the app.
          backgroundSize: '24px 24px',
        }
      : {}),
  },
  loaderWrap: {
    alignItems: 'center',
    gap: space.sm,
  },
  loaderText: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
  },
  stickerWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: loud.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: loud.rule,
  },
  stageFooterText: {
    fontFamily: font.figure,
    fontSize: 11,
    color: loud.figureMuted,
  },
  toastWrap: {
    position: 'absolute',
    bottom: space.md,
    left: space.md,
    right: space.md,
    alignItems: 'center',
  },
  toastPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: loud.loud,
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  toastText: {
    fontFamily: font.uiStrong,
    fontSize: 12,
    letterSpacing: 0.5,
    color: loud.onLoud,
  },
  section: {
    marginBottom: space.lg,
  },
  sectionHeading: {
    fontFamily: font.figure,
    fontSize: 11,
    letterSpacing: 1.2,
    fontWeight: '700',
    color: loud.figureMuted,
    marginBottom: space.xs,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  pill: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs + 2,
    borderRadius: radius.pill,
    backgroundColor: loud.panel,
    borderWidth: 1,
    borderColor: loud.rule,
  },
  pillActive: {
    backgroundColor: 'rgba(255, 59, 48, 0.16)',
    borderColor: loud.loud,
  },
  pillText: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.figureMuted,
  },
  pillTextActive: {
    fontFamily: font.uiStrong,
    color: loud.figure,
    fontWeight: '700',
  },
  tipBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    marginBottom: space.xl,
  },
  tipText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 18,
    color: loud.figureMuted,
  },
  actionsWrap: {
    gap: space.sm,
  },
  primaryBtnWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 52,
    backgroundColor: loud.loud,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  primaryBtnText: {
    fontFamily: font.display,
    fontSize: 14,
    letterSpacing: 1.2,
    color: loud.onLoud,
  },
  secondaryBtnWrap: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    minHeight: 48,
    backgroundColor: loud.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
  },
  secondaryBtnText: {
    fontFamily: font.display,
    fontSize: 13,
    letterSpacing: 1,
    color: loud.figure,
  },
});
