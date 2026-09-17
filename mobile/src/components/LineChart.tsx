import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { space, useTheme } from '../theme';

export interface ChartPoint {
  x: number;
  y: number;
}

export interface ChartSeries {
  points: ChartPoint[];
  color: string;
  strokeWidth?: number;
}

export interface ChartBand {
  /** Per-x lower and upper bounds, drawn as a filled envelope. */
  points: { x: number; lo: number; hi: number }[];
  color: string;
}

export interface ChartScatter {
  points: ChartPoint[];
  color: string;
  radius?: number;
}

interface LineChartProps {
  series: ChartSeries[];
  band?: ChartBand;
  scatter?: ChartScatter;
  height?: number;
  formatY?: (value: number) => string;
  formatX?: (value: number) => string;
  /** Extra values the y-range must contain, e.g. a target line. */
  includeY?: number[];
  /** Horizontal reference line, e.g. maintenance calories. */
  referenceY?: { value: number; color: string; label?: string };
  emptyMessage?: string;
}

/** Axis ticks on 1/2/5 × 10^n boundaries, so labels land on round numbers. */
const niceTicks = (min: number, max: number, count: number): number[] => {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const rawStep = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalised = rawStep / magnitude;
  const step = (normalised >= 5 ? 10 : normalised >= 2 ? 5 : normalised >= 1 ? 2 : 1) * magnitude;

  const ticks: number[] = [];
  for (let tick = Math.ceil(min / step) * step; tick <= max + step * 0.001; tick += step) {
    ticks.push(tick);
  }
  return ticks;
};

/**
 * Small SVG line chart.
 *
 * Width is measured with onLayout rather than taken from Dimensions, so the
 * chart fits whatever container it is dropped into — card padding, split
 * layouts, rotation — instead of assuming it owns the full screen. The y-range
 * is derived from the data actually passed in, with a 6% pad so a flat series
 * does not render as a line glued to an edge.
 */
export const LineChart = ({
  series,
  band,
  scatter,
  height = 180,
  formatY = (v) => String(Math.round(v)),
  formatX,
  includeY = [],
  referenceY,
  emptyMessage = 'Not enough data yet',
}: LineChartProps) => {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const allY = [
    ...series.flatMap((s) => s.points.map((p) => p.y)),
    ...(band?.points.flatMap((p) => [p.lo, p.hi]) ?? []),
    ...(scatter?.points.map((p) => p.y) ?? []),
    ...includeY,
    ...(referenceY ? [referenceY.value] : []),
  ];
  const allX = [
    ...series.flatMap((s) => s.points.map((p) => p.x)),
    ...(scatter?.points.map((p) => p.x) ?? []),
  ];

  const hasData = allY.length >= 2 && allX.length >= 2;

  // Left gutter is sized from the widest y label so long values (like a
  // four-digit calorie figure) are never clipped by a fixed inset.
  const yMinRaw = hasData ? Math.min(...allY) : 0;
  const yMaxRaw = hasData ? Math.max(...allY) : 1;
  const pad = (yMaxRaw - yMinRaw) * 0.06 || Math.max(Math.abs(yMaxRaw) * 0.05, 1);
  const yMin = yMinRaw - pad;
  const yMax = yMaxRaw + pad;
  const ticks = hasData ? niceTicks(yMin, yMax, 4) : [];
  const labelChars = Math.max(...ticks.map((t) => formatY(t).length), 1);
  const gutterLeft = labelChars * 7 + space.sm;
  const gutterBottom = formatX ? 18 : 6;

  const xMin = hasData ? Math.min(...allX) : 0;
  const xMax = hasData ? Math.max(...allX) : 1;

  const plotWidth = Math.max(width - gutterLeft - space.sm, 1);
  const plotHeight = Math.max(height - gutterBottom - space.sm, 1);

  const toX = (x: number) =>
    gutterLeft + (xMax === xMin ? plotWidth / 2 : ((x - xMin) / (xMax - xMin)) * plotWidth);
  const toY = (y: number) =>
    space.sm + (yMax === yMin ? plotHeight / 2 : (1 - (y - yMin) / (yMax - yMin)) * plotHeight);

  const linePath = (points: ChartPoint[]) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`).join(' ');

  const bandPath = (points: ChartBand['points']) => {
    if (points.length === 0) return '';
    const upper = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.hi).toFixed(2)}`);
    const lower = [...points]
      .reverse()
      .map((p) => `L${toX(p.x).toFixed(2)},${toY(p.lo).toFixed(2)}`);
    return `${upper.join(' ')} ${lower.join(' ')} Z`;
  };

  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 && hasData ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <React.Fragment key={`tick-${tick}`}>
              <Line
                x1={gutterLeft}
                y1={toY(tick)}
                x2={width - space.sm}
                y2={toY(tick)}
                stroke={colors.border}
                strokeWidth={StyleSheet.hairlineWidth}
              />
              <SvgText
                x={gutterLeft - space.xs}
                y={toY(tick) + 4}
                fontSize={10}
                fill={colors.textFaint}
                textAnchor="end"
              >
                {formatY(tick)}
              </SvgText>
            </React.Fragment>
          ))}

          {band && band.points.length > 1 && (
            <Path d={bandPath(band.points)} fill={band.color} opacity={0.18} />
          )}

          {referenceY && (
            <Line
              x1={gutterLeft}
              y1={toY(referenceY.value)}
              x2={width - space.sm}
              y2={toY(referenceY.value)}
              stroke={referenceY.color}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {scatter?.points.map((point) => (
            <Circle
              key={`dot-${point.x}-${point.y}`}
              cx={toX(point.x)}
              cy={toY(point.y)}
              r={scatter.radius ?? 2}
              fill={scatter.color}
              opacity={0.55}
            />
          ))}

          {series.map((line, index) =>
            line.points.length > 1 ? (
              <Path
                key={`line-${index}`}
                d={linePath(line.points)}
                stroke={line.color}
                strokeWidth={line.strokeWidth ?? 2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null,
          )}

          {formatX && (
            <>
              <SvgText x={gutterLeft} y={height - 4} fontSize={10} fill={colors.textFaint}>
                {formatX(xMin)}
              </SvgText>
              <SvgText
                x={width - space.sm}
                y={height - 4}
                fontSize={10}
                fill={colors.textFaint}
                textAnchor="end"
              >
                {formatX(xMax)}
              </SvgText>
            </>
          )}
        </Svg>
      ) : (
        <View style={styles.empty}>
          <Text style={{ color: colors.textFaint, fontSize: 13 }}>{emptyMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
