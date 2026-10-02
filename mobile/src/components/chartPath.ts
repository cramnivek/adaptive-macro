export interface Point {
  x: number;
  y: number;
}

/**
 * Total length of a polyline, in the same units as its coordinates.
 *
 * The line chart draws itself in by animating `strokeDashoffset` from the
 * path's length down to zero, which needs that length up front. The DOM would
 * hand it over through `getTotalLength()`; `react-native-svg` has no
 * dependable equivalent across its three platforms, and the chart's paths are
 * `M`/`L` only — no curves — so summing the segments is exact rather than an
 * approximation of one.
 *
 * Fewer than two points is a length of zero: there is nothing to draw.
 */
export const polylineLength = (points: Point[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    if (previous === undefined || current === undefined) continue;
    total += Math.hypot(current.x - previous.x, current.y - previous.y);
  }
  return total;
};
