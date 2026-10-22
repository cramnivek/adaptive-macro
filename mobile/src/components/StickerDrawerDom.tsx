'use dom';

import { useEffect } from 'react';
import type { Nutrients, UserProfile } from '@adaptive-macros/engine';
import type { ShareCard } from '../shareCard';
import { ALL_BLOCKS } from '../shareCardPlacement';
import type { TemplateId } from '../shareCardTemplate';
import { drawNutritionOverlay, drawOverlay, type NativeStickerExport, type StickerTheme } from '../platform/shareImage';
import { font } from '../theme';

type Request = {
  theme: StickerTheme;
  template: TemplateId;
} & (
  | { mode: 'workout'; summary: ShareCard }
  | { mode: 'nutrition'; consumed: Nutrients; profile: UserProfile }
);

// A DOM component has its own font registry, separate from the native app.
const FACES: [string, string][] = [
  [font.ui, require('@expo-google-fonts/space-grotesk/400Regular/SpaceGrotesk_400Regular.ttf')],
  [font.uiStrong, require('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf')],
  [font.display, require('@expo-google-fonts/space-grotesk/700Bold/SpaceGrotesk_700Bold.ttf')],
  [font.figure, require('@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf')],
];

export default function StickerDrawerDom({ request, requestKey, onDrawn }: {
  request: Request;
  requestKey: string;
  onDrawn: (requestKey: string, sticker: NativeStickerExport | null) => Promise<void>;
  dom?: import('expo/dom').DOMProps;
}) {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all(FACES.map(async ([family, source]) => {
          document.fonts.add(await new FontFace(family, `url(${source})`).load());
        }));
        const canvas = request.mode === 'nutrition'
          ? drawNutritionOverlay(request.consumed, request.profile, request.theme)
          : drawOverlay(request.summary, ALL_BLOCKS, request.template, request.theme);
        // PNG preserves the alpha channel; neither a screenshot nor a JPEG does.
        const sticker = { url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
        if (!cancelled) await onDrawn(requestKey, sticker);
      } catch {
        if (!cancelled) await onDrawn(requestKey, null);
      }
    })();
    return () => { cancelled = true; };
    // Bridged objects are deserialized afresh even when their contents have not changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  return null;
}
