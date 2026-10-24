/**
 * The workout logger's own palette.
 *
 * Training retains stronger contrast and larger figures for reading between
 * sets. Its primary red is shared with the rest of Ascend, so entering a
 * workout changes the intensity without changing the brand.
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
import { brand } from './palette';

export const session = {
  /** Deeper than the app's own background, so entering feels like a move. */
  ground: '#0A0A0B',
  /** A raised surface: input boxes, the picker. */
  panel: '#17171A',
  /** Primary text. */
  figure: '#F7F5EF',
  figureMuted: '#9C9C96',
  figureFaint: '#67676C',
  /** Shared primary-action red; warning/error labels keep their own meaning. */
  loud: brand.red,
  onLoud: brand.onRed,
  rule: '#26262B',
  warn: '#E8B22A',
} as const;
