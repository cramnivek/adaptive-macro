import { BRAND_WORDMARK } from '../brand';

type BrandStyle = { foreground: string; accent: string };
const paths = new Map<string, Path2D>();
const scaleFor = (px: number) => px * 0.72 / (BRAND_WORDMARK.height - BRAND_WORDMARK.capTop);

/** Vector measurement keeps right-aligned stickers independent of font loading. */
export const brandWordmarkWidth = (px: number): number => BRAND_WORDMARK.width * scaleFor(px);

export const drawBrandWordmark = (
  ctx: CanvasRenderingContext2D, x: number, baseline: number, px: number, style: BrandStyle,
) => {
  const scale = scaleFor(px);
  ctx.save();
  ctx.translate(x, baseline - BRAND_WORDMARK.height * scale);
  ctx.scale(scale, scale);
  for (const shape of BRAND_WORDMARK.shapes) {
    // Lazily create native browser paths: the module is also imported on React
    // Native, while drawing only happens on web or in the card's DOM WebView.
    let path = paths.get(shape.d);
    if (!path) {
      path = new Path2D(shape.d);
      paths.set(shape.d, path);
    }
    ctx.save();
    ctx.translate(shape.x, shape.y);
    ctx.fillStyle = shape.role === 'accent' ? style.accent : style.foreground;
    ctx.fill(path, 'evenodd');
    ctx.restore();
  }
  ctx.restore();
};
