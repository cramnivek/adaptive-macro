/** Offsets are relative to the bottom anchor, which must always clear the tabs. */
export const workoutBarBounds = (frameHeight: number, tabHeight: number, barHeight: number, topInset: number, gap: number) => ({
  bottom: tabHeight + gap,
  minOffset: Math.min(0, topInset + gap - (frameHeight - tabHeight - gap - barHeight)),
});

export const clampWorkoutBarOffset = (offset: number, minOffset: number) => Math.max(minOffset, Math.min(0, offset));
