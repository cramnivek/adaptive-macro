import { describe, expect, it } from 'vitest';
import { chooseBodyFat } from '../bodyFatChoice';

describe('chooseBodyFat', () => {
  it('takes the newest figure when none is a photo estimate', () => {
    expect(
      chooseBodyFat([
        { bodyFatPct: 17, bodyFatSource: 'tape' },
        { bodyFatPct: 19, bodyFatSource: 'entered' },
      ]),
    ).toEqual({ pct: 17, source: 'tape' });
  });

  it('keeps a tape or typed figure over a newer photo estimate', () => {
    expect(
      chooseBodyFat([
        { bodyFatPct: 22, bodyFatSource: 'photo' },
        { bodyFatPct: null },
        { bodyFatPct: 18, bodyFatSource: 'entered' },
      ]),
    ).toEqual({ pct: 18, source: 'entered' });
  });

  it('uses a photo estimate when it is all there is', () => {
    expect(chooseBodyFat([{ bodyFatPct: 20, bodyFatSource: 'photo' }, { bodyFatPct: null }])).toEqual({
      pct: 20,
      source: 'photo',
    });
  });

  it('reads a figure with no recorded source as typed in, and nothing as nothing', () => {
    expect(chooseBodyFat([{ bodyFatPct: 15 }])).toEqual({ pct: 15, source: 'entered' });
    expect(chooseBodyFat([{ bodyFatPct: null }])).toBeNull();
    expect(chooseBodyFat([])).toBeNull();
  });
});
