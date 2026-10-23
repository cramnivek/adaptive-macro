'use dom';

import { useEffect } from 'react';
import type { ShareCard } from '../shareCard';
import { drawShareCard } from '../platform/shareImage';
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
}: {
  summary: ShareCard;
  onDrawn: (pngDataUrl: string | null) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}) {
  const requestKey = JSON.stringify(summary);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await domFontsReady(FACES);
        const url = drawShareCard(summary).toDataURL('image/png');
        if (!cancelled) await onDrawn(url);
      } catch {
        if (!cancelled) await onDrawn(null);
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
