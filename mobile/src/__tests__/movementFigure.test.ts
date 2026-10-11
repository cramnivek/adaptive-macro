import { describe, expect, it } from 'vitest';
import { MOVEMENT_PATTERNS } from '../ai/exercises';
import { FLOOR_Y, LENGTH, MOVEMENTS, REP_MS, figureAt, repProgress } from '../movementFigure';

const distance = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const SAMPLES = Array.from({ length: 21 }, (_, i) => i / 20);

describe('the figure', () => {
  it('has a movement for every pattern the catalogue can assign', () => {
    for (const pattern of MOVEMENT_PATTERNS) expect(MOVEMENTS[pattern]).toBeDefined();
  });

  // The point of posing by angle: no bone stretches or shrinks mid-rep.
  it('keeps every bone its length through the whole rep, for every pattern', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const k of SAMPLES) {
        const j = figureAt(pattern, k);
        const at = `${pattern} at ${k}`;
        expect(distance(j.hip, j.shoulder), at).toBeCloseTo(LENGTH.torso, 5);
        expect(distance(j.shoulder, j.elbow), at).toBeCloseTo(LENGTH.upperArm, 5);
        expect(distance(j.elbow, j.hand), at).toBeCloseTo(LENGTH.forearm, 5);
        expect(distance(j.hip, j.frontKnee), at).toBeCloseTo(LENGTH.thigh, 5);
        expect(distance(j.frontKnee, j.frontAnkle), at).toBeCloseTo(LENGTH.shin, 5);
        expect(distance(j.hip, j.backKnee), at).toBeCloseTo(LENGTH.thigh, 5);
        expect(distance(j.backKnee, j.backAnkle), at).toBeCloseTo(LENGTH.shin, 5);
      }
    }
  });

  it('keeps planted feet still and on the floor through the rep', () => {
    for (const pattern of ['squat', 'hinge', 'pull', 'lunge', 'isolation'] as const) {
      const start = figureAt(pattern, 0);
      for (const k of SAMPLES) {
        const j = figureAt(pattern, k);
        expect(distance(j.frontAnkle, start.frontAnkle), `${pattern} front foot at ${k}`).toBeLessThan(1e-6);
        expect(distance(j.backAnkle, start.backAnkle), `${pattern} back foot at ${k}`).toBeLessThan(1e-6);
        expect(j.frontAnkle[1]).toBeCloseTo(FLOOR_Y, 5);
        expect(j.backAnkle[1]).toBeCloseTo(FLOOR_Y, 5);
      }
    }
  });

  it('squats to depth: hips down to about knee height, behind the feet', () => {
    const top = figureAt('squat', 0);
    const bottom = figureAt('squat', 1);
    expect(bottom.hip[1] - top.hip[1]).toBeGreaterThan(12);
    expect(Math.abs(bottom.hip[1] - bottom.frontKnee[1])).toBeLessThan(6);
    expect(bottom.hip[0]).toBeLessThan(bottom.frontAnkle[0]);
  });

  it('hinges at the hip: the trunk tips far over while the hips barely drop', () => {
    const top = figureAt('hinge', 0);
    const bottom = figureAt('hinge', 1);
    expect(bottom.shoulder[1] - top.shoulder[1]).toBeGreaterThan(18);
    expect(Math.abs(bottom.hip[1] - top.hip[1])).toBeLessThan(4);
  });

  it('lunges with the back knee dropping to just off the floor', () => {
    const bottom = figureAt('lunge', 1);
    expect(FLOOR_Y - bottom.backKnee[1]).toBeLessThan(5);
    expect(FLOOR_Y - bottom.backKnee[1]).toBeGreaterThan(0);
    // The front knee stays over its foot rather than collapsing past it.
    expect(bottom.frontKnee[0] - bottom.frontAnkle[0]).toBeLessThan(4);
  });

  it('presses the bar from the chest to straight arms over the shoulder', () => {
    const bottom = figureAt('push', 0);
    const top = figureAt('push', 1);
    expect(Math.abs(bottom.hand[1] - bottom.shoulder[1])).toBeLessThan(4);
    expect(bottom.shoulder[1] - top.hand[1]).toBeCloseTo(LENGTH.upperArm + LENGTH.forearm, 5);
  });

  it('stays inside its box for every pattern', () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const k of SAMPLES) {
        for (const [x, y] of Object.values(figureAt(pattern, k))) {
          expect(x, pattern).toBeGreaterThanOrEqual(2);
          expect(x, pattern).toBeLessThanOrEqual(98);
          expect(y, pattern).toBeGreaterThanOrEqual(2);
          expect(y, pattern).toBeLessThanOrEqual(FLOOR_Y + 1e-6);
        }
      }
    }
  });
});

describe('repProgress', () => {
  it('starts and ends the rep at the start pose', () => {
    expect(repProgress(0)).toBe(0);
    expect(repProgress(REP_MS)).toBe(0);
  });

  it('holds at the far end of the rep before coming back', () => {
    expect(repProgress(REP_MS * 0.4)).toBe(1);
    expect(repProgress(REP_MS * 0.48)).toBe(1);
  });

  it('eases rather than moving at constant speed', () => {
    const early = repProgress(REP_MS * 0.038);
    const middle = repProgress(REP_MS * 0.19);
    expect(early).toBeLessThan(0.05);
    expect(middle).toBeCloseTo(0.5, 5);
  });

  it('repeats, and tolerates a clock that starts anywhere', () => {
    expect(repProgress(REP_MS * 3.19)).toBeCloseTo(repProgress(REP_MS * 0.19), 5);
    expect(repProgress(-REP_MS * 0.81)).toBeCloseTo(repProgress(REP_MS * 0.19), 5);
  });
});
