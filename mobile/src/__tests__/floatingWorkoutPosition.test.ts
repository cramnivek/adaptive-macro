import { describe, expect, it } from 'vitest';
import { workoutBarBounds, clampWorkoutBarOffset } from '../floatingWorkoutPosition';

describe('active workout overlay bounds', () => {
  it('keeps the default above the measured Android tabs including their inset', () => {
    expect(workoutBarBounds(852, 88, 76, 32, 8)).toEqual({ bottom: 96, minOffset: -640 });
  });

  it('prevents dragging into either the top safe area or bottom navigation', () => {
    const { minOffset } = workoutBarBounds(852, 88, 76, 32, 8);
    expect(clampWorkoutBarOffset(200, minOffset)).toBe(0);
    expect(clampWorkoutBarOffset(-1000, minOffset)).toBe(-640);
    expect(clampWorkoutBarOffset(-150, minOffset)).toBe(-150);
  });

  it('re-clamps a saved position when the available height shrinks', () => {
    const { minOffset } = workoutBarBounds(393, 64, 100, 24, 8);
    expect(clampWorkoutBarOffset(-640, minOffset)).toBe(-189);
  });

  it('keeps an oversized overlay at its bottom anchor', () => {
    const { minOffset } = workoutBarBounds(180, 88, 100, 32, 8);
    expect(minOffset).toBe(0);
    expect(clampWorkoutBarOffset(-100, minOffset)).toBe(0);
  });
});
