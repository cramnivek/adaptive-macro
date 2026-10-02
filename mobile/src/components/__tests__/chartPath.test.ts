import { describe, expect, it } from 'vitest';
import { polylineLength } from '../chartPath';

describe('polylineLength', () => {
  it('measures a straight horizontal run', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(10);
  });

  it('measures a diagonal by its hypotenuse, not its axes', () => {
    expect(polylineLength([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(5);
  });

  it('sums every segment of a multi-point line', () => {
    const length = polylineLength([
      { x: 0, y: 0 },
      { x: 3, y: 4 },
      { x: 3, y: 10 },
    ]);
    expect(length).toBe(11);
  });

  it('is zero for a single point, which draws nothing', () => {
    expect(polylineLength([{ x: 5, y: 5 }])).toBe(0);
  });

  it('is zero for no points at all', () => {
    expect(polylineLength([])).toBe(0);
  });

  it('counts a doubled-back segment rather than the displacement', () => {
    // Two points at the same place still travel there and back, and the dash
    // offset has to cover the distance the pen actually moves.
    expect(polylineLength([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 0 }])).toBe(8);
  });
});
