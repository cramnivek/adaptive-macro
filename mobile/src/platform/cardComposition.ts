import type { ShareCard } from '../shareCard';
import type { CardBlocks, Placement } from '../shareCardPlacement';
import type { TemplateId } from '../shareCardTemplate';
import { composeCard, drawBackdrop, drawOverlay, drawShareCard } from './shareImage';
import { subjectOf } from './depth';

export interface CardComposition {
  photo: { id: string; dataUrl?: string };
  template: TemplateId;
  blocks: CardBlocks;
  place: Placement;
  depth: boolean;
}

export interface CardPreview {
  url: string;
  ground: string | null;
  sticker: { uri: string; width: number; height: number } | null;
  subject: string | null;
  depthApplied: boolean;
}

/** Keys describe an edit without repeating the photo bytes. */
export const cardRenderKey = (summary: ShareCard | null, composition: CardComposition | null, attempt = 0): string =>
  JSON.stringify([summary, composition && { ...composition, photo: composition.photo.id }, attempt]);

const decodePhoto = (uri: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('That photo could not be opened.'));
  image.src = uri;
});

/** Each mounted renderer owns one photo, so edits reuse layers without retaining other people's photos. */
export const createCardRenderer = () => {
  let photoCache: { id: string; loaded: Promise<{ image: HTMLImageElement; ground: string }>; subject?: Promise<HTMLCanvasElement | null> } | null = null;
  let overlayCache: { key: string; canvas: HTMLCanvasElement; uri: string } | null = null;
  return async (summary: ShareCard, composition: CardComposition | null, getPhoto?: (id: string) => Promise<string | null>): Promise<CardPreview> => {
    if (!composition) {
      photoCache = null;
      overlayCache = null;
      return { url: drawShareCard(summary).toDataURL('image/png'), ground: null, sticker: null, subject: null, depthApplied: false };
    }
    if (photoCache?.id !== composition.photo.id) {
      photoCache = {
        id: composition.photo.id,
        loaded: (async () => {
          const uri = composition.photo.dataUrl ?? await getPhoto?.(composition.photo.id);
          if (!uri) throw new Error('That photo is no longer available.');
          const image = await decodePhoto(uri);
          return { image, ground: drawBackdrop(image).toDataURL('image/jpeg', 0.8) };
        })(),
      };
    }
    const cachedPhoto = photoCache;
    const { image, ground } = await cachedPhoto.loaded;
    const overlayKey = JSON.stringify([summary, composition.blocks, composition.template]);
    if (overlayCache?.key !== overlayKey) {
      const canvas = drawOverlay(summary, composition.blocks, composition.template);
      overlayCache = { key: overlayKey, canvas, uri: canvas.toDataURL('image/png') };
    }
    const overlay = overlayCache;
    if (composition.depth) cachedPhoto.subject ??= subjectOf(image, { width: 1080, height: 1920 }).catch(() => null);
    const subject = composition.depth ? await cachedPhoto.subject! : null;
    return {
      url: composeCard(image, overlay.canvas, composition.place, subject).toDataURL('image/jpeg', 0.92),
      ground,
      sticker: { uri: overlay.uri, width: overlay.canvas.width, height: overlay.canvas.height },
      subject: subject?.toDataURL('image/png') ?? null,
      depthApplied: subject !== null,
    };
  };
};
