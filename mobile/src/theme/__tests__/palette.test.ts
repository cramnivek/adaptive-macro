import { describe, expect, it } from 'vitest';
import { dark, light, type Palette } from '../palette';

/** WCAG 2.1 relative luminance of an #RRGGBB colour. */
const luminance = (hex: string): number => {
  const channel = (value: number): number => {
    const srgb = value / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const int = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((int >> 16) & 0xff) +
    0.7152 * channel((int >> 8) & 0xff) +
    0.0722 * channel(int & 0xff)
  );
};

/** WCAG contrast ratio between two #RRGGBB colours, 1 to 21. */
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const GROUNDS = ['background', 'surface', 'surfaceRaised'] as const satisfies readonly (keyof Palette)[];
const TEXTS = ['text', 'textMuted', 'textFaint'] as const satisfies readonly (keyof Palette)[];
const MARKS = ['protein', 'carbs', 'fat', 'positive', 'warning', 'danger'] as const satisfies readonly (keyof Palette)[];

describe('contrast helper', () => {
  it('scores black on white at 21:1 and a colour against itself at 1:1', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrast('#5B9DFF', '#5B9DFF')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['dark', dark],
  ['light', light],
] as const)('%s palette', (_name, palette) => {
  // Body text. WCAG AA is 4.5:1 below 24px, and nothing in this app's chrome
  // is above 24px except the screen title and the calorie figure.
  it.each(TEXTS.flatMap((text) => GROUNDS.map((ground) => [text, ground] as const)))(
    '%s reads on %s at 4.5:1',
    (text, ground) => {
      expect(contrast(palette[text], palette[ground])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it('onFill reads on both filled controls at 4.5:1', () => {
    expect(contrast(palette.onFill, palette.accent)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.onFill, palette.danger)).toBeGreaterThanOrEqual(4.5);
  });

  // Bar fills and ring strokes are graphics, not text: AA asks 3:1.
  it.each(
    MARKS.flatMap((mark) => (['background', 'surface'] as const).map((ground) => [mark, ground] as const)),
  )('%s shows as a mark on %s at 3:1', (mark, ground) => {
    expect(contrast(palette[mark], palette[ground])).toBeGreaterThanOrEqual(3);
  });

  // The macro colours are told apart by lightness as well as hue, so they stay
  // distinguishable to a red-green colour-blind reader.
  it('separates the three macro colours by lightness', () => {
    const levels = [palette.protein, palette.carbs, palette.fat].map(luminance).sort((a, b) => a - b);
    expect(levels[1] / levels[0]).toBeGreaterThanOrEqual(1.2);
    expect(levels[2] / levels[1]).toBeGreaterThanOrEqual(1.2);
  });
});
