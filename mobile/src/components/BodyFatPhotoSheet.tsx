import { Ionicons } from '@expo/vector-icons';
import { todayISO } from '@adaptive-macros/engine';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { MealPhoto } from '../ai/describeMeal';
import { type BodyFatPhotoResult, estimateBodyFatFromPhotos } from '../ai/bodyFatPhoto';
import { chooseMealPhoto } from '../ai/mealPhoto';
import { logBodyMeasurement } from '../db';
import { notify } from '../dialog';
import { thud } from '../platform/haptics';
import { useApp } from '../state/AppStore';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

interface BodyFatPhotoSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** A tape or typed figure already logged, which a photo read should not pretend to beat. */
  betterFigure: { pct: number; source: 'entered' | 'tape' } | null;
}

type Shot = 'front' | 'side';

const TIPS = [
  { icon: 'shirt-outline', text: 'Shirt off, or a sports bra' },
  { icon: 'scan-outline', text: 'Shoulders to waistband in frame' },
  { icon: 'sunny-outline', text: 'Even light, standing relaxed' },
] as const;

/**
 * Body fat from two photos, as a flow of its own.
 *
 * It used to be a link inside the measurements form, under the body-fat box,
 * where people scrolled straight past it. Here the two photos are the whole
 * screen: a tile each, one button, and the result large enough to read.
 *
 * The photos live only in this component's state. They are dropped when the
 * estimate comes back and when the sheet closes, which is what the privacy
 * line promises.
 */
