import artwork from '../assets/brand/artwork.json';

/** Public identity only. Persisted keys and app identifiers keep their original names. */
export const BRAND = {
  fullName: 'Starke Fitness',
  name: 'Stärke',
  wordmark: 'STÄRKE',
  tagline: 'Keep building.',
} as const;

/** One geometry source for native SVG, canvas exports and generated install icons. */
export const BRAND_MARK = artwork.mark;
export const BRAND_WORDMARK = artwork.wordmark;
