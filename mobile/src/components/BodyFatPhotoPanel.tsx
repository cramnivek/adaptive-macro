import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import type { MealPhoto } from '../ai/describeMeal';
import { type BodyFatPhotoResult, estimateBodyFatFromPhotos } from '../ai/bodyFatPhoto';
import { captureWithSystemCamera, chooseMealPhoto } from '../ai/mealPhoto';
import { useApp } from '../state/AppStore';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

interface BodyFatPhotoPanelProps {
  /** The tape estimate when the sheet has one, which is usually the closer figure. */
  tapeEstimate: string | null;
  onUse: (pct: number, lowPct: number, highPct: number) => void;
}

type Shot = 'front' | 'side';

/**
 * The photo route to a body-fat figure, closed until asked for.
 *
 * It says before any camera opens what happens to the photos, because that is
 * the question someone has before photographing their body, not after. The
 * photos live only in this component's state and are dropped as soon as the
 * estimate comes back.
 */
export const BodyFatPhotoPanel = ({ tapeEstimate, onUse }: BodyFatPhotoPanelProps) => {
  const { settings, latest } = useApp();
  const [open, setOpen] = useState(false);
  const [photos, setPhotos] = useState<Record<Shot, MealPhoto | null>>({ front: null, side: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BodyFatPhotoResult | null>(null);

  const take = async (shot: Shot, from: 'camera' | 'library') => {
    setError(null);
    try {
      const photo = from === 'camera' ? await captureWithSystemCamera() : await chooseMealPhoto();
      if (photo) setPhotos((current) => ({ ...current, [shot]: photo }));
    } catch (e) {
      // HEIC is the usual cause on phones, and the picker's own error does not say so.
      setError((e as Error).message || 'Could not read that photo. If it is HEIC, try a screenshot of it.');
    }
  };

  const estimate = async () => {
    if (!photos.front || !photos.side) return;
    setBusy(true);
    setError(null);
    try {
      const { sex, age, heightCm } = settings.profile;
      const reply = await estimateBodyFatFromPhotos(
        photos.front,
        photos.side,
        { sex, age, heightCm, weightKg: latest?.trendWeightKg ?? null },
        settings.foodLookup.geminiApiKey,
      );
      setResult(reply);
      setPhotos({ front: null, side: null });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setPhotos({ front: null, side: null });
  };

  if (!open) {
    return (
      <Tappable onPress={() => setOpen(true)} scaleTo={0.97} style={styles.opener}>
        <Text style={styles.openerText}>NO FIGURE? ESTIMATE FROM PHOTOS</Text>
      </Tappable>
    );
  }

  const midpoint = result?.usable ? Math.round(((result.lowPct + result.highPct) / 2) * 10) / 10 : null;

  return (
    <View style={styles.panel}>
      {result?.usable ? (
        <>
          <Text style={styles.figure}>
            Looks like {result.lowPct}–{result.highPct}% body fat
          </Text>
          {result.basis.map((line) => (
            <Text key={line} style={styles.note}>
              · {line}
            </Text>
          ))}
          <Text style={styles.note}>
            A visual estimate, less reliable than a tape or a scan.
            {tapeEstimate ? ` Your tape estimate of ${tapeEstimate}% is usually closer.` : ''} If you have had a
            DXA scan, compare it against that.
          </Text>
          <View style={styles.buttons}>
            <Tappable onPress={() => onUse(midpoint!, result.lowPct, result.highPct)} scaleTo={0.95} style={styles.button}>
              <Text style={styles.buttonText}>USE {midpoint}%</Text>
            </Tappable>
            <Tappable onPress={reset} scaleTo={0.95} style={styles.button}>
              <Text style={styles.buttonText}>RETAKE</Text>
            </Tappable>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.note}>
            Take one photo from the front and one from the side, in underwear or swimwear, standing relaxed in
            even light, shoulders to knees in frame. Bodies store fat in different places, so the more of yours
            the photos show, the better the read. Ascend does not keep them: they are sent once to Google’s
            Gemini to be read, then dropped from the app.
          </Text>
          {result && !result.usable && <Text style={styles.warning}>{result.reason}</Text>}
          {(['front', 'side'] as const).map((shot) => (
            <View key={shot} style={styles.slot}>
              {photos[shot] ? (
                <Image
                  source={{ uri: `data:${photos[shot]!.mimeType};base64,${photos[shot]!.base64}` }}
                  style={styles.thumb}
                  accessibilityLabel={`${shot} photo taken`}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <Text style={styles.slotLabel}>{shot === 'front' ? 'FRONT' : 'SIDE'}</Text>
              <Tappable onPress={() => void take(shot, 'camera')} scaleTo={0.95} style={styles.button}>
                <Text style={styles.buttonText}>CAMERA</Text>
              </Tappable>
              <Tappable onPress={() => void take(shot, 'library')} scaleTo={0.95} style={styles.button}>
                <Text style={styles.buttonText}>PHOTOS</Text>
              </Tappable>
            </View>
          ))}
          {error && <Text style={styles.warning}>{error}</Text>}
          <Tappable
            onPress={() => void estimate()}
            scaleTo={0.97}
            disabled={busy || !photos.front || !photos.side}
            style={[styles.button, styles.wide, (!photos.front || !photos.side) && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color={loud.loud} />
            ) : (
              <Text style={styles.buttonText}>ESTIMATE</Text>
            )}
          </Tappable>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  opener: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
  openerText: {
    fontFamily: font.display,
    fontSize: 11,
    fontWeight: '800',
    color: loud.loud,
    letterSpacing: 1,
  },
  panel: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.rule,
    backgroundColor: loud.ground,
  },
  figure: {
    fontFamily: font.figure,
    fontSize: 14,
    fontWeight: '700',
    color: loud.figure,
  },
  note: {
    fontFamily: font.ui,
    fontSize: 11,
    lineHeight: 16,
    color: loud.figureMuted,
  },
  warning: {
    fontFamily: font.ui,
    fontSize: 12,
    lineHeight: 17,
    color: loud.figure,
  },
  slot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  slotLabel: {
    flex: 1,
    fontFamily: font.figure,
    fontSize: 10,
    fontWeight: '700',
    color: loud.figureMuted,
    letterSpacing: 0.8,
  },
  thumb: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: radius.sm,
  },
  thumbEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: loud.rule,
  },
  buttons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  button: {
    minHeight: TOUCH_TARGET,
    minWidth: TOUCH_TARGET,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: loud.loud,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: font.display,
    fontSize: 12,
    fontWeight: '800',
    color: loud.loud,
    letterSpacing: 1,
  },
  wide: {
    width: '100%',
  },
  disabled: {
    opacity: 0.4,
  },
});
