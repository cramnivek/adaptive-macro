import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { normalisePattern } from '../ai/exercises';
import { FLOOR_Y, MOVEMENTS, figureAt, repProgress } from '../movementFigure';

interface MovementFigureProps {
  pattern: unknown;
  size?: number;
  /** The body. */
  color: string;
  /** The load, and only the load: it is what the movement moves. */
  accent: string;
  /** The floor and the bench. */
  ground: string;
}

type Point = [number, number];
const line = (...points: Point[]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

/**
 * One rep of the exercise's movement pattern, looping, side on.
 *
 * Drawn every frame from `figureAt`, which keeps every bone its length and the
 * feet planted; the tests on that module are what make it safe to watch. With
 * reduced motion on it holds the far end of the rep — the bottom of the squat,
 * the lockout of the press — which is the position that says the most.
 */
export const MovementFigure = ({ pattern, size = 140, color, accent, ground }: MovementFigureProps) => {
  const movementPattern = normalisePattern(pattern);
  const movement = MOVEMENTS[movementPattern];
  const [progress, setProgress] = useState(1);
  const [still, setStill] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => live && setStill(reduce))
      .catch(() => live && setStill(false));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reduce) => setStill(reduce));
    return () => {
      live = false;
      // Optional: not every platform hands back a subscription to remove.
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (still !== false) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const started = Date.now();
    const tick = () => {
      setProgress(repProgress(Date.now() - started));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [still]);

  const j = figureAt(movementPattern, progress);
  const stroke = { strokeLinecap: 'square' as const, strokeLinejoin: 'miter' as const, fill: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`A figure doing a ${movementPattern}`}>
      <Line x1={4} y1={FLOOR_Y + 2.5} x2={96} y2={FLOOR_Y + 2.5} stroke={ground} strokeWidth={1.5} />
      {movement.prop === 'bench' && (
        <>
          <Rect x={30} y={66.5} width={52} height={4} fill={ground} />
          <Line x1={36} y1={70} x2={36} y2={FLOOR_Y + 2.5} stroke={ground} strokeWidth={2.5} />
          <Line x1={76} y1={70} x2={76} y2={FLOOR_Y + 2.5} stroke={ground} strokeWidth={2.5} />
        </>
      )}

      {/* The far leg, set back so the near one reads as in front. */}
      <Path d={line(j.hip, j.backKnee, j.backAnkle)} stroke={color} strokeWidth={4.5} opacity={0.45} {...stroke} />
      <Path d={line(j.hip, j.shoulder)} stroke={color} strokeWidth={6} {...stroke} />
      <Path d={line(j.hip, j.frontKnee, j.frontAnkle)} stroke={color} strokeWidth={4.5} {...stroke} />
      <Path d={line(j.shoulder, j.elbow, j.hand)} stroke={color} strokeWidth={4} {...stroke} />
      <Circle cx={j.head[0]} cy={j.head[1]} r={5.5} fill={color} />

      {movement.load === 'bar' && (
        // A bar seen end on is its plate.
        <>
          <Circle cx={j.hand[0]} cy={j.hand[1]} r={7} stroke={accent} strokeWidth={3} fill="none" />
          <Circle cx={j.hand[0]} cy={j.hand[1]} r={1.8} fill={accent} />
        </>
      )}
      {movement.load === 'dumbbell' && <Circle cx={j.hand[0]} cy={j.hand[1]} r={4} fill={accent} />}
    </Svg>
  );
};
