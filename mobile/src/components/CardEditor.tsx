import { useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type CardBlock, type CardBlocks, type Placement, placementOrigin } from '../shareCardPlacement';
import { type CardTemplate, TEMPLATE_IDS, TEMPLATES, type TemplateId } from '../shareCardTemplate';
import { font, radius, space } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';
import { useBlockGesture } from './useBlockGesture';

/** The card's own size. Everything here is a fraction of it. */
const CARD = { width: 1080, height: 1920 };

interface CardEditorProps {
  open: boolean;
  /** The graded photograph, as the file will have it. */
  ground: string;
  /** The block, drawn at the card's size, or null while it is being drawn. */
  sticker: { uri: string; width: number; height: number } | null;
  /** The person cut out of the photograph, when depth is on. */
  subject: string | null;
  place: Placement;
  onPlace: (place: Placement) => void;
  onDragging: (down: boolean) => void;
  template: TemplateId;
  onTemplate: (template: TemplateId) => void;
  blocks: CardBlocks;
  onBlock: (block: CardBlock) => void;
  depth: boolean;
  cutting: boolean;
  onDepth: () => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * The card, as big as the screen will give, and everything that changes it.
 *
 * The finish sheet shows the card between a caption box and four buttons,
 * which is enough to see it but not enough to compose on: the first person to
 * use it said the editing was "very limited to the box". So the composing
 * happens here, on its own screen, where the picture is the screen and the
 * controls are underneath it.
 *
 * It holds no state of its own. The placement, the blocks and the template all
 * live on the finish sheet, which is what draws the file — this screen is a
 * bigger pair of hands on the same card.
 */
export const CardEditor = ({
  open,
  ground,
  sticker,
  subject,
  place,
  onPlace,
  onDragging,
  template,
  onTemplate,
  blocks,
  onBlock,
  depth,
  cutting,
  onDepth,
  onReset,
  onClose,
}: CardEditorProps) => {
  const insets = useSafeAreaInsets();
  // What the card actually has, rather than what is left after arithmetic. The
  // first version subtracted a guess at the controls from the window and was
  // wrong by the height of the title bar, which pushed the whole screen up and
  // cut the heading off. The stage says how much room it has and the card
  // takes that.
  const [room, setRoom] = useState({ width: 0, height: 0 });

  // The card keeps its 9:16: on a narrow stage the width gives out first, on a
  // tall one the height does, so both are tried and the smaller wins.
  const frame =
    room.width / room.height > 9 / 16
      ? { width: (room.height * 9) / 16, height: room.height }
      : { width: room.width, height: (room.width * 16) / 9 };

  const { handlers, claim } = useBlockGesture({
    frame,
    card: CARD,
    place,
    sticker,
    onPlace,
    onDragging,
  });

  const chosen: CardTemplate = TEMPLATES[template];

  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} transparent={false}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Text style={styles.title}>THE CARD</Text>
          <Tappable onPress={onClose} accessibilityRole="button" style={styles.done}>
            <SlashPanel color={loud.loud} style={styles.doneSlab}>
              <Text style={[styles.doneLabel, { color: loud.onLoud }]}>DONE</Text>
            </SlashPanel>
          </Tappable>
        </View>

        <View
          style={styles.stage}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setRoom({ width, height });
          }}
        >
          <View
            ref={claim}
            style={[styles.frame, { width: frame.width, height: frame.height }]}
            {...handlers}
            accessibilityLabel="The card. Drag to move the block, pinch to resize it."
          >
            <Image source={{ uri: ground }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {sticker !== null && (
              /*
                In the frame's own points: the block is drawn at the card's size,
                so its place and its size are both taken down by the same
                fraction. A transform would have scaled the block and left its
                corner where it was.
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
              <Image source={{ uri: subject }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            )}
          </View>
        </View>

        <View style={styles.controls}>
          <Text style={styles.heading}>SHAPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.row}>
            {TEMPLATE_IDS.map((id) => (
              <Tappable
                key={id}
                onPress={() => onTemplate(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: id === template }}
                style={[styles.chip, id === template && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, { color: id === template ? loud.ground : loud.figureMuted }]}>
                  {TEMPLATES[id].name}
                </Text>
              </Tappable>
            ))}
          </ScrollView>
          <Text style={styles.about}>{chosen.about}</Text>

          <Text style={styles.heading}>WHAT SHOWS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.row}>
            {/* Only the blocks this shape can draw: a corner stamp has nowhere
                to put the climb, and offering it would be a switch that does
                nothing. */}
            {chosen.holds.map((block) => (
              <Tappable
                key={block}
                onPress={() => onBlock(block)}
                accessibilityRole="button"
                accessibilityState={{ selected: blocks[block] }}
                style={[styles.chip, blocks[block] && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, { color: blocks[block] ? loud.ground : loud.figureMuted }]}>
                  {block.toUpperCase()}
                </Text>
              </Tappable>
            ))}
            <Tappable
              onPress={onDepth}
              accessibilityRole="button"
              accessibilityState={{ selected: depth, busy: cutting }}
              style={[styles.chip, depth && styles.chipOn]}
            >
              <Text style={[styles.chipLabel, { color: depth ? loud.ground : loud.figureMuted }]}>
                {cutting ? 'CUTTING…' : 'DEPTH'}
              </Text>
            </Tappable>
            <Tappable onPress={onReset} accessibilityRole="button" style={styles.chip}>
              <Text style={[styles.chipLabel, { color: loud.figureMuted }]}>RESET</Text>
            </Tappable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: loud.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  title: { fontFamily: font.display, fontSize: 18, letterSpacing: 1.4, color: loud.figure },
  done: { minHeight: 44, justifyContent: 'center' },
  doneSlab: { paddingHorizontal: space.xl, paddingVertical: space.sm },
  doneLabel: { fontFamily: font.uiStrong, fontSize: 14, letterSpacing: 1.6 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#000' },
  controls: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  // A horizontal row in a column stretches to the height it is given unless it
  // is told not to, and a chip stretched to two hundred points is an egg.
  strip: { flexGrow: 0 },
  heading: {
    fontFamily: font.uiStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    color: loud.figureFaint,
    marginBottom: space.xs,
  },
  row: { flexDirection: 'row', gap: space.xs, paddingRight: space.lg },
  about: { fontFamily: font.ui, fontSize: 12, color: loud.figureMuted, marginTop: space.xs, marginBottom: space.md },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: loud.rule,
  },
  chipOn: { backgroundColor: loud.figure, borderColor: loud.figure },
  chipLabel: { fontFamily: font.uiStrong, fontSize: 12, letterSpacing: 0.6 },
});
