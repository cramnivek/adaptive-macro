/**
 * The workout logger's own palette.
 *
 * Deliberately not part of `Palette`. The rest of the app is a quiet warm
 * grey, which suits reading columns of numbers, and this screen is the one
 * place that should feel like somewhere else: you are mid-set, holding the
 * phone for two seconds at a time, and the screen needs to read at arm's
 * length and land a hit when a set goes down. Keeping these values in their
 * own module means the loud look physically cannot leak into Today or Trends.
 *
 * Dark in both colour schemes, which is the one deliberate inconsistency in
 * the app. The look is built on a near-black ground; a white version of it
 * is not a quieter version of the same idea, it is a different idea, and
 * maintaining two would mean every tuning decision made twice.
 *
 * Three colours and no more. Ground, figure, and one red — a completed set
 * inverts to red-on-paper rather than acquiring a green tick, because with
 * three colours inversion is the loudest signal available and green belongs
 * on a dashboard, not under a barbell.
 */
export const session = {
  /** Deeper than the app's own background, so entering feels like a move. */
  ground: '#0A0A0B',
  /** A raised surface: input boxes, the picker. */
  panel: '#17171A',
  /** Primary text. */
  figure: '#F7F5EF',
  figureMuted: '#9C9C96',
  figureFaint: '#67676C',
  /**
   * Hotter and more saturated than `danger` (#E06C60) on purpose: here red is
   * the brand rather than a warning, so it has to read as intent.
   */
  loud: '#E8352A',
  onLoud: '#FFFFFF',
  rule: '#26262B',
  warn: '#E8B22A',
} as const;

/**
 * The diagonal. Every slab on this screen leans by exactly this.
 *
 * The lean goes on background layers only — content stays upright. Skewing the
 * text too would be closer to the reference, and would also make a column of
 * weights unreadable, which is the one thing this screen cannot afford.
 */
export const SKEW = '-8deg';
