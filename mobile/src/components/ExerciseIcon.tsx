import Svg, { Path } from 'react-native-svg';
import { pathsFor } from '../ai/exerciseIconPaths';

interface ExerciseIconProps {
  pattern: unknown;
  size?: number;
  color: string;
}

/** Draws the glyph for a movement pattern. Unknown patterns get the isolation glyph. */
export const ExerciseIcon = ({ pattern, size = 20, color }: ExerciseIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {pathsFor(pattern).map((d) => (
      <Path
        key={d}
        d={d}
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    ))}
  </Svg>
);
