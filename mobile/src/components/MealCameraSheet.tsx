import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, View } from 'react-native';
import type { EstimatedItem, MealEstimate, MealPhoto } from '../ai/describeMeal';
import { font, radius, space, useTheme } from '../theme';
import { Button } from './Controls';

interface MealCameraSheetProps {
  visible: boolean;
  /** The shot being judged, or null while the camera is live. */
  photo: MealPhoto | null;
  estimate: MealEstimate | null;
  busy: boolean;
  elapsed: number;
  onCapture: (uri: string) => void;
  onRetake: () => void;
  onClose: () => void;
}

/**
 * The camera, and the estimate drawn on the shot it took.
 *
 * A one-shot camera makes a bad frame expensive: the OS camera closes, the
 * estimate appears somewhere else, and getting it right means walking the whole
 * path again. Keeping the camera here means a retake costs nothing.
 *
 * It owns no estimate state. The describe screen holds the photo and the
 * estimate and passes them down, so there is one copy of both and nothing has
 * to be handed between screens when this closes.
 *
 * The assumption text is deliberately not on the overlay. "Assumed a single ube
 * shooter cup (approx. 60g)" is what makes a number honest, it does not fit
 * over a camera image, and a truncated version would be worse than leaving it
 * one tap away. The confidence chip *is* here, because a figure printed on a
 * photograph reads as a measurement and something has to say otherwise.
 */
export const MealCameraSheet = ({
  visible,
  photo,
  estimate,
  busy,
  elapsed,
  onCapture,
  onRetake,
  onClose,
}: MealCameraSheetProps) => {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  /**
   * Whether the camera has actually produced a frame.
   *
   * Mounting the view is not the same as having a stream. Until one arrives,
   * `takePictureAsync` throws ERR_CAMERA_NOT_READY — which, left alone, is a
   * shutter that does nothing and says nothing.
   */
  const [ready, setReady] = useState(false);
  const [shotError, setShotError] = useState<string | null>(null);
  // The shutter can be tapped again before the picture resolves, and two
  // captures would race to become the photo.
  const shooting = useRef(false);

  const confidenceColor = (confidence: EstimatedItem['confidence']) =>
    confidence === 'high' ? colors.positive : confidence === 'medium' ? colors.warning : colors.danger;

  const shoot = async () => {
    if (shooting.current) return;
    shooting.current = true;
    setShotError(null);
    try {
      const shot = await camera.current?.takePictureAsync({ quality: 1 });
      // The URI, never the base64: on web both carry a data: prefix, and
      // reading base64 straight off a capture puts that prefix in the request.
      if (shot?.uri) onCapture(shot.uri);
    } catch {
      // The thrown message names an HTMLVideoElement, which tells the user
      // nothing they can act on.
      setShotError('The camera did not give a picture. Try again, or close this and choose a photo.');
    } finally {
      shooting.current = false;
    }
  };

  const items = estimate?.items ?? [];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {!permission?.granted ? (
          <View style={styles.centre}>
            <Text style={[styles.message, { color: colors.text }]}>Camera access is off</Text>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Allow it to photograph a meal, or close this and describe it in words instead.
            </Text>
            <Button label="Allow the camera" onPress={() => void requestPermission()} />
            <Button label="Close" variant="subtle" onPress={onClose} />
          </View>
        ) : (
          <>
            {photo ? (
              // The still replaces the preview the moment the shutter fires, so
              // the frame being judged is visibly the frame that was sent.
              <Image
                source={{ uri: `data:${photo.mimeType};base64,${photo.base64}` }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
            ) : (
              <CameraView
                ref={camera}
                style={StyleSheet.absoluteFill}
                facing="back"
                // Without this the browser picks a focus distance once and keeps
                // it, so a plate held at arm's length stays soft. On web this
                // maps to a focusMode: 'continuous' track constraint.
                autofocus="on"
                onCameraReady={() => setReady(true)}
              />
            )}

            <View style={styles.overlay} pointerEvents="box-none">
              <View style={styles.top}>
                <Button label="Close" variant="subtle" onPress={onClose} />
              </View>

              <View
                style={[
                  styles.panel,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              >
                {!photo && (
                  <>
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      {ready
                        ? 'Fill the frame with the plate. A fork or a hand nearby helps it judge the portion.'
                        : 'Starting the camera…'}
                    </Text>
                    {shotError && (
                      <Text style={[styles.hint, { color: colors.danger }]}>{shotError}</Text>
                    )}
                    <Button
                      label="Take the photo"
                      disabled={!ready}
                      onPress={() => void shoot()}
                    />
                  </>
                )}

                {photo && busy && (
                  <>
                    <ActivityIndicator color={colors.accent} />
                    <Text style={[styles.hint, { color: colors.textMuted }]}>
                      Estimating… {elapsed}s
                    </Text>
                  </>
                )}

                {photo && !busy && items.length > 0 && (
                  <>
                    {items.map((item) => (
                      <View key={`${item.name}:${item.grams}`} style={styles.row}>
                        <Text style={[styles.itemName, { color: colors.text }]} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[styles.figure, { color: colors.textMuted }]}>
                          {Math.round(item.grams)} g · {Math.round(item.kcal)} kcal
                        </Text>
                        <View
                          style={[styles.badge, { borderColor: confidenceColor(item.confidence) }]}
                        >
                          <Text
                            style={[styles.badgeText, { color: confidenceColor(item.confidence) }]}
                          >
                            {item.confidence}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <Text style={[styles.hint, { color: colors.textFaint }]}>
                      What it assumed, and the portions, are on the screen behind this.
                    </Text>
                  </>
                )}

                {photo && !busy && items.length === 0 && (
                  <Text style={[styles.hint, { color: colors.textMuted }]}>
                    Nothing it could read as food. Try again with the plate filling the frame.
                  </Text>
                )}

                {photo && (
                  <View style={styles.actions}>
                    <View style={{ flex: 1 }}>
                      <Button label="Shoot again" variant="subtle" onPress={onRetake} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button label="Use this" onPress={onClose} />
                    </View>
                  </View>
                )}
              </View>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
  overlay: { flex: 1, justifyContent: 'space-between', padding: space.lg },
  top: { alignSelf: 'flex-start' },
  panel: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.lg,
    gap: space.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  itemName: { flex: 1, fontFamily: font.uiStrong, fontSize: 14 },
  figure: { fontFamily: font.figure, fontSize: 12 },
  badge: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  badgeText: { fontFamily: font.ui, fontSize: 11 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.xs },
  message: { fontFamily: font.uiStrong, fontSize: 16, textAlign: 'center' },
  hint: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