export const BodyFatPhotoSheet = ({ open, onClose, onSaved, betterFigure }: BodyFatPhotoSheetProps) => {
  const { settings, latest } = useApp();
  const [photos, setPhotos] = useState<Record<Shot, MealPhoto | null>>({ front: null, side: null });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<BodyFatPhotoResult, { usable: true }> | null>(null);

  const close = () => {
    setPhotos({ front: null, side: null });
    setResult(null);
    setProblem(null);
    onClose();
  };

  // One picker per tile: on phones it offers the camera and the library
  // together, which is fewer decisions than a button for each.
  const pick = async (shot: Shot) => {
    setProblem(null);
    try {
      const photo = await chooseMealPhoto();
      if (photo) setPhotos((current) => ({ ...current, [shot]: photo }));
    } catch (e) {
      setProblem((e as Error).message || 'Could not read that photo. If it is HEIC, try a screenshot of it.');
    }
  };

  const ready = photos.front !== null && photos.side !== null;

  const estimate = async () => {
    if (!photos.front || !photos.side) return;
    setBusy(true);
    setProblem(null);
    try {
      const { sex, age, heightCm } = settings.profile;
      const reply = await estimateBodyFatFromPhotos(
        photos.front,
        photos.side,
        { sex, age, heightCm, weightKg: latest?.trendWeightKg ?? null },
        settings.foodLookup.geminiApiKey,
      );
      if (reply.usable) {
        setResult(reply);
        setPhotos({ front: null, side: null });
      } else {
        // The photos stay so the person can replace just the one at fault.
        setProblem(reply.reason);
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const midpoint = result ? Math.round(((result.lowPct + result.highPct) / 2) * 10) / 10 : null;

  const save = async () => {
    if (!result || midpoint === null) return;
    try {
      thud('light');
      await logBodyMeasurement({
        date: todayISO(),
        bodyFatPct: midpoint,
        bodyFatSource: 'photo',
        notes: `Body fat is a visual estimate from photos (${result.lowPct}–${result.highPct}%).`,
      });
      onSaved();
      close();
    } catch (e) {
      notify('Could not save', (e as Error).message);
    }
  };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>BODY FAT FROM PHOTOS</Text>
              <Text style={styles.subtitle}>Two mirror selfies, read in about ten seconds.</Text>
            </View>
            <Tappable onPress={close} scaleTo={0.9} style={styles.closeBtn} accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={loud.figureMuted} />
            </Tappable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {result ? (
              <>
                <View style={styles.resultHero}>
                  <Text style={styles.resultLabel}>ESTIMATED BODY FAT</Text>
                  <Text style={styles.resultFigure}>
                    {result.lowPct}–{result.highPct}%
                  </Text>
                </View>
                <View style={styles.basis}>
                  {result.basis.map((line) => (
                    <View key={line} style={styles.basisRow}>
                      <View style={styles.dot} />
                      <Text style={styles.basisText}>{line}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.caveat}>
                  A visual estimate, less reliable than a tape or a scan.
                  {betterFigure
                    ? ` Your logged ${betterFigure.pct.toFixed(1)}% (${betterFigure.source === 'tape' ? 'from a tape' : 'typed in'}) stays the figure the app uses.`
                    : ' If you have had a DXA scan, compare it against that.'}
                </Text>
                <Tappable onPress={() => void save()} scaleTo={0.97} style={styles.primary}>
                  <Text style={styles.primaryText}>SAVE {midpoint}%</Text>
                </Tappable>
                <Tappable onPress={() => setResult(null)} scaleTo={0.97} style={styles.secondary}>
                  <Text style={styles.secondaryText}>RETAKE</Text>
                </Tappable>
              </>
            ) : (
              <>
                <View style={styles.tiles}>
                  {(['front', 'side'] as const).map((shot) => {
                    const photo = photos[shot];
                    const label = shot === 'front' ? 'FRONT' : 'SIDE';
                    return (
                      <Tappable
                        key={shot}
                        onPress={() => void pick(shot)}
                        scaleTo={0.97}
                        style={[styles.tile, photo ? styles.tileFilled : null]}
                        accessibilityLabel={photo ? `Change ${shot} photo` : `Add ${shot} photo`}
                      >
                        {photo ? (
                          <>
                            <Image
                              source={{ uri: `data:${photo.mimeType};base64,${photo.base64}` }}
                              style={StyleSheet.absoluteFill}
                              resizeMode="cover"
                            />
                            <View style={styles.tileTag}>
                              <Text style={styles.tileTagText}>{label} · CHANGE</Text>
                            </View>
                          </>
                        ) : (
                          <>
                            <Ionicons
                              name={shot === 'front' ? 'body-outline' : 'walk-outline'}
                              size={34}
                              color={loud.figureMuted}
                            />
                            <Text style={styles.tileLabel}>{label}</Text>
                            <Text style={styles.tileHint}>Tap to add</Text>
                          </>
                        )}
                      </Tappable>
                    );
                  })}
                </View>

                <View style={styles.tips}>
                  {TIPS.map((tip) => (
                    <View key={tip.text} style={styles.tipRow}>
                      <Ionicons name={tip.icon} size={16} color={loud.figureMuted} />
                      <Text style={styles.tipText}>{tip.text}</Text>
                    </View>
                  ))}
                </View>

                {problem && (
                  <View style={styles.problem}>
                    <Ionicons name="alert-circle-outline" size={18} color={loud.loud} />
                    <Text style={styles.problemText}>{problem}</Text>
                  </View>
                )}

                <Tappable
                  onPress={() => void estimate()}
                  scaleTo={0.97}
                  disabled={!ready || busy}
                  style={[styles.primary, !ready && styles.primaryIdle]}
                >
                  {busy ? (
                    <View style={styles.busyRow}>
                      <ActivityIndicator color={loud.onLoud} />
                      <Text style={styles.primaryText}>READING PHOTOS…</Text>
                    </View>
                  ) : (
                    <Text style={[styles.primaryText, !ready && styles.primaryTextIdle]}>
                      {ready ? 'ESTIMATE BODY FAT' : 'ADD BOTH PHOTOS'}
                    </Text>
                  )}
                </Tappable>

                <View style={styles.privacy}>
                  <Ionicons name="lock-closed-outline" size={13} color={loud.figureFaint} />
                  <Text style={styles.privacyText}>
                    Not saved. Sent once to Google’s Gemini to be read, then dropped from the app.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: loud.panel,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: loud.rule,
    paddingTop: space.lg,
    paddingBottom: Platform.OS === 'ios' ? 36 : space.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontFamily: font.display,
    fontSize: 16,
    fontWeight: '800',
    color: loud.figure,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
    marginTop: 2,
  },
  closeBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: loud.ground,
  },
  body: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  tiles: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tile: {
    flex: 1,
    aspectRatio: 3 / 4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: loud.rule,
    backgroundColor: loud.ground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  tileFilled: {
    borderStyle: 'solid',
    borderColor: loud.loud,
  },
  tileLabel: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: '800',
    color: loud.figure,
    letterSpacing: 1,
    marginTop: space.xs,
  },
  tileHint: {
    fontFamily: font.ui,
    fontSize: 12,
    color: loud.figureMuted,
  },
  tileTag: {
    position: 'absolute',
    left: space.xs,
    right: space.xs,
    bottom: space.xs,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
  },
  tileTagText: {
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  tips: {
    gap: space.sm,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  tipText: {
    fontFamily: font.ui,
    fontSize: 13,
    color: loud.figure,
  },
  problem: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.loud,
    backgroundColor: loud.ground,
  },
  problemText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 18,
    color: loud.figure,
  },
  primary: {
    minHeight: TOUCH_TARGET + 6,
    borderRadius: radius.lg,
    backgroundColor: loud.loud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIdle: {
    backgroundColor: loud.ground,
    borderWidth: 1,
    borderColor: loud.rule,
  },
  primaryText: {
    fontFamily: font.display,
    fontSize: 13,
    fontWeight: '800',
    color: loud.onLoud,
    letterSpacing: 1,
  },
  primaryTextIdle: {
    color: loud.figureMuted,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  secondary: {
    minHeight: TOUCH_TARGET,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: loud.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontFamily: font.display,
    fontSize: 12,
    fontWeight: '800',
    color: loud.figure,
    letterSpacing: 1,
  },
  privacy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  privacyText: {
    flexShrink: 1,
    fontFamily: font.ui,
    fontSize: 11,
    color: loud.figureFaint,
    textAlign: 'center',
  },
  resultHero: {
    alignItems: 'center',
    paddingVertical: space.md,
  },
  resultLabel: {
    fontFamily: font.figure,
    fontSize: 11,
    fontWeight: '700',
    color: loud.figureMuted,
    letterSpacing: 1,
  },
  resultFigure: {
    fontFamily: font.display,
    fontSize: 44,
    fontWeight: '800',
    color: loud.figure,
    marginTop: 4,
  },
  basis: {
    gap: space.sm,
  },
  basisRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: loud.loud,
    marginTop: 7,
  },
  basisText: {
    flex: 1,
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
    color: loud.figure,
  },
  caveat: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figureMuted,
  },
});
