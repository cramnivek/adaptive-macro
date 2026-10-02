/**
 * Turning a volume figure into something you can picture.
 *
 * "18,400 kg" is a number nobody has intuition for. The same figure as "about
 * 15 grand pianos" is the part worth being pleased about, which is the whole
 * point of showing it. The comparison is deliberately rounded and hedged with
 * "about" — it is an image, not a measurement, and the exact kilos are printed
 * right beside it for anyone who wants them.
 */
interface Reference {
  kg: number;
  one: string;
  many: string;
}

/**
 * Heaviest first. Each is a round, widely-agreed figure rather than a precise
 * one — the reference only has to be recognisable.
 */
const REFERENCES: Reference[] = [
  { kg: 150_000, one: 'a blue whale', many: 'blue whales' },
  { kg: 12_000, one: 'a double-decker bus', many: 'double-decker buses' },
  { kg: 6_000, one: 'an African elephant', many: 'African elephants' },
  { kg: 1_400, one: 'a small car', many: 'small cars' },
  { kg: 450, one: 'a grand piano', many: 'grand pianos' },
  { kg: 100, one: 'a washing machine', many: 'washing machines' },
];

/**
 * Picks the heaviest reference the volume covers at least once.
 *
 * Returns null below the lightest one: "0.4 washing machines" is not an image,
 * and a first week of training deserves its own figure rather than a
 * comparison that makes it sound like nothing.
 */
export const volumeComparison = (volumeKg: number): string | null => {
  if (!Number.isFinite(volumeKg) || volumeKg <= 0) return null;

  const reference = REFERENCES.find((candidate) => volumeKg >= candidate.kg);
  if (reference === undefined) return null;

  const count = Math.round(volumeKg / reference.kg);
  return count <= 1 ? `about ${reference.one}` : `about ${count} ${reference.many}`;
};
