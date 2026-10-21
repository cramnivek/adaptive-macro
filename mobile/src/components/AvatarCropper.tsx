import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, PanResponder, StyleSheet, Text, View } from 'react-native';
import { clampOffset, cropRect, drawnSize, MAX_ZOOM, MIN_ZOOM, type CropState } from '../social/avatarCrop';
import { cropAvatar } from '../social/avatars';
import { font, radius, space, useTheme } from '../theme';
import { Button, TOUCH_TARGET } from './Controls';
import { Tappable } from './Tappable';

/** The square, in points: as wide as a phone sheet comfortably allows. */
const VIEW = 260;
const ZOOM_STEP = 0.25;

/**
 * Choosing which part of a photo is the profile picture.
 *
 * Drag to move it, − and + to zoom; the circle shows exactly what avatars draw,
 * and the square around it what is saved. Buttons rather than a pinch for the
 * zoom, because a two-finger gesture is unreliable in a phone browser, where
 * most people use the app, and a 44-point button is not.
 */
export const AvatarCropper = ({
  photo,
  onDone,
  onCancel,
}: {
  photo: { uri: string; width: number; height: number };
  onDone: (avatarUrl: string) => void;
  onCancel: () => void;
}) => {
  const { colors } = useTheme();
  const [state, setState] = useState<CropState>({ zoom: MIN_ZOOM, offset: { x: 0, y: 0 } });
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Where the drag started, so each move is measured from there rather than accumulating rounding.
  const start = useRef({ x: 0, y: 0 });
  const stateRef = useRef(state);
  stateRef.current = state;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          start.current = stateRef.current.offset;
        },
        onPanResponderMove: (_, g) => {
          setState((s) => ({
            ...s,
            offset: clampOffset(photo, VIEW, s.zoom, { x: start.current.x + g.dx, y: start.current.y + g.dy }),
          }));
        },
      }),
    [photo],
  );

  const zoomBy = (step: number) =>
    setState((s) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, s.zoom + step));
      // Zooming out can leave the old offset past the edge; it is pulled back in.
      return { zoom, offset: clampOffset(photo, VIEW, zoom, s.offset) };
    });

  const size = drawnSize(photo, VIEW, state.zoom);

  const save = async () => {
    setSaving(true);
    setProblem(null);
    try {
      onDone(await cropAvatar(photo.uri, cropRect(photo, VIEW, state)));
    } catch {
      setProblem('That photo could not be cropped. Try another one.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>Drag to move it. Zoom with − and +.</Text>
      <View style={[styles.view, { backgroundColor: colors.surfaceRaised }]} {...pan.panHandlers}>
        {/* The drag is the square's; the image must not start a browser image drag. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image
            source={{ uri: photo.uri }}
            style={{
              position: 'absolute',
              width: size.width,
              height: size.height,
              left: (VIEW - size.width) / 2 + state.offset.x,
              top: (VIEW - size.height) / 2 + state.offset.y,
            }}
          />
        </View>
        {/* The circle avatars are drawn in, with the corners dimmed around it. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.ring]} />
      </View>

      <View style={styles.zoomRow}>
        <Tappable
          onPress={() => zoomBy(-ZOOM_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Zoom out"
          style={[styles.zoomBtn, { backgroundColor: colors.surfaceRaised, opacity: state.zoom <= MIN_ZOOM ? 0.4 : 1 }]}
        >
          <Ionicons name="remove" size={20} color={colors.text} />
        </Tappable>
        <Text style={[styles.zoomLabel, { color: colors.textMuted }]}>{state.zoom.toFixed(2).replace(/\.?0+$/, '')}×</Text>
        <Tappable
          onPress={() => zoomBy(ZOOM_STEP)}
          accessibilityRole="button"
          accessibilityLabel="Zoom in"
          style={[styles.zoomBtn, { backgroundColor: colors.surfaceRaised, opacity: state.zoom >= MAX_ZOOM ? 0.4 : 1 }]}
        >
          <Ionicons name="add" size={20} color={colors.text} />
        </Tappable>
      </View>

      {problem && <Text style={[styles.hint, { color: colors.danger }]}>{problem}</Text>}
      {saving ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Button label="Use this photo" onPress={() => void save()} />
          <Button label="Pick another" variant="subtle" onPress={onCancel} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: space.md },
  hint: { fontFamily: font.ui, fontSize: 13, textAlign: 'center' },
  view: {
    width: VIEW,
    height: VIEW,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radius.md,
    // Without this the browser scrolls the sheet instead of dragging the photo.
    touchAction: 'none',
  } as object,
  ring: {
    borderRadius: VIEW / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    // A wide shadow outside the circle darkens the corners that will be cut.
    boxShadow: '0 0 0 400px rgba(0,0,0,0.45)',
  } as object,
  zoomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.lg },
  zoomBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    borderRadius: TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomLabel: { fontFamily: font.figure, fontSize: 14, minWidth: 48, textAlign: 'center' },
});
