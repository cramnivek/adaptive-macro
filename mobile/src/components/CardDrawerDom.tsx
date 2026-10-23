'use dom';

import { useEffect, useRef } from 'react';
import type { ShareCard } from '../shareCard';
import { createCardRenderer, type CardComposition, type CardPreview } from '../platform/cardComposition';
import { font } from '../theme';
import { domFontsReady } from '../platform/domFonts';

/**
 * Draws a post's story card on a phone, with the web build's own code.
 *
 * The card is about 1,500 lines of canvas drawing in shareImage.ts, and a
 * phone has no canvas: the Android app showed "Render Story Card" and nothing
 * happened. Drawing it again natively would be a second card to keep in step
 * with the first. This runs the same code in a webview and hands back a PNG,
 * which the post shows as an ordinary image.
 *
 * The webview does not share the app's fonts, so the four the card uses are
 * loaded here before drawing; a card drawn in a fallback face would be wrong
 * in exactly the way nobody notices until it is shared.
 */

const FACES: [family: string, source: string][] = [
  [font.ui, require('@expo-google-fonts/space-grotesk/400Regular/SpaceGrotesk_400Regular.ttf')],
  [font.uiStrong, require('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')],
  [font.display, require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf')],
  [font.figure, require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf')],
];

export default function CardDrawerDom({
  summary,
  onDrawn,
  composition = null,
  requestKey: suppliedKey,
  onComposed,
  getPhoto,
}: {
  summary: ShareCard;
  onDrawn?: (pngDataUrl: string | null) => Promise<void>;
  composition?: CardComposition | null;
  requestKey?: string;
  onComposed?: (requestKey: string, preview: CardPreview | null) => Promise<void>;
  getPhoto?: (id: string) => Promise<string | null>;
  dom?: import('expo/dom').DOMProps;
}) {
  const requestKey = suppliedKey ?? JSON.stringify(summary);
  const render = useRef<ReturnType<typeof createCardRenderer> | null>(null);
  render.current ??= createCardRenderer();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await domFontsReady(FACES);
        const preview = await render.current!(summary, composition, getPhoto);
        if (!cancelled) {
          await onDrawn?.(preview.url);
          await onComposed?.(requestKey, preview);
        }
      } catch {
        if (!cancelled) {
          await onDrawn?.(null);
          await onComposed?.(requestKey, null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Drawn once per summary; onDrawn is a fresh bridge function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return null;
}
