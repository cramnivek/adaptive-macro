import { Asset } from 'expo-asset';
import { createElement, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
// The decoder itself, bundled with the app as a file Metro copies (wasm is in
// metro.config.js's assetExts). Pinned to the version barcode-detector expects.
import readerWasm from 'zxing-wasm/reader/zxing_reader.wasm';
import { cameraProblem, frameRegionUnder, lacksAutofocus, scanZoom, type LensCapabilities, type Rect } from './scanGeometry';

/**
 * The barcode camera for the web build.
 *
 * expo-camera's web view asks the browser for "a camera" and nothing more, and
 * phones answer that with a 640×480 stream. Stretched across a phone screen it
 * looks out of focus however still the hand, and barcode bars that soft only
 * read with the phone so close the lens cannot focus at all. It offers no way
 * to ask for more, so the scan screen draws its own: a high-resolution back
 * camera with continuous focus, zoomed where that helps, decoding only what is
 * under the box.
 */

/** BarcodeDetector's names for the formats on food packaging. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
/** Often enough to feel instant, and leaves the phone time to draw the preview. */
const SCAN_EVERY_MS = 120;
/** The decoder gains nothing from more pixels than this across the box. */
const MAX_DECODE_WIDTH = 1280;

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/**
 * The browser's own detector where it has one that reads these formats
 * (Chrome on Android), otherwise the same decoder compiled to WebAssembly
 * (Safari, Firefox). The WebAssembly comes from this app's own server, not
 * the jsDelivr copy the ponyfill fetches by default: one less outside service
 * the scanner depends on, and the browser caches it with the rest of the app.
 */
const makeDetector = async (): Promise<Detector> => {
  const Native = (globalThis as { BarcodeDetector?: any }).BarcodeDetector;
  if (Native?.getSupportedFormats) {
    const supported: string[] = await Native.getSupportedFormats().catch(() => []);
    if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: FORMATS });
  }
  const { BarcodeDetector, setZXingModuleOverrides } = await import('barcode-detector/ponyfill');
  const wasmUrl = Asset.fromModule(readerWasm as unknown as number | string).uri;
  setZXingModuleOverrides({
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
  });
  return new BarcodeDetector({ formats: FORMATS as any });
};

const openStream = (deviceId?: string): Promise<MediaStream> =>
  navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }),
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

const capabilitiesOf = (track: MediaStreamTrack): LensCapabilities =>
  (typeof track.getCapabilities === 'function' ? track.getCapabilities() : {}) as LensCapabilities;

/**
 * The back camera, but not one that cannot focus. Lenses are only tried
 * further when the first one says it has no autofocus, so most phones open
 * one camera and stop.
 */
const openBackCamera = async (): Promise<MediaStream> => {
  const first = await openStream();
  if (!lacksAutofocus(capabilitiesOf(first.getVideoTracks()[0]))) return first;

  const current = first.getVideoTracks()[0]?.getSettings().deviceId;
  const others = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) => d.kind === 'videoinput' && d.deviceId !== current && !/front|user|face/i.test(d.label),
  );
  for (const device of others) {
    const candidate = await openStream(device.deviceId).catch(() => null);
    if (!candidate) continue;
    if (!lacksAutofocus(capabilitiesOf(candidate.getVideoTracks()[0]))) {
      first.getTracks().forEach((t) => t.stop());
      return candidate;
    }
    candidate.getTracks().forEach((t) => t.stop());
  }
  // Nothing better; a blurry lens still reads a large, steady barcode.
  return first;
};

const tune = async (track: MediaStreamTrack) => {
  const caps = capabilitiesOf(track);
  const advanced: Record<string, unknown>[] = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  const zoom = scanZoom(caps);
  if (zoom !== null) advanced.push({ zoom });
  // Each on its own, so a browser refusing one still gets the other.
  for (const constraint of advanced) {
    await track.applyConstraints({ advanced: [constraint] } as MediaTrackConstraints).catch(() => undefined);
  }
};

export const WebBarcodeCamera = ({
  box,
  paused,
  onScan,
  onProblem,
}: {
  /** The on-screen box, in the same coordinates as the camera view. */
  box: Rect | null;
  paused: boolean;
  onScan: (code: string) => void;
  /** One sentence when the camera or the decoder cannot start. */
  onProblem: (message: string) => void;
}) => {
  const video = useRef<HTMLVideoElement | null>(null);
  const detector = useRef<Detector | null>(null);
  // Read inside the loop, which outlives any one render.
  const latest = useRef({ box, paused, onScan });
  latest.current = { box, paused, onScan };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const scan = async () => {
      const el = video.current;
      const { box: area, paused: idle } = latest.current;
      if (!idle && el && detector.current && context && el.readyState >= el.HAVE_ENOUGH_DATA && el.videoWidth) {
        const region = area
          ? frameRegionUnder(area, { width: el.clientWidth, height: el.clientHeight }, { width: el.videoWidth, height: el.videoHeight })
          : { x: 0, y: 0, width: el.videoWidth, height: el.videoHeight };
        if (region.width > 0 && region.height > 0) {
          const shrink = Math.min(1, MAX_DECODE_WIDTH / region.width);
          canvas.width = Math.round(region.width * shrink);
          canvas.height = Math.round(region.height * shrink);
          context.drawImage(el, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
          try {
            const [hit] = await detector.current.detect(canvas);
            if (hit?.rawValue && !stopped && !latest.current.paused) latest.current.onScan(hit.rawValue);
          } catch {
            // One unreadable frame says nothing; the next is a fraction of a second away.
          }
        }
      }
      if (!stopped) timer = setTimeout(() => void scan(), SCAN_EVERY_MS);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        onProblem('This browser cannot open the camera here. It needs a secure (https) page.');
        return;
      }
      try {
        stream = await openBackCamera();
      } catch (error) {
        onProblem(cameraProblem(error));
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (track) await tune(track);
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play().catch(() => undefined);
      }
      try {
        detector.current = await makeDetector();
      } catch {
        onProblem('The barcode reader could not load. Check your connection and try again.');
        return;
      }
      void scan();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // Opened once per visit; the props it needs are read through `latest`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {createElement('video', {
        ref: video,
        // All three, or iOS Safari shows a still frame or opens its own player.
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: { width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000' },
      })}
    </View>
  );
};
