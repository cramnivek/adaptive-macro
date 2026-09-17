import { describe, expect, it } from 'vitest';
import { diag, identity, matMul, predict, transpose, updateScalar } from '../src/kalman';

describe('matrix helpers', () => {
  it('multiplies and transposes', () => {
    const a = [
      [1, 2],
      [3, 4],
    ];
    const b = [
      [5, 6],
      [7, 8],
    ];
    expect(matMul(a, b)).toEqual([
      [19, 22],
      [43, 50],
    ]);
    expect(transpose(a)).toEqual([
      [1, 3],
      [2, 4],
    ]);
    expect(matMul(a, identity(2))).toEqual(a);
  });
});

describe('updateScalar', () => {
  const state = { x: [10, 0], P: diag([4, 4]) };

  it('snaps to the measurement when it is far more precise than the prior', () => {
    const updated = updateScalar(state, [1, 0], 12, 1e-6);
    expect(updated.x[0]).toBeCloseTo(12, 4);
    expect(updated.P[0][0]).toBeLessThan(1e-5);
  });

  it('barely moves when the measurement is far noisier than the prior', () => {
    const updated = updateScalar(state, [1, 0], 12, 1e6);
    expect(updated.x[0]).toBeCloseTo(10, 4);
    expect(updated.P[0][0]).toBeCloseTo(4, 4);
  });

  it('reports the innovation and its variance', () => {
    const updated = updateScalar(state, [1, 0], 13, 5);
    expect(updated.innovation).toBeCloseTo(3, 10);
    expect(updated.innovationVariance).toBeCloseTo(4 + 5, 10);
  });

  it('keeps the covariance symmetric and positive over many steps', () => {
    let current = { x: [80, 2500], P: diag([0.49, 90000]) };
    const F = [
      [1, -1 / 7700],
      [0, 1],
    ];
    const Q = diag([0.0025, 144]);

    for (let i = 0; i < 2000; i++) {
      current = predict(current, F, Q, [2200 / 7700, 0]);
      const updated = updateScalar(current, [1, 0], 80 - i * 0.005, 0.49);
      current = { x: updated.x, P: updated.P };
    }

    expect(Math.abs(current.P[0][1] - current.P[1][0])).toBeLessThan(1e-9);
    expect(current.P[0][0]).toBeGreaterThan(0);
    expect(current.P[1][1]).toBeGreaterThan(0);
    expect(Number.isFinite(current.x[1])).toBe(true);
  });
});

describe('predict', () => {
  it('applies the transition and the control input', () => {
    const next = predict({ x: [80, 2800], P: diag([1, 100]) }, [[1, -1 / 7700], [0, 1]], diag([0, 0]), [
      2300 / 7700,
      0,
    ]);
    expect(next.x[0]).toBeCloseTo(80 + (2300 - 2800) / 7700, 10);
    expect(next.x[1]).toBeCloseTo(2800, 10);
  });
});
