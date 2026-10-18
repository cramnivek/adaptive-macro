import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cardFileFrom,
  cardFontsReady,
  composeCard,
  drawBackdrop,
  drawOverlay,
  pickCardPhoto,
  shareCardFile,
  shareWorkout,
} from '../platform/shareImage';
import type { ShareCard } from '../shareCard';
import { type CardBlock, type Placement, placementOrigin } from '../shareCardPlacement';
import { blocksFor, TEMPLATES, type TemplateId } from '../shareCardTemplate';
import { subjectOf } from '../platform/depth';
import { useApp } from '../state/AppStore';
import { getEventCopy } from '../copy/personality';

/** The card's own size. The preview is a fraction of it, and the sticker's place is kept as a fraction of both. */
const CARD = { width: 1080, height: 1920 };
import { MAX_CAPTION } from '../social/postPayload';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { CardEditor } from './CardEditor';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';
import { useBlockGesture } from './useBlockGesture';

interface FinishSheetProps {
  /** The finished workout, or null when the sheet is closed. */
  summary: ShareCard | null;
  /** Out of the way while sign-in is open over it, keeping the caption typed so far. */
  hidden: boolean;
  /** Whether posting is possible, and if not, what stands in the way. */
  account: 'unavailable' | 'signed-out' | 'needs-profile' | 'ready';
  /** Lead with POST and an open caption: what this person did last time. */
  postFirst: boolean;
  onPost: (caption: string, card?: { file: File; url: string } | null) => Promise<void>;
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

