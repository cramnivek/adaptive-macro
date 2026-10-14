import { Platform, Share } from 'react-native';
import type { ShareSummary } from '../shareCard';
import { font } from '../theme';
import { session as loud } from '../theme/sessionTheme';

/**
 * A finished workout as a story-sized picture, and handing it to the share sheet.
 *
 * Drawn on a canvas in the app's own type and colours, 1080 by 1920 — the
 * shape of an Instagram or WhatsApp story, which is where a workout gets
 * posted. Web only: a native build has no canvas, and shares the same
 * summary as text instead until it has a way to render one.
 */

const W = 1080;
const H = 1920;
const PAD = 96;

/** Text cut to fit a width, with an ellipsis, so a long exercise name cannot run into its numbers. */
const fit = (ctx: CanvasRenderingContext2D, text: string, width: number): string => {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

/** A slab leaning the way every primary action in the app leans. */
const slab = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lean: number) => {
  ctx.beginPath();
  ctx.moveTo(x + lean, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - lean, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
};

export const drawShareCard = (summary: ShareSummary): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  ctx.fillStyle = loud.ground;
  ctx.fillRect(0, 0, W, H);

  // The title on the red slab, the loudest thing on the card.
  ctx.fillStyle = loud.figureFaint;
  ctx.font = `600 34px ${font.uiStrong}`;
  ctx.fillText('WORKOUT DONE', PAD, 210);

  ctx.font = `700 120px ${font.display}`;
  const title = fit(ctx, summary.title.toUpperCase(), W - PAD * 2 - 80);
  const titleWidth = Math.min(W - PAD * 2, ctx.measureText(title).width + 110);
  ctx.fillStyle = loud.loud;
  slab(ctx, PAD - 20, 250, titleWidth, 170, 34);
  ctx.fillStyle = loud.onLoud;
  ctx.fillText(title, PAD + 30, 380);

  ctx.fillStyle = loud.figureMuted;
  ctx.font = `400 40px ${font.ui}`;
  ctx.fillText(summary.date, PAD, 500);

  // Three figures across: how long, how many, how much, or cardio metrics.
  const stats: [string, string][] = [['TIME', summary.duration]];
  if (summary.sets > 0) {
    stats.push(['SETS', String(summary.sets)]);
  } else if (summary.steps && summary.steps > 0) {
    stats.push(['STEPS', `~${summary.steps.toLocaleString()}`]);
  }
  if (summary.volume) {
    stats.push(['LIFTED', summary.volume]);
  } else if (summary.cardioDistanceKm && summary.cardioDistanceKm > 0) {
    stats.push(['DIST', `${summary.cardioDistanceKm.toFixed(1)} km`]);
  } else if (summary.sets > 0 && summary.steps && summary.steps > 0 && stats.length < 3) {
    stats.push(['STEPS', `~${summary.steps.toLocaleString()}`]);
  }
  const column = (W - PAD * 2) / Math.max(3, stats.length);
  stats.forEach(([label, value], i) => {
    const x = PAD + column * i;
    ctx.fillStyle = loud.figureFaint;
    ctx.font = `600 30px ${font.uiStrong}`;
    ctx.fillText(label, x, 640);
    ctx.fillStyle = loud.figure;
    ctx.font = `500 58px ${font.figure}`;
    ctx.fillText(fit(ctx, value, column - 24), x, 712);
  });

  let y = 800;
  if (summary.highlight) {
    ctx.strokeStyle = loud.loud;
    ctx.lineWidth = 6;
    ctx.strokeRect(PAD, y, W - PAD * 2, 190);
    ctx.fillStyle = loud.loud;
    ctx.font = `700 30px ${font.display}`;
    ctx.fillText(fit(ctx, `NEW BEST · ${summary.highlight.label}`, W - PAD * 2 - 80), PAD + 40, y + 70);
    ctx.fillStyle = loud.figure;
    ctx.font = `500 72px ${font.figure}`;
    ctx.fillText(summary.highlight.figure, PAD + 40, y + 155);
    y += 260;
  }

  // The lifts, each with its best set or cardio effort.
  ctx.fillStyle = loud.rule;
  ctx.fillRect(PAD, y, W - PAD * 2, 3);
  y += 30;
  for (const exercise of summary.exercises) {
    y += 82;
    ctx.fillStyle = loud.figure;
    ctx.font = `600 42px ${font.uiStrong}`;
    ctx.fillText(fit(ctx, exercise.name, W - PAD * 2 - 330), PAD, y);
    ctx.fillStyle = loud.figure;
    ctx.font = `500 40px ${font.figure}`;
    const best = exercise.best;
    ctx.fillText(best, W - PAD - ctx.measureText(best).width, y);
    ctx.fillStyle = loud.figureFaint;
    ctx.font = `400 30px ${font.ui}`;
    if (!exercise.isCardio) {
      ctx.fillText(`${exercise.sets} ${exercise.sets === 1 ? 'set' : 'sets'}`, PAD, y + 40);
    } else if (exercise.detail) {
      ctx.fillText(exercise.detail, PAD, y + 40);
    }
    y += 40;
  }
  if (summary.more > 0) {
    y += 70;
    ctx.fillStyle = loud.figureFaint;
    ctx.font = `400 34px ${font.ui}`;
    ctx.fillText(`+ ${summary.more} more`, PAD, y);
  }

  ctx.fillStyle = loud.loud;
  slab(ctx, PAD - 10, H - 190, 26, 64, 8);
  ctx.fillStyle = loud.figureMuted;
  ctx.font = `600 34px ${font.uiStrong}`;
  ctx.fillText('Logged with Ascend', PAD + 40, H - 145);

  return canvas;
};

