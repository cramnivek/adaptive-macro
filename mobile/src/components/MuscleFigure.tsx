import Svg, { Path } from 'react-native-svg';
import {
  BODY_OUTLINE,
  type BodyView,
  type MuscleRegion,
  pathsForRegion,
} from './muscleMap';

interface MuscleFigureProps {
  view: BodyView;
  primary: MuscleRegion | null;
  secondary: MuscleRegion[];
  size: number;
  outline: string;
  fill: string;
}

/**
 * One side of a body, with the worked muscles shaded.
 *
 * Drawn at 96px in the how-to sheet and nowhere else. At 20px — the picker row
 * and the block header — the same figure renders as a sliver, and chest, abs
 * and biceps become indistinguishable; those keep the movement glyph, which is
 * a mark designed to read at that size. That is not a guess, it is what the two
 * sizes looked like side by side.
 *
 * Secondary muscles are the same shapes at reduced opacity rather than a second
 * colour, so the question the figure answers stays "where", not "how many
 * different things are going on here".
 */
export const MuscleFigure = ({
  view,
  primary,
  secondary,
  size,
  outline,
  fill,
}: MuscleFigureProps) => (
  <Svg width={size / 2} height={size} viewBox="0 0 48 96">
    {BODY_OUTLINE[view].map((d) => (
      <Path key={d} d={d} fill="none" stroke={outline} strokeWidth={1.2} />
    ))}

    {secondary.flatMap((region) =>
      pathsForRegion(region, view).map((d) => (
        <Path key={`${region}:${d}`} d={d} fill={fill} fillOpacity={0.35} />
      )),
    )}

    {primary !== null &&
      pathsForRegion(primary, view).map((d) => (
        <Path key={`primary:${d}`} d={d} fill={fill} fillOpacity={0.95} />
      ))}
  </Svg>
);