  const { settings, updateSettings } = useApp();
  const template = settings.cardTemplate;
  // The shape decides what it can hold, so a block left on by one template is
  // simply not drawn by a shape that has nowhere for it. Held still between
  // renders: the drawing effects watch this object, and a fresh one each render
  // would redraw the card for ever.
  const blocks = useMemo(() => blocksFor(template, settings.cardBlocks), [template, settings.cardBlocks]);
  // Over a photo the card becomes a block you put where you like, so where it
  // was put is state, and the picture under it is drawn once rather than on
  // every frame of a drag.
  const [place, setPlace] = useState<Placement>(TEMPLATES[template].place);
  const [dragging, setDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ground, setGround] = useState<string | null>(null);
  const [sticker, setSticker] = useState<{ uri: string; width: number; height: number } | null>(null);
  // The person, cut out of the photograph, so the type can pass behind them.
  const [subject, setSubject] = useState<{ canvas: HTMLCanvasElement; uri: string } | null>(null);
  const [cutting, setCutting] = useState(false);
  const depth = settings.cardDepth;

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
    // A card over a photograph is composed from its two layers, and the layers
    // are what the preview shows, so the file is made from exactly what was on
    // screen. It waits for the drag to end: nobody needs a megabyte of JPEG
    // made sixty times a second.
    if (photo !== null) {
      if (sticker === null || dragging) return;
      let alive = true;
      setDrawing(true);
      void (async () => {
        await cardFontsReady();
        const overlay = drawOverlay(summary, blocks, template);
        return cardFileFrom(composeCard(photo, overlay, place, subject?.canvas ?? null), summary.title, true);
      })()
        .then((drawn) => {
          if (!alive) return;
          if (drawn !== null) setCard(drawn);
          else setNote('The card could not be made with that picture.');
        })
        .catch((error) => alive && setNote(`The card could not be drawn: ${(error as Error).message}`))
        .finally(() => alive && setDrawing(false));
      return () => {
        alive = false;
      };
    }
    let live = true;
    setDrawing(true);
    void shareCardFile(summary, null)
      .then((drawn) => {
        if (!live) return;
        if (drawn !== null) {
          setCard(drawn);
        } else if (photo !== null) {
          // Only a browser that cannot make the file at all gets here, and the
          // old card is still on screen, so without a word it reads as the
          // picture simply having been ignored.
          setNote('The card could not be made with that picture.');
        }
      })
      // Drawing threw rather than failed. It used to be swallowed, which left
      // the card that was already there and nothing to say why — the picture
      // looked as though it had been dropped on the floor. The browser's own
      // words are worth more than mine here, because this is the one failure
      // nobody can reproduce on anybody else's phone.
      .catch((error) => live && setNote(`The card could not be drawn: ${(error as Error).message}`))
      .finally(() => live && setDrawing(false));
    return () => {
      live = false;
    };
  }, [summary, photo, blocks, template, place, dragging, sticker, subject]);

  // The picture, graded once. The preview shows this rather than the raw
  // photograph so that what is on screen while you place the block is what the
  // file will look like.
  useEffect(() => {
    if (photo === null) {
      setGround(null);
      return;
    }
    setGround(drawBackdrop(photo).toDataURL('image/jpeg', 0.8));
    setPlace(TEMPLATES[template].place);
  // A new picture starts the block where its shape starts; changing the shape
  // is handled where that choice is made, so it is not a dependency here.
  }, [photo]);

  // The block itself, redrawn only when what it says changes — never while it
  // is being moved, which is what keeps dragging free.
  useEffect(() => {
    if (summary === null || photo === null) {
      setSticker(null);
      return;
    }
    let live = true;
    void cardFontsReady().then(() => {
      if (!live) return;
      const drawn = drawOverlay(summary, blocks, template);
      setSticker({ uri: drawn.toDataURL(), width: drawn.width, height: drawn.height });
    });
    return () => {
      live = false;
    };
  }, [summary, photo, blocks, template]);

  // The cut-out: asked for once per photograph, and only when depth is on,
  // because the first one fetches the runtime that does it.
  useEffect(() => {
    if (photo === null || !depth) {
      setSubject(null);
      return;
    }
    let live = true;
    setCutting(true);
    void subjectOf(photo, CARD)
      .then((cut) => {
        if (!live) return;
        if (cut === null) {
          // Either there is no one in the picture or the model could not find
          // them. Cutting nothing out would leave the card exactly as it was,
          // so saying so beats a toggle that appears to do nothing.
          setNote('No one to cut out of that picture, so the type stays in front.');
          setSubject(null);
          return;
        }
        setSubject({ canvas: cut, uri: cut.toDataURL() });
      })
      .catch(() => {
        if (!live) return;
        setNote('Depth needs a download that could not be had just now.');
        void updateSettings({ cardDepth: false });
      })
      .finally(() => live && setCutting(false));
    return () => {
      live = false;
    };
  }, [photo, depth]);

  const choosePhoto = async () => {
    if (summary === null) return;
    const picked = await pickCardPhoto();
    if (picked.ok) {
      setNote(null);
      setPicked({ workout: summary, image: picked.image });
      return;
    }
    // Changing your mind is silent. A picture the browser cannot open is not:
    // many phone photographs are HEIC, which plenty of browsers refuse, and
    // without this the tap simply appears to do nothing at all.
    if (picked.why === 'unreadable') {
      setNote('That picture could not be opened. A screenshot of it will work.');
    }
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
      await onPost(caption, card);
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
  /** The preview is the card's own 9:16, so a fraction here means the same there. */
  const frame = { width: (height * 9) / 16, height };

  const { handlers, claim } = useBlockGesture({
    frame,
    card: CARD,
    place,
    sticker,
    onPlace: setPlace,
    onDragging: setDragging,
  });

  const toggleBlock = (block: CardBlock) =>
    void updateSettings({ cardBlocks: { ...settings.cardBlocks, [block]: !blocks[block] } });

  /**
   * A different shape, starting where that shape starts.
   *
   * It keeps whatever you had turned on that the new shape can hold, and falls
   * back to what the shape is for when that would leave it empty — switching to
   * a corner stamp with only the climb on would otherwise draw nothing at all.
   */
  const chooseTemplate = (next: TemplateId) => {
    const shape = TEMPLATES[next];
    const kept = blocksFor(next, settings.cardBlocks);
    const wanted = { ...settings.cardBlocks };
    if (shape.holds.every((block) => !kept[block])) {
      for (const block of shape.holds) wanted[block] = shape.blocks[block];
    }
    setPlace(shape.place);
    void updateSettings({ cardTemplate: next, cardBlocks: wanted });
  };

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
          <Text style={styles.title}>
            {getEventCopy('workout.completed', {
              personality: settings.personality,
              seed: summary?.title ?? 'workout',
            })}
          </Text>
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
            {ground !== null ? (
              /*
                Over a photograph the preview is the two layers themselves
                rather than a picture of them, so moving the block is a
                transform instead of a redraw. What is composed on share is the
                same photo, the same block, the same placement.
              */
              <View
                ref={claim}
                style={[styles.frame, { width: frame.width, height: frame.height }]}
                {...handlers}
                accessibilityLabel="The card that will be shared. Drag to move it, pinch to resize."
              >
                <Image source={{ uri: ground }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                {sticker !== null && (
                  /*
                    Everything here is in the preview's own points. The block is
                    drawn at the card's size, so its place and its size are both
                    taken down by the same fraction — a transform would have
                    scaled the block and left its corner where it was.
                  */
                  <Image
                    source={{ uri: sticker.uri }}
                    style={{
                      position: 'absolute',
                      left: placementOrigin(place, sticker, CARD).left * (frame.width / CARD.width),
                      top: placementOrigin(place, sticker, CARD).top * (frame.height / CARD.height),
                      width: sticker.width * place.scale * (frame.width / CARD.width),
                      height: sticker.height * place.scale * (frame.height / CARD.height),
                    }}
                  />
                )}
                {subject !== null && (
                  /* The person, over the type, exactly as the file will have it. */
                  <Image source={{ uri: subject.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                )}
              </View>
            ) : card ? (
              <Image source={{ uri: card.url }} style={[styles.image, { height }]} resizeMode="contain" accessibilityLabel="The card that will be shared" />
            ) : drawing ? (
              <ActivityIndicator color={loud.loud} />
            ) : null}
          </View>

          {/* Composing happens on its own screen. Here there is room for a
              preview and one way in, and the preview still takes a drag for
              anyone who only wants to nudge it. */}
          {ground !== null && (
            <Tappable onPress={() => setEditing(true)} accessibilityRole="button" style={styles.editAction}>
              <Text style={styles.editLabel}>EDIT CARD · SHAPE, WHAT SHOWS, DEPTH</Text>
            </Tappable>
          )}

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
              placeholder={getEventCopy('social.caption_placeholder', { personality: settings.personality })}
              placeholderTextColor={loud.figureFaint}
              maxLength={MAX_CAPTION}
              multiline
              style={[styles.caption, { color: loud.figure, borderColor: loud.rule, backgroundColor: loud.panel }]}
            />
          )}

          {postLeads && postButton}
          {/* While the card is being made again — which is what happens the
              moment a drag ends — the file in hand is the one from before the
              move, so sharing waits the half second rather than sending it. */}
          <Tappable
            onPress={() => { if (!drawing) void share(); }}
            scaleTo={0.97}
            accessibilityRole="button"
            accessibilityState={{ disabled: drawing }}
            style={[styles.action, drawing && styles.spent]}
          >
            <SlashPanel color={postLeads ? loud.panel : loud.loud} style={styles.button}>
              <Text style={[styles.buttonLabel, { color: postLeads ? loud.figure : loud.onLoud }]}>
                {drawing ? 'SAVING…' : getEventCopy('social.share_btn', { personality: settings.personality })}
              </Text>
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
      {/* Over the sheet, on its own screen, sharing every piece of state with
          it: what you leave the editor with is what gets drawn and posted. */}
      {ground !== null && (
        <CardEditor
          open={editing}
          ground={ground}
          sticker={sticker}
          subject={subject?.uri ?? null}
          place={place}
          onPlace={setPlace}
          onDragging={setDragging}
          template={template}
          onTemplate={chooseTemplate}
          blocks={blocks}
          onBlock={toggleBlock}
          depth={depth}
          cutting={cutting}
          onDepth={() => void updateSettings({ cardDepth: !depth })}
          onReset={() => setPlace(TEMPLATES[template].place)}
          onClose={() => setEditing(false)}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,11,0.9)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: loud.ground,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
    padding: space.lg,
  },
  title: { fontFamily: font.display, fontSize: 20, letterSpacing: 1.4, color: loud.figure },
  subtitle: { fontFamily: font.figure, fontSize: 14, color: loud.figureMuted, marginTop: 4 },
  // A story is 9:16; the preview keeps that shape at a size that leaves the buttons on screen.
  preview: { height: 360, alignItems: 'center', justifyContent: 'center', marginVertical: space.md },
  image: { height: 360, aspectRatio: 9 / 16, borderRadius: radius.md },
  frame: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: loud.ground },
  // The way into the editor. A full touch target, centred, and it says what is
  // behind it: the first person to use the composer asked where the customising
  // was while looking straight at the controls.
  editAction: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginBottom: space.xs },
  editLabel: { fontFamily: font.uiStrong, fontSize: 12, letterSpacing: 1.2, color: loud.loud },
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
