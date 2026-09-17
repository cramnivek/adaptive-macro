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
