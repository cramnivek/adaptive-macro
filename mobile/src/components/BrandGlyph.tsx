import Svg, { G, Line, Path, Rect } from 'react-native-svg';

export type BrandGlyphKind = 'meal' | 'sleep' | 'steps' | 'weight' | 'training';

/** Small instrument-like marks, drawn locally so cards never wait for artwork. */
export const BrandGlyph = ({ kind, color, accent = color, size = 24 }: {
  kind: BrandGlyphKind;
  color: string;
  accent?: string;
  size?: number;
}) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <G fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      {kind === 'meal' && <>
        <Path d="M3 10h18v3a9 9 0 0 1-18 0Z" />
        <Line x1={6} y1={6} x2={14} y2={6} />
        <Line x1={18} y1={6} x2={20} y2={6} stroke={accent} strokeWidth={2.3} />
      </>}
      {kind === 'sleep' && <>
        <Path d="M16 3a9 9 0 1 0 4 15A9 9 0 0 1 16 3Z" />
        <Path d="M19 6v3m-1.5-1.5h3" stroke={accent} />
      </>}
      {kind === 'steps' && <>
        <Rect x={3} y={15} width={4} height={6} rx={.6} fill={color} stroke="none" />
        <Rect x={10} y={10} width={4} height={6} rx={.6} fill={color} stroke="none" />
        <Rect x={17} y={5} width={4} height={6} rx={.6} fill={accent} stroke="none" />
      </>}
      {kind === 'weight' && <>
        <Rect x={3} y={3} width={18} height={18} rx={4} />
        <Path d="M8 10a4 4 0 0 1 8 0Z" />
        <Line x1={12} y1={9} x2={13.5} y2={7} stroke={accent} />
      </>}
      {kind === 'training' && <>
        <Rect x={5} y={4} width={4} height={16} rx={1} fill={color} stroke="none" />
        <Rect x={15} y={4} width={4} height={16} rx={1} />
        <Line x1={2} y1={12} x2={22} y2={12} stroke={accent} strokeWidth={2} />
      </>}
    </G>
  </Svg>
);
