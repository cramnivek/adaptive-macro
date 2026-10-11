import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shareCardFile, shareWorkout } from '../platform/shareImage';
import type { ShareSummary } from '../shareCard';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface FinishSheetProps {
  /** The finished workout, or null when the sheet is closed. */
  summary: ShareSummary | null;
  onDone: () => void;
}

/**
 * Workout done: the card, and a way to post it.
 *
 * Shown as the workout is saved, which is the one moment anyone wants to
 * share it. The card is drawn as the sheet opens, as its own preview: what
 * you see is what gets sent, and it is ready before the tap, which is the only
 * moment a browser will open the share sheet.
 */
export const FinishSheet = ({ summary, onDone }: FinishSheetProps) => {
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (summary === null) return;
    let live = true;
    setDrawing(true);
    setNote(null);
    void shareCardFile(summary)
      .then((drawn) => live && setCard(drawn))
      .finally(() => live && setDrawing(false));
    return () => {
      live = false;
    };
  }, [summary]);

  const share = async () => {
    if (summary === null) return;
    const outcome = await shareWorkout(summary, card);
    if (outcome === 'downloaded') setNote('Saved to your downloads.');
  };

  return (
    <Modal visible={summary !== null} animationType="slide" transparent onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title}>WORKOUT DONE</Text>
          {summary && (
            <Text style={styles.subtitle}>
              {summary.duration} · {summary.sets} {summary.sets === 1 ? 'set' : 'sets'}{summary.volume ? ` · ${summary.volume}` : ''}
            </Text>
          )}

          <View style={styles.preview}>
            {card ? (
              <Image source={{ uri: card.url }} style={styles.image} resizeMode="contain" accessibilityLabel="The card that will be shared" />
            ) : drawing ? (
              <ActivityIndicator color={loud.loud} />
            ) : null}
          </View>

          <Tappable onPress={() => void share()} scaleTo={0.97} style={styles.action}>
            <SlashPanel color={loud.loud} style={styles.button}>
              <Text style={[styles.buttonLabel, { color: loud.onLoud }]}>SHARE</Text>
            </SlashPanel>
          </Tappable>
          {note && <Text style={styles.note}>{note}</Text>}
          <Tappable onPress={onDone} scaleTo={0.97} style={styles.action}>
            <SlashPanel color={loud.panel} style={styles.button}>
              <Text style={[styles.buttonLabel, { color: loud.figure }]}>DONE</Text>
            </SlashPanel>
          </Tappable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,11,0.9)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 20, letterSpacing: 1.4, color: loud.figure },
  subtitle: { fontFamily: font.figure, fontSize: 14, color: loud.figureMuted, marginTop: 4 },
  // A story is 9:16; the preview keeps that shape at a size that leaves the buttons on screen.
  preview: { height: 360, alignItems: 'center', justifyContent: 'center', marginVertical: space.md },
  image: { height: 360, aspectRatio: 9 / 16, borderRadius: radius.md },
  action: { marginTop: space.sm },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: font.display, fontSize: 14, letterSpacing: 1.6 },
  note: { fontFamily: font.ui, fontSize: 12, color: loud.figureMuted, textAlign: 'center', marginTop: space.xs },
});
