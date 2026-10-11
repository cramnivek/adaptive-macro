import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { type Load, type MotionId, type Tone, loadFor, marksFor, repProgress } from '../exerciseMotion';

interface MovementFigureProps {
  motion: MotionId;
  exerciseName: string;
  /** Catalogued equipment, when the name alone does not say what is held. */
  equipment?: string;
  size?: number;
  colours: Record<Tone, string>;
}

const line = (points: [number, number][]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

/**
 * One rep of the exercise, looping.
 *
 * Draws exactly what `marksFor` lists, so the figure on screen is the figure
 * the motion tests and the review contact sheet were checked against. With
 * reduced motion on it holds the far end of the rep, the position that says
 * the most. The caller decides whether there is a motion to draw at all.
 */
export const MovementFigure = ({ motion, exerciseName, equipment, size = 150, colours }: MovementFigureProps) => {
  const load: Load = loadFor(motion, exerciseName, equipment);
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

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityLabel={`A figure doing ${exerciseName}`}>
      {marksFor(motion, progress, load).map((mark, index) =>
        mark.kind === 'path' ? (
          <Path
            key={index}
            d={line(mark.points)}
            stroke={colours[mark.tone]}
            strokeWidth={mark.width}
            strokeLinecap="square"
            strokeLinejoin="miter"
            fill="none"
            opacity={mark.tone === 'far' ? 0.45 : 1}
          />
        ) : mark.ring ? (
          <Circle key={index} cx={mark.at[0]} cy={mark.at[1]} r={mark.r} stroke={colours[mark.tone]} strokeWidth={3} fill="none" />
        ) : (
          <Circle key={index} cx={mark.at[0]} cy={mark.at[1]} r={mark.r} fill={colours[mark.tone]} />
        ),
      )}
    </Svg>
  );
};
