import { describe, expect, it } from 'vitest';
import { MAX_REST_SECONDS, MIN_REST_SECONDS, adjustRest, formatRest } from '../rest';

describe('adjustRest', () => {
  it('moves by a whole step in each direction', () => {
    expect(adjustRest(120, 1)).toBe(135);
    expect(adjustRest(120, -1)).toBe(105);
  });

  it('snaps an off-step value onto the grid as it moves', () => {
    // Someone resting 97 seconds and tapping up should land somewhere tidy.
    expect(adjustRest(97, 1)).toBe(105);
  });

  it('will not go below the floor', () => {
    expect(adjustRest(MIN_REST_SECONDS, -1)).toBe(MIN_REST_SECONDS);
    expect(adjustRest(MIN_REST_SECONDS, -10)).toBe(MIN_REST_SECONDS);
  });

  it('will not go above the ceiling', () => {
    expect(adjustRest(MAX_REST_SECONDS, 1)).toBe(MAX_REST_SECONDS);
    expect(adjustRest(MAX_REST_SECONDS, 99)).toBe(MAX_REST_SECONDS);
  });

  it('crosses several steps at once when asked', () => {
    expect(adjustRest(120, 4)).toBe(180);
  });
});

describe('formatRest', () => {
  it('reads as a clock', () => {
    expect(formatRest(120)).toBe('2:00');
    expect(formatRest(45)).toBe('0:45');
    expect(formatRest(605)).toBe('10:05');
  });

  it('pads the seconds but not the minutes, the way a clock does', () => {
    expect(formatRest(61)).toBe('1:01');
  });

  it('floors at zero rather than counting into a debt', () => {
    expect(formatRest(0)).toBe('0:00');
    expect(formatRest(-5)).toBe('0:00');
  });

  it('does not round a part-second up into the next tick', () => {
    // 59.9 seconds left is still 0:59 on the face, not 1:00.
    expect(formatRest(59.9)).toBe('0:59');
  });
});
