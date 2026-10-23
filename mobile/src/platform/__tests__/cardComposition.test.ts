import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShareCard } from '../../shareCard';
import { ALL_BLOCKS } from '../../shareCardPlacement';
import { TEMPLATES } from '../../shareCardTemplate';
import { cardRenderKey, createCardRenderer, type CardComposition } from '../cardComposition';

const drawing = vi.hoisted(() => ({
  drawShareCard: vi.fn(), drawOverlay: vi.fn(), drawBackdrop: vi.fn(), composeCard: vi.fn(), subjectOf: vi.fn(),
}));
vi.mock('../shareImage', () => drawing);
vi.mock('../depth', () => ({ subjectOf: drawing.subjectOf }));

const summary = { title: 'Legs', date: '23 Oct', duration: '1h 21m', sets: 9, volume: '7,030 lb', lifts: [] } as unknown as ShareCard;
const composition: CardComposition = {
  photo: { id: 'photo-1', dataUrl: 'data:image/jpeg;base64,photo-one' },
  template: 'block', blocks: ALL_BLOCKS, place: TEMPLATES.block.place, depth: false,
};
const canvas = (name: string) => ({ width: 600, height: 800, toDataURL: vi.fn((mime: string) => `data:${mime};base64,${name}`) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) { queueMicrotask(() => value.includes('unreadable') ? this.onerror?.() : this.onload?.()); }
  });
  drawing.drawShareCard.mockReturnValue(canvas('flat'));
  drawing.drawOverlay.mockReturnValue(canvas('overlay'));
  drawing.drawBackdrop.mockReturnValue(canvas('ground'));
  drawing.composeCard.mockReturnValue(canvas('composed'));
  drawing.subjectOf.mockResolvedValue(null);
});

describe('native card composition', () => {
  it('keeps the default card a PNG without decoding a photo', async () => {
    const result = await createCardRenderer()(summary, null);
    expect(result.url).toBe('data:image/png;base64,flat');
    expect(result.ground).toBeNull();
    expect(drawing.drawBackdrop).not.toHaveBeenCalled();
  });

  it('composes the selected photo and current overlay at the chosen placement', async () => {
    const result = await createCardRenderer()(summary, composition);
    expect(result.url).toBe('data:image/jpeg;base64,composed');
    expect(result.ground).toBe('data:image/jpeg;base64,ground');
    expect(result.sticker).toEqual({ uri: 'data:image/png;base64,overlay', width: 600, height: 800 });
    expect(drawing.drawOverlay).toHaveBeenCalledWith(summary, ALL_BLOCKS, 'block');
    expect(drawing.composeCard).toHaveBeenCalledWith(expect.anything(), expect.anything(), composition.place, null);
    expect(drawing.subjectOf).not.toHaveBeenCalled();
  });

  it('reuses photo and overlay work when only placement changes', async () => {
    const render = createCardRenderer();
    await render(summary, composition);
    await render(summary, { ...composition, place: { ...composition.place, x: 0.7 } });
    expect(drawing.drawBackdrop).toHaveBeenCalledTimes(1);
    expect(drawing.drawOverlay).toHaveBeenCalledTimes(1);
    expect(drawing.composeCard).toHaveBeenCalledTimes(2);
  });

  it('loads photo bytes through the bridge only once across settled edits', async () => {
    const getPhoto = vi.fn().mockResolvedValue(composition.photo.dataUrl);
    const metadata = { ...composition, photo: { id: composition.photo.id } };
    const render = createCardRenderer();
    await render(summary, metadata, getPhoto);
    await render(summary, { ...metadata, place: { ...metadata.place, x: 0.7 } }, getPhoto);
    expect(getPhoto).toHaveBeenCalledTimes(1);
    expect(getPhoto).toHaveBeenCalledWith('photo-1');
    expect(JSON.stringify(metadata)).not.toContain('photo-one');
  });

  it('does not substitute another photo if its native selection is no longer available', async () => {
    await expect(createCardRenderer()(summary, { ...composition, photo: { id: 'expired' } }, async () => null)).rejects.toThrow('no longer available');
    expect(drawing.composeCard).not.toHaveBeenCalled();
  });

  it('replaces the photo, and discards its cached subject when a new photo is selected', async () => {
    drawing.subjectOf.mockResolvedValue(canvas('person'));
    const render = createCardRenderer();
    await render(summary, { ...composition, depth: true });
    await render(summary, { ...composition, depth: true, photo: { id: 'photo-2', dataUrl: 'data:image/jpeg;base64,photo-two' } });
    expect(drawing.drawBackdrop).toHaveBeenCalledTimes(2);
    expect(drawing.subjectOf).toHaveBeenCalledTimes(2);
  });

  it('preserves the photo when depth fails, and reports that depth was not applied', async () => {
    drawing.subjectOf.mockRejectedValue(new Error('Offline'));
    const result = await createCardRenderer()(summary, { ...composition, depth: true });
    expect(result.url).toBe('data:image/jpeg;base64,composed');
    expect(result.depthApplied).toBe(false);
    expect(result.subject).toBeNull();
  });

  it('reports an unreadable photo instead of silently returning the default card', async () => {
    await expect(createCardRenderer()(summary, { ...composition, photo: { id: 'broken', dataUrl: 'unreadable' } })).rejects.toThrow();
    expect(drawing.drawShareCard).not.toHaveBeenCalled();
  });

  it('invalidates the request for each visual change and retry without serializing photo bytes into its key', () => {
    const first = cardRenderKey(summary, composition, 0);
    expect(first).not.toContain('photo-one');
    for (const changed of [
      { ...composition, photo: { ...composition.photo, id: 'photo-2' } },
      { ...composition, place: { ...composition.place, x: 0.7 } },
      { ...composition, template: 'tag' as const },
      { ...composition, blocks: { ...ALL_BLOCKS, climb: false } },
      { ...composition, depth: true },
    ]) expect(cardRenderKey(summary, changed, 0)).not.toBe(first);
    expect(cardRenderKey(summary, composition, 1)).not.toBe(first);
    expect(cardRenderKey(summary, { ...composition }, 0)).toBe(first);
  });
});