/** The card as a PNG file, ready before any tap so sharing can happen inside one. */
export const shareCardFile = async (summary: ShareSummary): Promise<{ file: File; url: string } | null> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  // The card's faces must be loaded, or the canvas falls back to a system one.
  // Asked for by name: a canvas never starts a font loading, and `ready` only
  // waits for loads already under way.
  await Promise.all(
    [font.ui, font.uiStrong, font.figure, font.display].map((face) =>
      document.fonts?.load(`40px ${face}`).catch(() => undefined),
    ),
  );
  const canvas = drawShareCard(summary);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const file = new File([blob], `${summary.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'workout'}.png`, {
    type: 'image/png',
  });
  return { file, url: URL.createObjectURL(blob) };
};

const asText = (summary: ShareSummary): string => {
  const meta: string[] = [summary.duration];
  if (summary.sets > 0) meta.push(`${summary.sets} ${summary.sets === 1 ? 'set' : 'sets'}`);
  if (summary.volume) meta.push(summary.volume);
  if (summary.cardioDistanceKm && summary.cardioDistanceKm > 0) meta.push(`${summary.cardioDistanceKm.toFixed(1)} km`);
  if (summary.steps && summary.steps > 0) meta.push(`~${summary.steps.toLocaleString()} steps`);

  return [
    `${summary.title} — ${summary.date}`,
    meta.join(' · '),
    ...summary.exercises.map((e) =>
      e.isCardio
        ? `${e.name}: ${e.best}${e.detail ? ` (${e.detail})` : ''}`
        : `${e.name}: ${e.best}`
    ),
  ].join('\n');
};

/**
 * Hands the card to the system share sheet; on a browser without file
 * sharing — most desktops — it downloads instead. Call straight from the tap:
 * a browser only opens the share sheet for one.
 */
export const shareWorkout = async (
  summary: ShareSummary,
  card: { file: File; url: string } | null,
): Promise<'shared' | 'downloaded' | 'cancelled'> => {
  if (Platform.OS !== 'web' || card === null) {
    await Share.share({ message: asText(summary) });
    return 'shared';
  }
  const data = { files: [card.file], title: summary.title };
  if (typeof navigator !== 'undefined' && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch {
      // Closing the share sheet rejects; that is a choice, not a failure.
      return 'cancelled';
    }
  }
  const link = document.createElement('a');
  link.href = card.url;
  link.download = card.file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'downloaded';
};
