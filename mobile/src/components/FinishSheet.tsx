import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pickCardPhoto, shareCardFile, shareWorkout } from '../platform/shareImage';
import type { ShareCard } from '../shareCard';
import { MAX_CAPTION } from '../social/postPayload';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface FinishSheetProps {
  /** The finished workout, or null when the sheet is closed. */
  summary: ShareCard | null;
  /** Out of the way while sign-in is open over it, keeping the caption typed so far. */
  hidden: boolean;
  /** Whether posting is possible, and if not, what stands in the way. */
  account: 'unavailable' | 'signed-out' | 'needs-profile' | 'ready';
  /** Lead with POST and an open caption: what this person did last time. */
  postFirst: boolean;
  onPost: (caption: string) => Promise<void>;
  onNeedAccount: () => void;
  onDone: (posted: boolean) => void;
  /** Opens the save-as-routine sheet. Omit to hide the button. */
  onSaveAsRoutine?: () => void;
  /** The routine was saved from this workout. */
  routineSaved?: boolean;
}

/**
 * Workout done: the card, and a way to post it.
 *
 * Shown as the workout is saved, which is the one moment anyone wants to
 * share it. The card is drawn as the sheet opens, as its own preview: what
 * you see is what gets sent, and it is ready before the tap, which is the only
 * moment a browser will open the share sheet.
 */
