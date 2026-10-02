import { describe, expect, it } from 'vitest';
import { volumeComparison } from '../volume';

describe('volumeComparison', () => {
  it('says nothing below the lightest reference', () => {
    expect(volumeComparison(40)).toBeNull();
  });

  it('uses the singular when the volume is about one of something', () => {
    expect(volumeComparison(110)).toBe('about a washing machine');
  });

  it('counts whole references once there are several', () => {
    expect(volumeComparison(1_350)).toBe('about 3 grand pianos');
  });

  it('climbs to the heaviest reference the volume actually covers', () => {
    // 11 tonnes clears an elephant twice over but not a bus once, so the
    // elephant is the right image.
    expect(volumeComparison(11_000)).toBe('about 2 African elephants');
    expect(volumeComparison(18_000)).toBe('about 2 double-decker buses');
  });

  it('never leaves a plural one, which would read as broken', () => {
    // 1.4 small cars rounds to 1, and must not come back as "1 small cars".
    expect(volumeComparison(1_900)).toBe('about a small car');
  });

  it('is null for nothing lifted', () => {
    expect(volumeComparison(0)).toBeNull();
  });

  it('is null rather than throwing on a figure that is not a number', () => {
    expect(volumeComparison(Number.NaN)).toBeNull();
    expect(volumeComparison(-500)).toBeNull();
  });
});
