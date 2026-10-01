/**
 * Which muscles a movement loads, as shapes on a body.
 *
 * Pure data and pure functions, with no React Native import, so it runs under
 * `environment: 'node'` like the rest of the testable side. The component that
 * draws it cannot be tested here; the table that decides what gets drawn can,
 * and that is where this goes wrong silently — a region nothing matches draws
 * nothing at all and looks like a blank body rather than a bug.
 *
 * The figure is deliberately diagrammatic. Eight hand-drawn movement glyphs
 * already produced two exact mirrors and three that were indistinguishable at
 * size; a front-and-back anatomy with fifteen fillable regions is far more path
 * data to get wrong. At 20px no anatomical detail survives anyway — what has to
 * read is *where on the body* the shading sits.
 */

export const MUSCLE_REGIONS = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'obliques',
  'lats',
  'upper_back',
  'lower_back',
  'traps',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'full_body',
] as const;

export type MuscleRegion = (typeof MUSCLE_REGIONS)[number];

/**
 * `full_body` is the honest default, the way `isolation` is for a movement the
 * model could not place. A stretch or a carry genuinely is whole-body, and a
 * region nobody recognises is better shown as "all of it" than as nothing.
 */
export const normaliseRegion = (raw: unknown): MuscleRegion =>
  typeof raw === 'string' && (MUSCLE_REGIONS as readonly string[]).includes(raw)
    ? (raw as MuscleRegion)
    : 'full_body';

export type BodyView = 'front' | 'back';

/**
 * Which side of the body a region is drawn on.
 *
 * The small map has room for one view, so it shows the side carrying the
 * primary region: a lat pulldown shows a back, a bench press shows a front.
 * Shoulders and forearms exist on both and are drawn on both; `front` is their
 * answer here only because the small map has to pick one.
 */
const BACK_REGIONS: readonly MuscleRegion[] = [
  'traps',
  'upper_back',
  'lats',
  'lower_back',
  'triceps',
  'glutes',
  'hamstrings',
  'calves',
];

export const viewFor = (region: MuscleRegion): BodyView =>
  BACK_REGIONS.includes(region) ? 'back' : 'front';

/**
 * The figure itself, on a 48x96 grid.
 *
 * One silhouette outline per view, then a shape per region placed on it. Every
 * shape is a rounded rectangle or a simple polygon: at the sizes this is drawn
 * the difference between a real deltoid and a rounded box is invisible, and the
 * box is something I can be sure is in the right place.
 */
/** Shared by both views: from the front and the back this figure is the same. */
const BODY_PARTS: string[] = [
  // head
  'M24 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12',
  // neck and torso, shoulders out to the arms, waist in, hips out again
  'M21 14h6v3h6l2 4v12l-2 12v17h-18v-17l-2-12v-12l2-4h6z',
  // legs
  'M16 62h7v31h-7z',
  'M25 62h7v31h-7z',
  // arms
  'M8 19h7v31h-7z',
  'M33 19h7v31h-7z',
];

/**
 * The figure, on a 48x96 grid, built from simple parts rather than one traced
 * path.
 *
 * Separate parts because a single long path is unreadable and I got it wrong
 * the first time: the traced silhouette filled only the top two thirds of the
 * box, so every region sat too high — calves landed at shoulder height. Parts
 * each occupy a stated band of the grid, and the region shapes below are placed
 * against those bands.
 *
 * Bands: head 2-14, shoulders 17-25, chest/upper back 22-33, waist 33-50,
 * hips 50-62, thighs 60-78, lower legs 79-93. Arms run 18-50 down each side.
 */
export const BODY_OUTLINE: Record<BodyView, string[]> = {
  front: BODY_PARTS,
  back: BODY_PARTS,
};

/**
 * Where each region is shaded. Regions absent from a view are simply not drawn
 * on it, which is why `pathsForRegion` takes the view as well.
 */
const REGION_SHAPES: Record<BodyView, Partial<Record<MuscleRegion, string[]>>> = {
  front: {
    shoulders: ['M12 18h7v8h-7z', 'M29 18h7v8h-7z'],
    chest: ['M16 23h7v9h-7z', 'M25 23h7v9h-7z'],
    biceps: ['M9 26h5v11h-5z', 'M34 26h5v11h-5z'],
    forearms: ['M9 38h5v11h-5z', 'M34 38h5v11h-5z'],
    abs: ['M20 33h8v15h-8z'],
    obliques: ['M16 34h3v13h-3z', 'M29 34h3v13h-3z'],
    quads: ['M17 63h5v14h-5z', 'M26 63h5v14h-5z'],
    full_body: ['M15 17h18v45h-18z', 'M16 62h16v31h-16z'],
  },
  back: {
    traps: ['M18 17h12v7h-12z'],
    upper_back: ['M16 24h16v9h-16z'],
    lats: ['M15 31h6v13h-6z', 'M27 31h6v13h-6z'],
    lower_back: ['M19 43h10v9h-10z'],
    shoulders: ['M12 18h7v8h-7z', 'M29 18h7v8h-7z'],
    triceps: ['M9 26h5v11h-5z', 'M34 26h5v11h-5z'],
    forearms: ['M9 38h5v11h-5z', 'M34 38h5v11h-5z'],
    glutes: ['M16 52h16v9h-16z'],
    hamstrings: ['M17 63h5v14h-5z', 'M26 63h5v14h-5z'],
    calves: ['M17 79h5v13h-5z', 'M26 79h5v13h-5z'],
    full_body: ['M15 17h18v45h-18z', 'M16 62h16v31h-16z'],
  },
};

/**
 * The shapes to shade for a region on a view, empty when it is not on that side.
 *
 * Never `undefined`: a caller mapping over this should get nothing to draw
 * rather than a crash, because "this muscle is on the other side" is an
 * ordinary thing to ask.
 */
export const pathsForRegion = (region: MuscleRegion, view: BodyView): string[] =>
  REGION_SHAPES[view][region] ?? [];

/** Human wording for a region, for the legend under the full-size map. */
export const REGION_LABELS: Record<MuscleRegion, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  abs: 'Abs',
  obliques: 'Obliques',
  lats: 'Lats',
  upper_back: 'Upper back',
  lower_back: 'Lower back',
  traps: 'Traps',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  full_body: 'Full body',
};
