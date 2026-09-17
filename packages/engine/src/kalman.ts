/**
 * Minimal linear Kalman filter.
 *
 * Deliberately specialised to a scalar measurement: every observation this app
 * makes is a single number (a scale reading), and with a scalar innovation the
 * Kalman gain is a plain division rather than a matrix inverse. That removes
 * the only numerically awkward step and keeps the whole filter dependency-free.
 */

export type Vector = number[];
export type Matrix = number[][];

/** A multivariate normal: mean `x`, covariance `P`. */
export interface GaussianState {
  x: Vector;
  P: Matrix;
}

export const zeros = (rows: number, cols: number): Matrix =>
  Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

export const diag = (values: number[]): Matrix => {
  const n = values.length;
  const m = zeros(n, n);
  for (let i = 0; i < n; i++) m[i][i] = values[i];
  return m;
};

export const identity = (n: number): Matrix => diag(new Array<number>(n).fill(1));

export const transpose = (a: Matrix): Matrix => {
  const rows = a.length;
  const cols = a[0].length;
  const out = zeros(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) out[j][i] = a[i][j];
  }
  return out;
};

export const matMul = (a: Matrix, b: Matrix): Matrix => {
  const rows = a.length;
  const inner = b.length;
  const cols = b[0].length;
  const out = zeros(rows, cols);
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const aik = a[i][k];
      if (aik === 0) continue;
      for (let j = 0; j < cols; j++) out[i][j] += aik * b[k][j];
    }
  }
  return out;
};

export const matAdd = (a: Matrix, b: Matrix): Matrix =>
  a.map((row, i) => row.map((v, j) => v + b[i][j]));

export const matVec = (a: Matrix, v: Vector): Vector =>
  a.map((row) => row.reduce((sum, value, j) => sum + value * v[j], 0));

export const vecAdd = (a: Vector, b: Vector): Vector => a.map((v, i) => v + b[i]);

/**
 * Time update: push the state forward one step through `x' = F x + u`,
 * growing the covariance by the transition and by the process noise `Q`.
 */
export const predict = (
  state: GaussianState,
  F: Matrix,
  Q: Matrix,
  u: Vector,
): GaussianState => ({
  x: vecAdd(matVec(F, state.x), u),
  P: matAdd(matMul(matMul(F, state.P), transpose(F)), Q),
});

export interface ScalarUpdateResult extends GaussianState {
  /** Measurement minus prediction. Large values mean the model was surprised. */
  innovation: number;
  /** Expected variance of that innovation, i.e. how surprised it was allowed to be. */
  innovationVariance: number;
}

/**
 * Measurement update against a single scalar reading `z` with observation
 * row-vector `H` and measurement variance `R`.
 *
 * Covariance uses the Joseph form `(I-KH) P (I-KH)^T + K R K^T` instead of the
 * shorter `(I-KH) P`. It costs two extra matrix products but stays symmetric
 * and positive-definite under floating-point drift, which matters here because
 * the filter runs over years of daily data without ever being restarted.
 */
export const updateScalar = (
  state: GaussianState,
  H: Vector,
  z: number,
  R: number,
): ScalarUpdateResult => {
  const n = state.x.length;
  const Hm: Matrix = [H];
  const Ht = transpose(Hm);

  // PHt is the n-by-1 cross-covariance between state and measurement.
  const PHt = matMul(state.P, Ht);
  const innovationVariance = matMul(Hm, PHt)[0][0] + R;
  const K: Vector = PHt.map((row) => row[0] / innovationVariance);

  const innovation = z - H.reduce((sum, h, i) => sum + h * state.x[i], 0);
  const x = state.x.map((value, i) => value + K[i] * innovation);

  const KH = matMul(
    K.map((k) => [k]),
    Hm,
  );
  const IminusKH = matAdd(identity(n), KH.map((row) => row.map((v) => -v)));
  const KRKt = matMul(
    K.map((k) => [k * R]),
    [K],
  );
  const P = matAdd(
    matMul(matMul(IminusKH, state.P), transpose(IminusKH)),
    KRKt,
  );

  return { x, P, innovation, innovationVariance };
};

/**
 * Matrix inverse by Gauss-Jordan elimination with partial pivoting.
 *
 * Only the smoother needs this — the forward filter's scalar measurement makes
 * its gain a division. Sizes here are tiny (2x2), so the clarity of a general
 * routine costs nothing. Returns null for a singular matrix rather than
 * throwing or emitting infinities, so the caller can fall back rather than
 * poison the whole series with NaN.
 */
export const invert = (input: Matrix): Matrix | null => {
  const n = input.length;
  // Work on [A | I] and reduce the left half to the identity.
  const a = input.map((row, i) => [...row, ...identity(n)[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];

    const scale = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= scale;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = a[row][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j++) a[row][j] -= factor * a[col][j];
    }
  }

  return a.map((row) => row.slice(n));
};

/** One step of forward filtering, retained so the backward pass can revisit it. */
export interface FilterStep {
  /** State after this step's measurement update. */
  filtered: GaussianState;
  /** Prediction of the NEXT step made from this one; absent on the last step. */
  predicted?: GaussianState;
  /** Transition used for that prediction; absent on the last step. */
  F?: Matrix;
}

/**
 * Rauch-Tung-Striebel smoother: a backward pass that lets later evidence
 * correct earlier estimates.
 *
 * The forward filter only ever knows the past, so its estimate of any given day
 * lags — a change in expenditure shows up over the following weeks rather than
 * on the day it happened, and the trend line trails the real one. Once the
 * whole history is in hand there is no reason to display that lag: every past
 * day can be re-estimated knowing what came after it.
 *
 * The final day is untouched, since nothing follows it. Today's number is
 * therefore the same as the filter's — only the history sharpens.
 */
export const rtsSmooth = (steps: FilterStep[]): GaussianState[] => {
  if (steps.length === 0) return [];

  const smoothed: GaussianState[] = new Array(steps.length);
  smoothed[steps.length - 1] = steps[steps.length - 1].filtered;

  for (let t = steps.length - 2; t >= 0; t--) {
    const step = steps[t];
    const next = smoothed[t + 1];

    if (!step.predicted || !step.F) {
      smoothed[t] = step.filtered;
      continue;
    }

    const inversePredicted = invert(step.predicted.P);
    if (!inversePredicted) {
      // A singular predicted covariance means there is nothing to gain from
      // the future here; keep the filtered estimate rather than fabricating.
      smoothed[t] = step.filtered;
      continue;
    }

    // C = P_filtered F^T inv(P_predicted) — how much of the future correction
    // this day should absorb.
    const C = matMul(matMul(step.filtered.P, transpose(step.F)), inversePredicted);

    const correction = next.x.map((value, i) => value - step.predicted!.x[i]);
    const x = vecAdd(step.filtered.x, matVec(C, correction));

    const covarianceDelta = matAdd(
      next.P,
      step.predicted.P.map((row) => row.map((v) => -v)),
    );
    const P = matAdd(step.filtered.P, matMul(matMul(C, covarianceDelta), transpose(C)));

    smoothed[t] = { x, P };
  }

  return smoothed;
};
