import { describe, expect, it } from 'vitest';
import { sizeForCard } from '../platform/depth';

const CARD = { width: 1080, height: 1920 };

describe('sizeForCard', () => {
  it('shrinks a camera-roll photo until its short side just covers the card', () => {
    expect(sizeForCard({ naturalWidth: 4032, naturalHeight: 3024 }, CARD)).toEqual({ width: 2560, height: 1920 });
    // A 48-megapixel portrait shot: 8064 x 6048 turned upright.
    expect(sizeForCard({ naturalWidth: 6048, naturalHeight: 8064 }, CARD)).toEqual({ width: 1440, height: 1920 });
  });

  it('never enlarges a picture already smaller than the card', () => {
    expect(sizeForCard({ naturalWidth: 720, naturalHeight: 1280 }, CARD)).toEqual({ width: 720, height: 1280 });
  });
});
