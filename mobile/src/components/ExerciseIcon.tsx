import Svg, { Path } from 'react-native-svg';
import { pathsFor } from '../ai/exerciseIconPaths';

interface ExerciseIconProps {
  pattern?: unknown;
  isCardio?: boolean;
  size?: number;
  color: string;
}

export const CARDIO_PATHS = ['M2 13h5l2.5-7 4 15 3-8h5.5'];

/**
 * Draws the glyph for a movement pattern or cardio activity.
 *
 * Square caps and mitred joins rather than round ones, and a heavier stroke:
 * these sit on the same slabs as everything else on the training side, and a
 * soft-ended hairline next to a sheared red panel reads as a different app.
 */
export const ExerciseIcon = ({ pattern, isCardio, size = 20, color }: ExerciseIconProps) => {
  const paths = isCardio ? CARDIO_PATHS : pathsFor(pattern);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d) => (
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
};
