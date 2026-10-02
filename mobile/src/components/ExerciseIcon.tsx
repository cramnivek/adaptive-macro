import Svg, { Path } from 'react-native-svg';
import { pathsFor } from '../ai/exerciseIconPaths';

interface ExerciseIconProps {
  pattern: unknown;
  size?: number;
  color: string;
}

/**
 * Draws the glyph for a movement pattern. Unknown patterns get the isolation glyph.
 *
 * Square caps and mitred joins rather than round ones, and a heavier stroke:
 * these sit on the same slabs as everything else on the training side, and a
 * soft-ended hairline next to a sheared red panel reads as a different app.
 */
export const ExerciseIcon = ({ pattern, size = 20, color }: ExerciseIconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    {pathsFor(pattern).map((d) => (
      <Path
        key={d}
        d={d}
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="square"
        strokeLinejoin="miter"
        fill="none"
      />
    ))}
  </Svg>
);
