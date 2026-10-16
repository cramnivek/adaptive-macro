export const SUPERSET_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  A: { border: '#00E5FF', bg: 'rgba(0, 229, 255, 0.12)', text: '#00E5FF' },
  B: { border: '#FFD600', bg: 'rgba(255, 214, 0, 0.12)', text: '#FFD600' },
  C: { border: '#E040FB', bg: 'rgba(224, 64, 251, 0.12)', text: '#E040FB' },
  D: { border: '#00E676', bg: 'rgba(0, 230, 118, 0.12)', text: '#00E676' },
  E: { border: '#FF9100', bg: 'rgba(255, 145, 0, 0.12)', text: '#FF9100' },
  F: { border: '#7C4DFF', bg: 'rgba(124, 77, 255, 0.12)', text: '#7C4DFF' },
};

export const getSupersetStyle = (group?: string | null) => {
  if (!group) return { border: '#00E5FF', bg: 'rgba(0, 229, 255, 0.12)', text: '#00E5FF' };
  const upper = group.toUpperCase();
  return (
    SUPERSET_COLORS[upper] ?? {
      border: '#00E5FF',
      bg: 'rgba(0, 229, 255, 0.12)',
      text: '#00E5FF',
    }
  );
};

export const nextSupersetLetter = (usedLetters: Iterable<string>): string => {
  const used = new Set(Array.from(usedLetters, (l) => l.toUpperCase()));
  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  return LETTERS.find((l) => !used.has(l)) ?? 'A';
};