export const FinishSheet = ({ summary, hidden, account, postFirst, onPost, onNeedAccount, onDone, onSaveAsRoutine, routineSaved = false }: FinishSheetProps) => {
  const insets = useSafeAreaInsets();
  const [card, setCard] = useState<{ file: File; url: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [writing, setWriting] = useState(postFirst);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  // The picked picture, held against the workout it was picked for, so the next
  // workout starts on the dark card rather than on someone else's photo.
  const [picked, setPicked] = useState<{ workout: ShareCard; image: HTMLImageElement } | null>(null);
  const photo = picked !== null && picked.workout === summary ? picked.image : null;

  useEffect(() => {
    if (summary === null) return;
    setNote(null);
    setCaption('');
    setPosted(false);
    setWriting(postFirst);
  // `postFirst` is read once per finished workout: posting flips the setting while the sheet is
  // still open, and that must not snap the caption shut.
  }, [summary]);

  useEffect(() => {
    if (summary === null) return;
    let live = true;
    setDrawing(true);
    void shareCardFile(summary, photo)
      .then((drawn) => live && setCard(drawn))
      .finally(() => live && setDrawing(false));
    return () => {
      live = false;
    };
  }, [summary, photo]);

  const choosePhoto = async () => {
    if (summary === null) return;
    const image = await pickCardPhoto();
    if (image) setPicked({ workout: summary, image });
  };

  const share = async () => {
    if (summary === null) return;
    const outcome = await shareWorkout(summary, card);
    if (outcome === 'downloaded') setNote('Saved to your downloads.');
  };

  const post = async () => {
    if (account === 'signed-out' || account === 'needs-profile') {
      onNeedAccount();
      return;
    }
    // Someone who does not usually post sees the caption only once they ask to.
    if (!writing) {
      setWriting(true);
      return;
    }
    setPosting(true);
    setNote(null);
    try {
      await onPost(caption);
      setPosted(true);
    } catch (error) {
      setNote((error as Error).message);
    } finally {
      setPosting(false);
    }
  };

  // A post already on its way lands whether or not the sheet stays, so leaving now would record
  // "did not post" for it and could switch the setting off.
  const leave = () => {
    if (!posting) onDone(posted);
  };

  const postLeads = account !== 'unavailable' && writing;
  const height = writing ? 240 : 360;

  const postButton = account === 'unavailable' ? null : (
    <Tappable
      onPress={() => { if (!posting && !posted) void post(); }}
      scaleTo={0.97}
      accessibilityRole="button"
      accessibilityState={{ disabled: posting || posted }}
      style={[styles.action, (posting || posted) && styles.spent]}
    >
      <SlashPanel color={postLeads ? loud.loud : loud.panel} style={styles.button}>
        <Text style={[styles.buttonLabel, { color: postLeads ? loud.onLoud : loud.figure }]}>
          {posted ? 'POSTED' : posting ? 'POSTING…' : 'POST'}
        </Text>
      </SlashPanel>
    </Tappable>
  );

  return (
    <Modal visible={summary !== null && !hidden} animationType="slide" transparent onRequestClose={leave}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + space.lg }]}>
          <Text style={styles.title}>WORKOUT DONE</Text>
          {summary && (
            <Text style={styles.subtitle}>
              {[
                summary.duration,
                summary.sets > 0 ? `${summary.sets} ${summary.sets === 1 ? 'set' : 'sets'}` : null,
                summary.volume,
                summary.cardioDistanceKm && summary.cardioDistanceKm > 0
                  ? `${summary.cardioDistanceKm.toFixed(1)} km`
                  : null,
                summary.steps && summary.steps > 0
                  ? `~${summary.steps.toLocaleString()} steps`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}

          <View style={[styles.preview, { height }]}>
            {card ? (
              <Image source={{ uri: card.url }} style={[styles.image, { height }]} resizeMode="contain" accessibilityLabel="The card that will be shared" />
            ) : drawing ? (
              <ActivityIndicator color={loud.loud} />
            ) : null}
          </View>

          {/* A card is only ever drawn on the web, which is also the only place a photo can be picked. */}
          {card !== null && (
            <View style={styles.photoRow}>
              <Tappable onPress={() => void choosePhoto()} accessibilityRole="button" style={styles.photoAction}>
                <Text style={styles.photoLabel}>{photo ? 'CHANGE PHOTO' : 'ADD A PHOTO'}</Text>
              </Tappable>
              {photo !== null && (
                <Tappable onPress={() => setPicked(null)} accessibilityRole="button" style={styles.photoAction}>
                  <Text style={styles.photoLabel}>REMOVE</Text>
                </Tappable>
              )}
            </View>
          )}

          {account !== 'unavailable' && writing && !posted && (
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Say something about it (optional)"
              placeholderTextColor={loud.figureFaint}
              maxLength={MAX_CAPTION}
              multiline
              style={[styles.caption, { color: loud.figure, borderColor: loud.rule, backgroundColor: loud.panel }]}
            />
          )}

          {postLeads && postButton}
          <Tappable onPress={() => void share()} scaleTo={0.97} style={styles.action}>
            <SlashPanel color={postLeads ? loud.panel : loud.loud} style={styles.button}>
              <Text style={[styles.buttonLabel, { color: postLeads ? loud.figure : loud.onLoud }]}>SHARE</Text>
            </SlashPanel>
          </Tappable>
          {!postLeads && postButton}
          {note && <Text style={styles.note}>{note}</Text>}
          {onSaveAsRoutine && (
            <Tappable
              onPress={() => { if (!routineSaved) onSaveAsRoutine(); }}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityState={{ disabled: routineSaved }}
              style={[styles.action, routineSaved && styles.spent]}
            >
              <SlashPanel color={loud.panel} style={styles.button}>
                <Text style={[styles.buttonLabel, { color: loud.figure }]}>
                  {routineSaved ? 'ROUTINE SAVED' : 'SAVE AS ROUTINE'}
                </Text>
              </SlashPanel>
            </Tappable>
          )}
          <Tappable onPress={leave} scaleTo={0.97} style={styles.action}>
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
  photoRow: { flexDirection: 'row', justifyContent: 'center', gap: space.md, marginBottom: space.xs },
  // Small type, but a full touch target: hitSlop is ignored on the web.
  photoAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.md },
  photoLabel: { fontFamily: font.uiStrong, fontSize: 12, letterSpacing: 1.2, color: loud.figureMuted },
  caption: { minHeight: 64, maxHeight: 120, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: space.sm, fontFamily: font.ui, fontSize: 14, textAlignVertical: 'top', marginBottom: space.sm },
  action: { marginTop: space.sm },
  spent: { opacity: 0.6 },
  button: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  buttonLabel: { fontFamily: font.display, fontSize: 14, letterSpacing: 1.6 },
  note: { fontFamily: font.ui, fontSize: 12, color: loud.figureMuted, textAlign: 'center', marginTop: space.xs },
});
