import type { Food, Meal } from '@adaptive-macros/engine';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { thud } from '../src/platform/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { lookupBarcode } from '../src/api/openfoodfacts';
import { Button } from '../src/components/Controls';
import { LogFoodSheet } from '../src/components/LogFoodSheet';
import { findFoodByBarcode } from '../src/db';
import { WebBarcodeCamera } from '../src/platform/WebBarcodeCamera';
import type { Rect } from '../src/platform/scanGeometry';
import { useApp } from '../src/state/AppStore';
import { font, radius, space, useTheme } from '../src/theme';

/** Formats used on food packaging; QR and the rest are ignored deliberately. */
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

type Status =
  | { kind: 'scanning' }
  | { kind: 'looking-up' }
  | { kind: 'not-found'; code: string }
  | { kind: 'camera-problem'; message: string };

export default function ScanScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ meal?: string }>();
  const meal = (params.meal as Meal) ?? 'snack';

  const { logFood } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<Status>({ kind: 'scanning' });
  const [found, setFound] = useState<Food | null>(null);
  // Where the box is drawn, so the web camera decodes what is under it.
  const [box, setBox] = useState<Rect | null>(null);

  // The camera fires this continuously while a barcode is in frame. Without a
  // latch, one scan would trigger dozens of lookups for the same product.
  const busy = useRef(false);

  const handleScan = useCallback(async (code: string) => {
    if (busy.current) return;
    busy.current = true;
    setStatus({ kind: 'looking-up' });
    thud('light');

    try {
      // The local cache is checked first: a food you have scanned before should
      // log instantly and work with no signal at all.
      const cached = await findFoodByBarcode(code);
      const food = cached ?? (await lookupBarcode(code));

      if (food) {
        setFound(food);
        setStatus({ kind: 'scanning' });
      } else {
        setStatus({ kind: 'not-found', code });
      }
    } catch {
      setStatus({ kind: 'not-found', code });
    }
  }, []);

  const resume = () => {
    busy.current = false;
    setFound(null);
    setStatus({ kind: 'scanning' });
  };

  if (!permission) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centre, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.text }]}>
          Camera access is needed to scan barcodes.
        </Text>
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          Nothing is uploaded — the barcode is looked up against Open Food Facts and the result is cached on
          this device.
        </Text>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
        <View style={{ height: space.sm }} />
        <Button label="Search by name instead" variant="subtle" onPress={() => router.replace({ pathname: '/search', params: { meal } })} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {Platform.OS === 'web' ? (
        <WebBarcodeCamera
          box={box}
          paused={status.kind !== 'scanning' || found !== null}
          onScan={(code) => void handleScan(code)}
          onProblem={(message) => setStatus({ kind: 'camera-problem', message })}
        />
      ) : (
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={
            status.kind === 'scanning' && !found
              ? (result) => void handleScan(result.data)
              : undefined
          }
        />
      )}

      <View style={styles.overlay} pointerEvents="box-none">
        <View
          style={[styles.reticle, { borderColor: colors.accent }]}
          onLayout={(e) => setBox(e.nativeEvent.layout)}
        />

        <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {status.kind === 'looking-up' && (
            <>
              <ActivityIndicator color={colors.accent} />
              <Text style={[styles.hint, { color: colors.textMuted }]}>Looking up product…</Text>
            </>
          )}

          {status.kind === 'not-found' && (
            <>
              <Text style={[styles.message, { color: colors.text }]}>Barcode {status.code} not found</Text>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                Open Food Facts has no usable nutrition data for this product. Copy the label in once
                and this barcode will find it next time.
              </Text>
              {/* The label is in the person's hand, so copying it in once fixes
                  this packet for good: the food is saved under the barcode,
                  and a scan checks this device before Open Food Facts. */}
              <Button
                label="Enter it from the label"
                onPress={() => router.replace({ pathname: '/food-new', params: { meal, barcode: status.code } })}
              />
              <View style={{ height: space.sm }} />
              <Button label="Scan again" variant="subtle" onPress={resume} />
              <Button
                label="Search by name"
                variant="subtle"
                onPress={() => router.replace({ pathname: '/search', params: { meal } })}
              />
            </>
          )}

          {status.kind === 'camera-problem' && (
            <>
              <Text style={[styles.message, { color: colors.text }]}>{status.message}</Text>
              <Button
                label="Search by name"
                variant="subtle"
                onPress={() => router.replace({ pathname: '/search', params: { meal } })}
              />
            </>
          )}

          {status.kind === 'scanning' && !found && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              Fit the barcode inside the box, about a hand's length away. Closer than that and the
              camera cannot focus.
            </Text>
          )}
        </View>
      </View>

      <LogFoodSheet
        food={found}
        defaultMeal={meal}
        onCancel={resume}
        onConfirm={(food, grams, chosenMeal) => {
          void logFood(food, grams, chosenMeal).then(() => router.back());
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: space.xl, gap: space.sm },
  overlay: { flex: 1, justifyContent: 'space-between', padding: space.lg },
  reticle: {
    alignSelf: 'center',
    marginTop: '30%',
    width: '78%',
    aspectRatio: 1.6,
    borderWidth: 2,
    borderRadius: radius.xl,
  },
  panel: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: space.lg, gap: space.sm },
  message: { fontFamily: font.uiStrong, fontSize: 16, textAlign: 'center' },
  hint: { fontFamily: font.ui, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
