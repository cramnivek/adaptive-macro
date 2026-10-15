import { describe, expect, it } from 'vitest';
import { SUPERSET_COLORS, getSupersetStyle, nextSupersetLetter } from '../superset';

describe('Superset styling and color mappings', () => {
  it('returns distinct styles for group letters A, B, C, D', () => {
    const styleA = getSupersetStyle('A');
    const styleB = getSupersetStyle('B');
    const styleC = getSupersetStyle('C');
    const styleD = getSupersetStyle('D');

    expect(styleA.text).toBe(SUPERSET_COLORS.A.text);
    expect(styleB.text).toBe(SUPERSET_COLORS.B.text);
    expect(styleC.text).toBe(SUPERSET_COLORS.C.text);
    expect(styleD.text).toBe(SUPERSET_COLORS.D.text);

    expect(styleA.text).not.toBe(styleB.text);
    expect(styleB.text).not.toBe(styleC.text);
    expect(styleC.text).not.toBe(styleD.text);
  });

  it('handles lowercase group letters safely', () => {
    const style = getSupersetStyle('a');
    expect(style.text).toBe(SUPERSET_COLORS.A.text);
  });

  it('falls back gracefully on unknown groups or null', () => {
    const styleNull = getSupersetStyle(null);
    const styleUnknown = getSupersetStyle('Z');

    expect(styleNull).toBeDefined();
    expect(styleUnknown).toBeDefined();
    expect(styleNull.border).toBeTruthy();
    expect(styleUnknown.border).toBeTruthy();
  });
});

describe('nextSupersetLetter', () => {
  it('picks A when no groups are used', () => {
    expect(nextSupersetLetter([])).toBe('A');
  });

  it('picks B when A is used', () => {
    expect(nextSupersetLetter(['A'])).toBe('B');
  });

  it('picks first unused letter in sequence', () => {
    expect(nextSupersetLetter(['A', 'B'])).toBe('C');
    expect(nextSupersetLetter(['B'])).toBe('A');
    expect(nextSupersetLetter(['A', 'B', 'C'])).toBe('D');
  });

  it('handles lowercase used letters correctly', () => {
    expect(nextSupersetLetter(['a'])).toBe('B');
  });
});
