import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import type { Nutrients, UserProfile } from '@adaptive-macros/engine';
import { computeNutritionQualityScore } from '@adaptive-macros/engine';
import { type ShareCard, titleLines } from '../shareCard';
import { coverRect, sizeForCard } from './depth';
import {
  ALL_BLOCKS,
  type CardBlocks,
  clampPlacement,
  type Placement,
  placementOrigin,
} from '../shareCardPlacement';
import { DEFAULT_TEMPLATE, type TemplateId } from '../shareCardTemplate';
import { font } from '../theme';
import { session as loud } from '../theme/sessionTheme';

export type StickerTheme = 'glass' | 'hud' | 'solid' | 'prism';

/**
 * A finished workout as a story-sized picture, and handing it to the share sheet.
 *
 * Drawn on a canvas in the app's own type and colours, 1080 by 1920 — the
 * shape of an Instagram or WhatsApp story, which is where a workout gets
 * posted. Web only: a native build has no canvas, and shares the same
 * summary as text instead until it has a way to render one.
 *
 * The card leads with one figure and says what it was: a new best if the day
 * made one, otherwise the weight moved. Everything else supports it. At the
 * foot, every working set stands as a bar in the order it was done — the shape
 * of the session, which is different every time and is what makes two cards
 * tell two stories rather than one template twice.
 *
 * It is an overlay: hand it a photo and the type sits over that instead of
 * over the dark ground, which is how anyone actually posts a workout. The
 * middle of the card is deliberately left empty for whoever is in the picture.
 */

const W = 1080;
const H = 1920;
const PAD = 88;
const INNER = W - PAD * 2;

/** Canvas letter-spacing: Chromium and Safari both have it, and where it is missing the assignment is ignored. */
type Tracking = CanvasRenderingContext2D & { letterSpacing: string };

const track = (ctx: CanvasRenderingContext2D, px: number) => {
  (ctx as Tracking).letterSpacing = `${px}px`;
};

/** Text cut to fit a width, with an ellipsis. For names only: a figure is made smaller, never cut. */
const fit = (ctx: CanvasRenderingContext2D, text: string, width: number): string => {
  if (ctx.measureText(text).width <= width) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

/**
 * The record medal, drawn to the left of `right` on the baseline `y`: a gold
 * disc reading PR, the mark the app puts on a record set everywhere else.
 * Returns the width it took, gap included, so the lift's name can be fitted
 * around it. Set in the logger's warn gold, so it reads apart from the red.
 */
const prMedal = (ctx: CanvasRenderingContext2D, right: number, y: number, size: number): number => {
  const r = size / 2;
  const cx = right - r;
  // Centred on the figure's x-height rather than its baseline.
  const cy = y - size * 0.36;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = loud.warn;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.strokeStyle = 'rgba(255, 236, 170, 0.9)';
  ctx.stroke();
  ctx.fillStyle = '#2A1E00';
  ctx.font = `700 ${Math.round(size * 0.38)}px ${font.display}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PR', cx, cy + 1);
  ctx.restore();
  return size + size * 0.4;
};

/**
 * The largest size at which the text still fits the width. Figures are set
 * this way rather than cut: "8,337 lb" shortened to "8,33…" is not a smaller
 * version of the number, it is a wrong one.
 */
const sized = (ctx: CanvasRenderingContext2D, text: string, width: number, family: string, from: number, to: number): number => {
  for (let px = from; px > to; px -= 2) {
    ctx.font = `700 ${px}px ${family}`;
    if (ctx.measureText(text).width <= width) return px;
  }
  return to;
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

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** ASCEND and its three strokes: the one mark that is on every card. */
const wordmark = (ctx: CanvasRenderingContext2D, x: number, y: number, px: number) => {
  ctx.font = `700 ${px}px ${font.display}`;
  track(ctx, px * 0.1);
  ctx.fillStyle = loud.figure;
  ctx.fillText('ASCEND', x, y);
  const after = x + ctx.measureText('ASCEND').width + px * 0.4;
  ctx.fillStyle = loud.loud;
  ctx.fillText('///', after, y);
  track(ctx, 0);
};

/**
 * A lift's name without the equipment it carries in brackets.
 *
 * ARNOLD PRESS (DUMBBELL) is what the line runs out of room for, and a best is
 * a best whichever dumbbell it was on: "ARNOLD PRESS (DUMBBE…" tells nobody
 * anything. Every place the card names a lift drops it, so they agree.
 */
const liftName = (name: string): string => name.replace(/\s*\([^)]*\)\s*$/, '');

/**
 * The one figure the card leads with, and what it was: a new best if the day
 * made one, then the weight moved, then — on a day that was cardio rather than
 * lifting — the distance, then the steps, and sets if the day was none of those.
 * Whatever leads is left out of the row below, so the card never says a number
 * twice.
 */
const heroOf = (summary: ShareCard): { figure: string; label: string; red: boolean } => {
  if (summary.highlight) {
    return { figure: summary.highlight.figure, label: `NEW BEST · ${liftName(summary.highlight.label)}`, red: true };
  }
  if (summary.volume) {
    const cut = summary.volume.lastIndexOf(' ');
    return {
      figure: summary.volume.slice(0, cut),
      label: `${summary.volume.slice(cut + 1).toUpperCase()} MOVED`,
      red: false,
    };
  }
  if (summary.cardioDistanceKm) {
    return { figure: summary.cardioDistanceKm.toFixed(1), label: 'KM COVERED', red: false };
  }
  if (summary.steps) {
    return { figure: `~${summary.steps.toLocaleString('en-US')}`, label: 'STEPS', red: false };
  }
  return { figure: String(summary.sets), label: 'SETS DONE', red: false };
};

/**
 * The picture behind the type, filling the card without being stretched.
 *
 * Graded rather than curtained. Laying bands of black over a photo makes a card
 * you can read and also a card where you can see exactly where each band
 * begins; the picture ends up behind the type rather than with it. So the photo
 * is first taken down as a photographer would — some colour out, a little more
 * contrast, darker overall — which costs it nothing it needed and puts it in
 * the same near-black the rest of the card is built on.
 *
 * Then one even wash, so every part of the frame shares a ground; then a
 * vignette, which is how a picture and the type over it have been made to look
 * like one thing since posters were printed; and only then the lightest
 * possible fall-off at the head and the foot, where the type actually sits.
 * Legibility over a bright photo is carried by the shadow on the type itself,
 * which travels with the letter instead of flattening the picture.
 *
 * `filter` is ignored by Safari before 16.4, the same floor the letter-spacing
 * already asks for. There the photo simply keeps its own colour and the washes
 * below still carry it.
 */
/**
 * How light the picture is, nought to one, by looking at it small.
 *
 * Twenty-four by forty-two is enough to tell a night out from a white wall and
 * costs nothing. A canvas the browser will not let us read — which a photo from
 * another site would make — gives nothing back, and the card then treats it as
 * an ordinary one.
 */
const brightnessOf = (photo: HTMLImageElement): number | null => {
  try {
    const small = document.createElement('canvas');
    small.width = 24;
    small.height = 42;
    const look = small.getContext('2d');
    if (look === null) return null;
    look.drawImage(photo, 0, 0, small.width, small.height);
    const { data } = look.getImageData(0, 0, small.width, small.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
};

const backdrop = (ctx: CanvasRenderingContext2D, photo: HTMLImageElement) => {
  // How hard to work on the picture, from nothing for a photo taken at night to
  // everything for a white wall in daylight. A fixed grade cannot do both: the
  // one that saves the wall crushes the night out into black, which is exactly
  // what it did. An unreadable canvas is treated as an ordinary photo.
  const light = brightnessOf(photo) ?? 0.45;
  const heavy = Math.min(1, Math.max(0, (light - 0.2) / 0.45));

  // The same geometry the cut-out uses, so a person and their own silhouette
  // cannot end up a pixel apart.
  const rect = coverRect(photo, { width: W, height: H });
  ctx.save();
  ctx.filter = `grayscale(${(0.2 + 0.25 * heavy).toFixed(2)}) contrast(${(1.04 + 0.1 * heavy).toFixed(2)}) brightness(${(1 - 0.32 * heavy).toFixed(2)})`;
  ctx.drawImage(photo, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();

  ctx.fillStyle = `rgba(10,10,12,${(0.04 + 0.2 * heavy).toFixed(2)})`;
  ctx.fillRect(0, 0, W, H);

  const vignette = ctx.createRadialGradient(W * 0.52, H * 0.46, H * 0.16, W * 0.52, H * 0.46, H * 0.78);
  vignette.addColorStop(0, 'rgba(8,8,10,0)');
  vignette.addColorStop(0.55, `rgba(8,8,10,${(0.1 + 0.16 * heavy).toFixed(2)})`);
  vignette.addColorStop(1, `rgba(8,8,10,${(0.4 + 0.35 * heavy).toFixed(2)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);

  const top = ctx.createLinearGradient(0, 0, 0, H * 0.52);
  top.addColorStop(0, `rgba(8,8,10,${(0.34 + 0.4 * heavy).toFixed(2)})`);
  top.addColorStop(0.5, `rgba(8,8,10,${(0.14 + 0.2 * heavy).toFixed(2)})`);
  top.addColorStop(1, 'rgba(8,8,10,0)');
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, H * 0.52);

  // The foot carries the panel, so it stays the firmest of the three whatever
  // the exposure — but it starts from nothing, so there is no edge to see.
  const foot = ctx.createLinearGradient(0, H * 0.52, 0, H);
  foot.addColorStop(0, 'rgba(8,8,10,0)');
  foot.addColorStop(0.5, `rgba(8,8,10,${(0.42 + 0.2 * heavy).toFixed(2)})`);
  foot.addColorStop(1, `rgba(8,8,10,${(0.82 + 0.12 * heavy).toFixed(2)})`);
  ctx.fillStyle = foot;
  ctx.fillRect(0, H * 0.52, W, H * 0.48);
};

export const drawShareCard = (summary: ShareCard, photo: HTMLImageElement | null = null): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  // Ground: a near-black that lifts towards the top, so the headline has
  // something behind it, with one red shape cutting across it on the lean.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#18181E');
  sky.addColorStop(0.5, loud.ground);
  sky.addColorStop(1, '#070708');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  if (photo) {
    backdrop(ctx, photo);
    // Over a photo everything drawn from here on carries a soft shadow. A scrim
    // alone cannot be both dark enough for a white wall and light enough to
    // leave the picture visible; the shadow travels with the type instead, so a
    // letter is legible against whatever happens to be directly behind it.
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 3;
  }
  // The quietest grey on the card is a dark one: it reads on the black ground
  // and disappears over a bright photo, so over a photo it lifts a step.
  const faint = photo ? loud.figureMuted : loud.figureFaint;

  // The lean is there to give an empty black card some structure. A photo has
  // its own, and a hard red line ruled across a picture of someone is the
  // opposite of what a photo is for — so over a picture the card goes without
  // it, and the slashes on the wordmark carry the mark instead.
  if (!photo) {
    ctx.save();
    ctx.fillStyle = loud.loud;
    // Faint enough to be a cast of light rather than a red block; the stroke
    // along its edge is what you actually read.
    ctx.globalAlpha = 0.05;
    slab(ctx, 620, 0, 700, 1180, 260);
    ctx.globalAlpha = 0.7;
    // A slab is as wide as `w` less its lean, so a ten-pixel stroke on this lean asks for 270.
    slab(ctx, 620, 0, 270, 1180, 260);
    ctx.restore();
  }

  wordmark(ctx, PAD, 136, 46);

  ctx.textAlign = 'right';
  ctx.font = `600 30px ${font.uiStrong}`;
  track(ctx, 7);
  ctx.fillStyle = loud.figureMuted;
  ctx.fillText(summary.date.toUpperCase(), W - PAD, 132);
  track(ctx, 0);
  ctx.textAlign = 'left';

  ctx.font = `600 34px ${font.uiStrong}`;
  track(ctx, 12);
  ctx.fillStyle = loud.figureMuted;
  ctx.fillText('WORKOUT DONE', PAD, 300);
  track(ctx, 0);

  // The title, as big as it will go.
  const lines = titleLines(summary.title);
  const lineWidth = (line: { text: string }[], px: number): number => {
    ctx.font = `700 ${px}px ${font.display}`;
    return line.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
  };
  let title = 164;
  while (title > 64 && lines.some((line) => lineWidth(line, title) > INNER)) title -= 4;

  let y = 330 + title;
  lines.forEach((line, i) => {
    let at = PAD;
    for (const part of line) {
      ctx.font = `700 ${title}px ${font.display}`;
      ctx.fillStyle = part.red ? loud.loud : loud.figure;
      // One long word cannot be made to fit by shrinking alone. A title is a
      // name rather than a figure, so at the smallest size it is cut rather
      // than left to run off the edge of the card.
      const text = fit(ctx, part.text, W - PAD - at);
      ctx.fillText(text, at, y);
      at += ctx.measureText(text).width;
    }
    if (i < lines.length - 1) y += title * 0.94;
  });

  // One hero figure: the new best if the day made one, else the weight moved.
  const hero = heroOf(summary);
  // Measured from the last line of the title, so one- and two-line cards breathe the same.
  y += 180;
  const heroPx = sized(ctx, hero.figure, INNER, font.display, 168, 80);
  ctx.font = `700 ${heroPx}px ${font.display}`;
  ctx.fillStyle = hero.red ? loud.loud : loud.figure;
  ctx.fillText(hero.figure, PAD, y);
  y += 54;
  ctx.font = `600 32px ${font.uiStrong}`;
  track(ctx, 10);
  ctx.fillStyle = loud.figureMuted;
  ctx.fillText(fit(ctx, hero.label, INNER), PAD, y);
  track(ctx, 0);

  // The rest of the day across one row, each figure as wide as it needs to be,
  // and never a figure the hero has already said.
  const lifting = summary.sets > 0;
  const lifts = summary.exercises.length + summary.more;
  const stats: [string, string][] = [['TIME', summary.duration]];
  if (lifting && hero.label !== 'SETS DONE') stats.push(['SETS', String(summary.sets)]);
  if (hero.red && summary.volume) stats.push(['LIFTED', summary.volume]);
  if (summary.cardioDistanceKm && hero.label !== 'KM COVERED') {
    stats.push(['DIST', `${summary.cardioDistanceKm.toFixed(1)} km`]);
  }
  if (summary.steps && hero.label !== 'STEPS') {
    stats.push(['STEPS', `~${summary.steps.toLocaleString('en-US')}`]);
  }
  // Counting the treadmill as a lift would be a lie, and the panel below names
  // what was done anyway, so the count is only there on a day that lifted.
  if (lifting) stats.push([lifts === 1 ? 'LIFT' : 'LIFTS', String(lifts)]);

  const gap = 52;
  const cellWidth = (label: string, value: string, px: number): number => {
    ctx.font = `700 ${px}px ${font.display}`;
    const figure = ctx.measureText(value).width;
    ctx.font = `600 28px ${font.uiStrong}`;
    track(ctx, 8);
    const under = ctx.measureText(label).width;
    track(ctx, 0);
    return Math.max(figure, under);
  };
  let statPx = 76;
  const rowWidth = (px: number): number =>
    stats.reduce((sum, [label, value]) => sum + cellWidth(label, value, px), 0) + gap * (stats.length - 1);
  while (statPx > 40 && rowWidth(statPx) > INNER) statPx -= 2;

  y += 88;
  let x = PAD;
  stats.forEach(([label, value], i) => {
    ctx.font = `700 ${statPx}px ${font.display}`;
    ctx.fillStyle = loud.figure;
    ctx.fillText(value, x, y);
    ctx.font = `600 28px ${font.uiStrong}`;
    track(ctx, 8);
    ctx.fillStyle = faint;
    ctx.fillText(label, x, y + 46);
    track(ctx, 0);
    const cell = cellWidth(label, value, statPx);
    if (i < stats.length - 1) {
      // Over a photo the app's own hairline disappears; a little of the type's colour does not.
      ctx.fillStyle = photo ? 'rgba(247,245,239,0.22)' : loud.rule;
      ctx.fillRect(x + cell + gap / 2 - 1, y - statPx + 8, 2, statPx + 38);
    }
    x += cell + gap;
  });

  // The lifts, and the shape of the session, in one panel at the foot. The
  // summary carries six for the text version; three of them are named here and
  // the rest are counted, because a story card is not a log.
  const NAMED = 3;
  const rows = summary.exercises.slice(0, NAMED);
  const unnamed = summary.more + Math.max(0, summary.exercises.length - NAMED);
  const bottom = H - 150;
  const panelH = 40 + 34 + rows.length * 110 + (unnamed > 0 ? 50 : 0) + 50 + 118 + 40;
  const top = bottom - panelH;
  // Over a photo the panel keeps a little of it, so the card reads as one
  // picture rather than a black box dropped on someone's shoulder.
  ctx.fillStyle = photo ? 'rgba(14,14,17,0.82)' : loud.panel;
  roundRect(ctx, PAD, top, INNER, panelH, 30);
  ctx.fill();
  ctx.strokeStyle = loud.rule;
  ctx.lineWidth = 2;
  roundRect(ctx, PAD, top, INNER, panelH, 30);
  ctx.stroke();

  const left = PAD + 36;
  const right = W - PAD - 36;
  const panelInner = right - left;
  y = top + 74;
  ctx.font = `600 28px ${font.uiStrong}`;
  track(ctx, 10);
  ctx.fillStyle = faint;
  // A day of nothing but cardio has no lifts to head a list with.
  ctx.fillText(lifting ? (rows.length === 1 ? 'TOP LIFT' : 'TOP LIFTS') : 'WHAT YOU DID', left, y);
  track(ctx, 0);

  for (const exercise of rows) {
    y += 76;
    ctx.font = `500 38px ${font.figure}`;
    ctx.fillStyle = loud.figure;
    ctx.textAlign = 'right';
    ctx.fillText(exercise.best, right, y);
    let best = ctx.measureText(exercise.best).width;
    if (exercise.pr) best += prMedal(ctx, right - best - 16, y, 40) + 16;
    ctx.textAlign = 'left';
    ctx.font = `600 42px ${font.uiStrong}`;
    ctx.fillText(fit(ctx, liftName(exercise.name).toUpperCase(), panelInner - best - 40), left, y);
    ctx.font = `400 28px ${font.ui}`;
    ctx.fillStyle = faint;
    // Cardio is not counted in sets, so it says what it was instead: outside, or
    // on a machine.
    const under = exercise.isCardio
      ? (exercise.detail ?? '').toUpperCase()
      : `${exercise.sets} ${exercise.sets === 1 ? 'SET' : 'SETS'}`;
    if (under !== '') ctx.fillText(under, left, y + 36);
    y += 34;
  }

  if (unnamed > 0) {
    y += 50;
    ctx.font = `600 28px ${font.uiStrong}`;
    track(ctx, 8);
    ctx.fillStyle = faint;
    ctx.fillText(lifting ? `+ ${unnamed} MORE ${unnamed === 1 ? 'LIFT' : 'LIFTS'}` : `+ ${unnamed} MORE`, left, y);
    track(ctx, 0);
  }

  y += 50;
  ctx.font = `600 28px ${font.uiStrong}`;
  track(ctx, 10);
  ctx.fillStyle = faint;
  ctx.fillText('THE CLIMB', left, y);
  ctx.textAlign = 'right';
  ctx.fillText('EVERY SET, IN ORDER', right, y);
  ctx.textAlign = 'left';
  track(ctx, 0);

  // Every working set, in order, as tall as it was heavy. The lift that moved
  // the most is red, so the block of work the day was really about shows at a
  // glance and no two cards carry the same shape.
  const floor = top + panelH - 40;
  if (summary.climb.length > 0) {
    // Few sets stay a tight cluster rather than spreading into a wide comb.
    const step = Math.min(38, panelInner / summary.climb.length);
    const barW = Math.max(3, Math.min(26, step * 0.7));
    summary.climb.forEach((bar, i) => {
      const h = 14 + bar.height * 86;
      ctx.fillStyle = bar.top ? loud.loud : faint;
      ctx.fillRect(left + i * step, floor - h, barW, h);
    });
  }

  wordmark(ctx, PAD, H - 68, 34);
  ctx.textAlign = 'right';
  ctx.font = `600 28px ${font.uiStrong}`;
  track(ctx, 10);
  ctx.fillStyle = faint;
  ctx.fillText('KEEP ASCENDING.', W - PAD, H - 68);
  track(ctx, 0);
  ctx.textAlign = 'left';

  return canvas;
};

/**
 * A picture from the phone to put the card over.
 *
 * A file input is the one picker every browser has, and on a phone it offers
 * the camera roll and the camera itself. Web only, like the card.
 *
 * It says which way it ended, because the three endings need three different
 * things from the screen above: a picture, silence, or a sentence. A phone
 * photograph is often HEIC, which plenty of browsers cannot decode — and a
 * picture that cannot be opened must not look the same as one that was never
 * chosen, which is precisely how this read as simply broken.
 */
export type PickedPhoto =
  | { ok: true; image: HTMLImageElement }
  | { ok: false; why: 'cancelled' | 'unreadable' };

export const pickCardPhoto = (): Promise<PickedPhoto> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve({ ok: false, why: 'cancelled' });
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // Out of sight, but laid out. A file input that is `display: none` cannot be
    // opened at all on several phone browsers — the tap does nothing and nothing
    // says why — so it is parked off-screen instead, which every one of them
    // allows.
    input.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(input);
    const done = (how: PickedPhoto) => {
      input.remove();
      resolve(how);
    };
    // Closing the picker without choosing fires `cancel` and never `change`;
    // without this the promise would simply never settle.
    input.addEventListener('cancel', () => done({ ok: false, why: 'cancelled' }));
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        done({ ok: false, why: 'cancelled' });
        return;
      }
      const original = new Image();
      const originalUrl = URL.createObjectURL(file);
      original.src = originalUrl;
      original.onerror = () => {
        URL.revokeObjectURL(originalUrl);
        done({ ok: false, why: 'unreadable' });
      };
      original.onload = () => {
        // Shrunk once, here, to the size that covers the card. A 48-megapixel
        // iPhone photograph is about 190 MB decoded, and the card draws its
        // photo again for the preview, the backdrop, the file and every layout
        // change; on an iPhone that ran past the memory Safari gives a page, and
        // an installed app that does is simply reloaded, so choosing a photo
        // closed the card. A camera-roll picture becomes about 2560 x 1920.
        const size = sizeForCard(original, { width: W, height: H });
        if (size.width === original.naturalWidth && size.height === original.naturalHeight) {
          // Already small enough; the card draws from it more than once, so its
          // address is kept rather than let go after the first load.
          done({ ok: true, image: original });
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d');
        if (ctx === null) {
          done({ ok: true, image: original });
          return;
        }
        ctx.drawImage(original, 0, 0, size.width, size.height);
        canvas.toBlob(
          (blob) => {
            // Safari holds canvas memory until a canvas is resized to nothing.
            canvas.width = 0;
            canvas.height = 0;
            if (blob === null) {
              // Could not re-encode: the full-size picture still works, so use it.
              done({ ok: true, image: original });
              return;
            }
            URL.revokeObjectURL(originalUrl);
            const image = new Image();
            image.src = URL.createObjectURL(blob);
            image.onload = () => done({ ok: true, image });
            image.onerror = () => done({ ok: false, why: 'unreadable' });
          },
          'image/jpeg',
          0.92,
        );
      };
    });
    input.click();
  });
};

/**
 * The card as a file, ready before any tap so sharing can happen inside one.
 * A card over a photo is written as a JPEG — the same picture as a PNG is
 * several megabytes, which is slow to hand to a share sheet — and a card that
 * is flat colour and type stays a PNG, which is smaller and sharper.
 */
/** The photograph alone, graded as the card grades it: the composer's backdrop. */
export const drawBackdrop = (photo: HTMLImageElement): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  backdrop(canvas.getContext('2d') as CanvasRenderingContext2D, photo);
  return canvas;
};

/**
 * A drawn card as a file, ready before any tap so sharing can happen inside
 * one. A card over a photograph is written as a JPEG — the same picture as a
 * PNG is several megabytes — and a card that is flat colour and type stays a
 * PNG, which is smaller and sharper.
 */
export const cardFileFrom = async (
  canvas: HTMLCanvasElement,
  title: string,
  overPhoto: boolean,
): Promise<{ file: File; url: string } | null> => {
  const type = overPhoto ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) return null;
  const stem = title.replace(/[^\w-]+/g, '-').toLowerCase() || 'workout';
  const name = `${stem}.${overPhoto ? 'jpg' : 'png'}`;
  return { file: new File([blob], name, { type }), url: URL.createObjectURL(blob) };
};

export const shareCardFile = async (
  summary: ShareCard,
  photo: HTMLImageElement | null = null,
): Promise<{ file: File; url: string } | null> => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  // The card's faces must be loaded, or the canvas falls back to a system one.
  // Asked for by name: a canvas never starts a font loading, and `ready` only
  // waits for loads already under way.
  await Promise.all(
    [font.ui, font.uiStrong, font.figure, font.display].map((face) =>
      document.fonts?.load(`40px ${face}`).catch(() => undefined),
    ),
  );
  return cardFileFrom(drawShareCard(summary, photo), summary.title, photo !== null);
};

/**
 * The fonts the card is drawn in, loaded before anything draws.
 *
 * A canvas never starts a font loading and `document.fonts.ready` only waits
 * for loads already under way, so they are asked for by name. Without this the
 * card falls back to a system face, which is the whole look gone.
 */
export const cardFontsReady = async (): Promise<void> => {
  if (typeof document === 'undefined') return;
  await Promise.all(
    [font.ui, font.uiStrong, font.figure, font.display].map((face) =>
      document.fonts?.load(`40px ${face}`).catch(() => undefined),
    ),
  );
};

const asText = (summary: ShareCard): string => {
  const meta: string[] = [summary.duration];
  if (summary.sets > 0) meta.push(`${summary.sets} ${summary.sets === 1 ? 'set' : 'sets'}`);
  if (summary.volume) meta.push(summary.volume);
  if (summary.cardioDistanceKm && summary.cardioDistanceKm > 0) meta.push(`${summary.cardioDistanceKm.toFixed(1)} km`);
  if (summary.steps && summary.steps > 0) meta.push(`~${summary.steps.toLocaleString()} steps`);

  return [
    `${summary.title} — ${summary.date}`,
    meta.join(' · '),
    ...summary.exercises.map((e) =>
      e.isCardio ? `${e.name}: ${e.best}${e.detail ? ` (${e.detail})` : ''}` : `${e.name}: ${e.best}${e.pr ? ' (PR)' : ''}`,
    ),
  ].join('\n');
};

/**
 * Hands the card to the system share sheet; on a browser without file
 * sharing — most desktops — it downloads instead. Call straight from the tap:
 * a browser only opens the share sheet for one.
 */
export const shareWorkout = async (
  summary: ShareCard,
  card: { file?: File | Blob | null; url: string } | null,
): Promise<'shared' | 'downloaded' | 'cancelled'> => {
  // 1. Native iOS & Android support with expo-sharing
  if (Platform.OS !== 'web') {
    if (card && card.url) {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          let localUri = card.url;
          const targetPath = `${FileSystem.cacheDirectory ?? ''}ascend-workout-card.jpg`;

          if (card.url.startsWith('file:')) {
            localUri = card.url;
          } else if (card.url.startsWith('data:')) {
            const base64Data = card.url.split(',')[1] ?? card.url;
            await FileSystem.writeAsStringAsync(targetPath, base64Data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            localUri = targetPath;
          } else if (card.url.startsWith('http')) {
            const downloaded = await FileSystem.downloadAsync(card.url, targetPath);
            localUri = downloaded.uri;
          }

          await Sharing.shareAsync(localUri, {
            mimeType: 'image/jpeg',
            dialogTitle: summary.title,
            UTI: 'public.jpeg',
          });
          return 'shared';
        }
      } catch {
        // Fall back to text share if native image sharing fails or was cancelled
      }
    }
    await Share.share({ message: asText(summary) });
    return 'shared';
  }

  // 2. Web browser share sheet or download fallback
  if (card === null) {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: summary.title, text: asText(summary) });
        return 'shared';
      } catch {
        return 'cancelled';
      }
    }
    return 'cancelled';
  }

  const data = card.file ? { files: [card.file as File], title: summary.title } : null;
  if (data && typeof navigator !== 'undefined' && navigator.canShare?.(data)) {
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
  link.download = card.file && 'name' in card.file ? (card.file as File).name : 'ascend-workout-card.jpg';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'downloaded';
};

/* ---------------------------------------------------------------------------
 * The overlay: the card as a block you put where you like, in the shape you
 * chose. Four layouts share the type, the figures and the rule that no number
 * is said twice; what they do not share is what they are for.
 * ------------------------------------------------------------------------ */

/** Taller than any overlay can be; the drawn part is cut out of it afterwards. */
const SCRATCH_H = 2400;

/** A sticker is always over a picture, so its quiet type always takes the lighter grey. */
const faint = loud.figureMuted;

/**
 * The day's figures, minus whatever the hero has already said.
 *
 * The hero may be turned off — then there is nothing above repeating anything
 * and every figure comes back, which is the only way a card without a headline
 * still says what was moved.
 */
const statCells = (summary: ShareCard, blocks: CardBlocks): [string, string][] => {
  const lifting = summary.sets > 0;
  const lifts = summary.exercises.length + summary.more;
  const hero = blocks.hero ? heroOf(summary) : null;
  const cells: [string, string][] = [['TIME', summary.duration]];
  if (lifting && hero?.label !== 'SETS DONE') cells.push(['SETS', String(summary.sets)]);
  if (summary.volume && (hero === null || hero.red)) cells.push(['LIFTED', summary.volume]);
  if (summary.cardioDistanceKm && hero?.label !== 'KM COVERED') {
    cells.push(['DIST', `${summary.cardioDistanceKm.toFixed(1)} km`]);
  }
  if (summary.steps && hero?.label !== 'STEPS') {
    cells.push(['STEPS', `~${summary.steps.toLocaleString('en-US')}`]);
  }
  // Counting the treadmill as a lift would be a lie, and the panel below names
  // what was done anyway, so the count is only there on a day that lifted.
  if (lifting) cells.push([lifts === 1 ? 'LIFT' : 'LIFTS', String(lifts)]);
  return cells;
};

/**
 * The figures across one row, each as wide as it needs to be, shrinking until
 * the row fits. Returns how far below the baseline it reached, so a layout that
 * has something underneath knows where it is.
 */
const statRow = (
  ctx: CanvasRenderingContext2D,
  cells: [string, string][],
  x: number,
  baseline: number,
  width: number,
  cap: number,
): { px: number; under: number } => {
  const labelPx = Math.max(16, Math.round(cap * 0.4));
  const gap = Math.max(22, Math.round(cap * 0.68));
  const cell = (label: string, value: string, px: number): number => {
    ctx.font = `700 ${px}px ${font.display}`;
    const figure = ctx.measureText(value).width;
    ctx.font = `600 ${labelPx}px ${font.uiStrong}`;
    track(ctx, 6);
    const under = ctx.measureText(label).width;
    track(ctx, 0);
    return Math.max(figure, under);
  };
  const row = (px: number): number =>
    cells.reduce((sum, [label, value]) => sum + cell(label, value, px), 0) + gap * (cells.length - 1);
  let px = cap;
  while (px > cap * 0.5 && row(px) > width) px -= 2;

  let at = x;
  for (const [label, value] of cells) {
    ctx.font = `700 ${px}px ${font.display}`;
    ctx.fillStyle = loud.figure;
    ctx.fillText(value, at, baseline);
    ctx.font = `600 ${labelPx}px ${font.uiStrong}`;
    track(ctx, 6);
    ctx.fillStyle = faint;
    ctx.fillText(label, at, baseline + labelPx * 1.5);
    track(ctx, 0);
    at += cell(label, value, px) + gap;
  }
  return { px, under: labelPx * 1.5 };
};

/** How wide the wordmark comes out, for the layouts that hang it off the right. */
const wordmarkWidth = (ctx: CanvasRenderingContext2D, px: number): number => {
  ctx.font = `700 ${px}px ${font.display}`;
  track(ctx, px * 0.1);
  const width = ctx.measureText('ASCEND').width + px * 0.4 + ctx.measureText('///').width;
  track(ctx, 0);
  return width;
};

/**
 * The title, set as big as it fits, in the two lines the summary broke it into.
 * Returns the baseline it finished on.
 */
const titleAt = (
  ctx: CanvasRenderingContext2D,
  summary: ShareCard,
  left: number,
  right: number,
  top: number,
  cap: number,
  floor: number,
): number => {
  const lines = titleLines(summary.title);
  const lineWidth = (line: { text: string }[], px: number): number => {
    ctx.font = `700 ${px}px ${font.display}`;
    return line.reduce((sum, part) => sum + ctx.measureText(part.text).width, 0);
  };
  let px = cap;
  while (px > floor && lines.some((line) => lineWidth(line, px) > right - left)) px -= 2;
  let y = top;
  lines.forEach((line, i) => {
    y += px;
    let at = left;
    for (const part of line) {
      ctx.font = `700 ${px}px ${font.display}`;
      ctx.fillStyle = part.red ? loud.loud : loud.figure;
      const text = fit(ctx, part.text, right - at);
      ctx.fillText(text, at, y);
      at += ctx.measureText(text).width;
    }
    if (i < lines.length - 1) y += px * 0.06;
  });
  return y;
};

/* --- BLOCK: the whole workout, in a panel ------------------------------- */

/** Wide enough to hold a two-line title at a size worth reading, narrow enough to move. */
const BLOCK_W = 760;
const BLOCK_PAD = 44;
const BLOCK_INNER = BLOCK_W - BLOCK_PAD * 2;

const drawBlock = (ctx: CanvasRenderingContext2D, summary: ShareCard, blocks: CardBlocks): number => {
  const left = BLOCK_PAD;
  const right = BLOCK_W - BLOCK_PAD;
  let y = BLOCK_PAD;

  if (blocks.title) y = titleAt(ctx, summary, left, right, y, 118, 44) + 18;

  if (blocks.hero) {
    const hero = heroOf(summary);
    const px = sized(ctx, hero.figure, BLOCK_INNER, font.display, 118, 56);
    y += px;
    ctx.font = `700 ${px}px ${font.display}`;
    ctx.fillStyle = hero.red ? loud.loud : loud.figure;
    ctx.fillText(hero.figure, left, y);
    y += 38;
    ctx.font = `600 24px ${font.uiStrong}`;
    track(ctx, 8);
    ctx.fillStyle = faint;
    ctx.fillText(fit(ctx, hero.label, BLOCK_INNER), left, y);
    track(ctx, 0);
    y += 20;
  }

  if (blocks.stats) {
    const cells = statCells(summary, blocks);
    y += 50 + 18;
    const { under } = statRow(ctx, cells, left, y, BLOCK_INNER, 50);
    y += under + 22;
  }

  if (blocks.lifts && summary.exercises.length > 0) {
    for (const exercise of summary.exercises.slice(0, 3)) {
      y += 42;
      ctx.font = `500 28px ${font.figure}`;
      ctx.fillStyle = loud.figure;
      ctx.textAlign = 'right';
      ctx.fillText(exercise.best, right, y);
      let best = ctx.measureText(exercise.best).width;
      if (exercise.pr) best += prMedal(ctx, right - best - 12, y, 30) + 12;
      ctx.textAlign = 'left';
      ctx.font = `600 30px ${font.uiStrong}`;
      ctx.fillText(fit(ctx, liftName(exercise.name).toUpperCase(), BLOCK_INNER - best - 24), left, y);
      const under = exercise.isCardio
        ? (exercise.detail ?? '').toUpperCase()
        : `${exercise.sets} ${exercise.sets === 1 ? 'SET' : 'SETS'}`;
      if (under !== '') {
        ctx.font = `400 20px ${font.ui}`;
        ctx.fillStyle = faint;
        ctx.fillText(under, left, y + 24);
      }
      y += 24;
    }
    y += 16;
  }

  if (blocks.climb && summary.climb.length > 0) {
    y += 12;
    const step = Math.min(26, BLOCK_INNER / summary.climb.length);
    const barW = Math.max(3, Math.min(18, step * 0.7));
    const tall = 64;
    summary.climb.forEach((bar, i) => {
      const h = 10 + bar.height * tall;
      ctx.fillStyle = bar.top ? loud.loud : faint;
      ctx.fillRect(left + i * step, y + tall + 10 - h, barW, h);
    });
    y += tall + 10 + 16;
  }

  y += 34;
  wordmark(ctx, left, y, 26);
  return y + BLOCK_PAD - 8;
};

/* --- BAR: the day in a line, along an edge ------------------------------ */

const BAR_W = 1000;
const BAR_PAD = 40;
const BAR_INNER = BAR_W - BAR_PAD * 2;

const drawBar = (ctx: CanvasRenderingContext2D, summary: ShareCard, blocks: CardBlocks): number => {
  const left = BAR_PAD;
  const right = BAR_W - BAR_PAD;
  let y = BAR_PAD;

  // The title runs as one line here however the summary broke it: a bar two
  // lines deep is not a bar.
  if (blocks.title) {
    const parts = titleLines(summary.title).flat();
    let px = 60;
    const width = (at: number): number => {
      ctx.font = `700 ${at}px ${font.display}`;
      return parts.reduce((sum, part) => sum + ctx.measureText(`${part.text} `).width, 0);
    };
    while (px > 34 && width(px) > BAR_INNER) px -= 2;
    y += px;
    let at = left;
    for (const part of parts) {
      ctx.font = `700 ${px}px ${font.display}`;
      ctx.fillStyle = part.red ? loud.loud : loud.figure;
      const text = fit(ctx, `${part.text} `, right - at);
      ctx.fillText(text, at, y);
      at += ctx.measureText(text).width;
    }
    y += 16;
  }

  if (blocks.hero) {
    const hero = heroOf(summary);
    const mark = wordmarkWidth(ctx, 26);
    const room = BAR_INNER - mark - 48;
    // Smaller than the block's figure on purpose: the label stands beside it
    // here rather than under it, and a figure set to the full height of the
    // strip leaves that label an ellipsis.
    const px = sized(ctx, hero.figure, room * 0.55, font.display, 84, 44);
    y += px;
    ctx.font = `700 ${px}px ${font.display}`;
    ctx.fillStyle = hero.red ? loud.loud : loud.figure;
    ctx.fillText(hero.figure, left, y);
    const figure = ctx.measureText(hero.figure).width;
    // The label sits beside the figure rather than under it, and the mark holds
    // the far end: a bar is read left to right and has no room to stack.
    ctx.font = `600 22px ${font.uiStrong}`;
    track(ctx, 8);
    ctx.fillStyle = faint;
    // What it was rather than which lift it was on, for the room: NEW BEST
    // beside the figure, where the full label would end in an ellipsis.
    ctx.fillText(fit(ctx, hero.label.split(' · ')[0], room - figure - 24), left + figure + 24, y);
    track(ctx, 0);
    wordmark(ctx, right - mark, y, 26);
    y += 18;
  }

  if (blocks.stats) {
    const cells = statCells(summary, blocks);
    y += 46 + 14;
    const { under } = statRow(ctx, cells, left, y, BAR_INNER, 46);
    y += under;
  }

  // Nothing but the title: the mark has not been drawn yet, and a bar with one
  // word in it is a caption rather than a card.
  if (!blocks.hero) {
    const mark = wordmarkWidth(ctx, 26);
    wordmark(ctx, right - mark, y, 26);
  }
  return y + BAR_PAD;
};

/* --- TAG: a stamp in the corner ----------------------------------------- */

const TAG_W = 420;
const TAG_PAD = 34;
const TAG_INNER = TAG_W - TAG_PAD * 2;

const drawTag = (ctx: CanvasRenderingContext2D, summary: ShareCard, blocks: CardBlocks): number => {
  const left = TAG_PAD;
  let y = TAG_PAD;

  if (blocks.title) {
    ctx.font = `600 24px ${font.uiStrong}`;
    track(ctx, 8);
    ctx.fillStyle = faint;
    y += 24;
    ctx.fillText(fit(ctx, summary.title.toUpperCase(), TAG_INNER), left, y);
    track(ctx, 0);
    y += 16;
  }

  if (blocks.hero) {
    const hero = heroOf(summary);
    const px = sized(ctx, hero.figure, TAG_INNER, font.display, 88, 40);
    y += px;
    ctx.font = `700 ${px}px ${font.display}`;
    ctx.fillStyle = hero.red ? loud.loud : loud.figure;
    ctx.fillText(hero.figure, left, y);
    y += 30;
    ctx.font = `600 20px ${font.uiStrong}`;
    track(ctx, 6);
    ctx.fillStyle = faint;
    // What it was, not which lift it was on: a stamp this size has room for
    // NEW BEST and no room at all for NEW BEST · INCLINE BENCH PR…
    ctx.fillText(fit(ctx, hero.label.split(' · ')[0], TAG_INNER), left, y);
    track(ctx, 0);
    y += 14;
  }

  y += 24;
  wordmark(ctx, left, y, 22);
  return y + TAG_PAD - 6;
};

/* --- FIGURE: no panel, the type on the photograph itself ---------------- */

const FIGURE_W = 920;

const drawFigure = (ctx: CanvasRenderingContext2D, summary: ShareCard, blocks: CardBlocks): number => {
  let y = 0;

  if (blocks.title) y = titleAt(ctx, summary, 0, FIGURE_W, y, 132, 56) + 12;

  if (blocks.hero) {
    const hero = heroOf(summary);
    const px = sized(ctx, hero.figure, FIGURE_W, font.display, 156, 64);
    y += px;
    ctx.font = `700 ${px}px ${font.display}`;
    ctx.fillStyle = hero.red ? loud.loud : loud.figure;
    ctx.fillText(hero.figure, 0, y);
    y += 42;
    ctx.font = `600 28px ${font.uiStrong}`;
    track(ctx, 10);
    ctx.fillStyle = faint;
    ctx.fillText(fit(ctx, hero.label, FIGURE_W), 0, y);
    track(ctx, 0);
    y += 16;
  }

  if (blocks.stats) {
    const cells = statCells(summary, blocks);
    y += 62 + 20;
    const { under } = statRow(ctx, cells, 0, y, FIGURE_W, 62);
    y += under;
  }

  y += 44;
  wordmark(ctx, 0, y, 28);
  return y + 14;
};

interface Layout {
  /** The overlay's width, in the card's own units. */
  width: number;
  /** Draws from the top-left of the scratch and says how tall it came out. */
  body: (ctx: CanvasRenderingContext2D, summary: ShareCard, blocks: CardBlocks) => number;
  /** The corner radius of the ground behind the type, or null for no ground. */
  panel: number | null;
}

const LAYOUTS: Record<TemplateId, Layout> = {
  block: { width: BLOCK_W, body: drawBlock, panel: 36 },
  bar: { width: BAR_W, body: drawBar, panel: 28 },
  tag: { width: TAG_W, body: drawTag, panel: 30 },
  figure: { width: FIGURE_W, body: drawFigure, panel: null },
};

/**
 * The overlay, on nothing.
 *
 * Drawn with a transparent ground so it can be laid over a photograph and
 * moved, which is the whole point of it: a layer that moves must not carry its
 * own background around with it.
 *
 * It is drawn onto a canvas taller than it could ever need and then cut down to
 * what was used, because the ground behind the type has to be drawn before the
 * type and its height is not known until afterwards. Measuring everything twice
 * would be the alternative, and twice as much to keep in step.
 */
export const drawOverlay = (
  summary: ShareCard,
  blocks: CardBlocks = ALL_BLOCKS,
  template: TemplateId = DEFAULT_TEMPLATE,
  theme: StickerTheme = 'glass',
): HTMLCanvasElement => {
  const layout = LAYOUTS[template];
  const scratch = document.createElement('canvas');
  scratch.width = layout.width;
  scratch.height = SCRATCH_H;
  const ctx = scratch.getContext('2d') as CanvasRenderingContext2D;
  const height = Math.min(SCRATCH_H, Math.max(1, layout.body(ctx, summary, blocks)));

  const overlay = document.createElement('canvas');
  overlay.width = layout.width;
  overlay.height = height;
  const out = overlay.getContext('2d') as CanvasRenderingContext2D;

  if (theme !== 'hud' && layout.panel !== null) {
    const r = layout.panel;
    if (theme === 'glass') {
      out.fillStyle = 'rgba(13, 14, 18, 0.76)';
      roundRect(out, 0, 0, layout.width, height, r);
      out.fill();

      // Top specular rim
      const rim = out.createLinearGradient(0, 0, 0, 48);
      rim.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
      out.strokeStyle = rim;
      out.lineWidth = 1.5;
      roundRect(out, 1, 1, layout.width - 2, height - 2, r - 1);
      out.stroke();
    } else if (theme === 'solid') {
      out.fillStyle = '#0B0C0E';
      roundRect(out, 0, 0, layout.width, height, r);
      out.fill();

      out.strokeStyle = 'rgba(247, 245, 239, 0.12)';
      out.lineWidth = 2;
      roundRect(out, 1, 1, layout.width - 2, height - 2, r - 1);
      out.stroke();
    } else if (theme === 'prism') {
      out.fillStyle = 'rgba(14, 15, 20, 0.9)';
      roundRect(out, 0, 0, layout.width, height, r);
      out.fill();

      const borderGrad = out.createLinearGradient(0, 0, layout.width, height);
      borderGrad.addColorStop(0, '#FF3B30');
      borderGrad.addColorStop(0.5, '#FF5E3A');
      borderGrad.addColorStop(1, '#FF9500');
      out.strokeStyle = borderGrad;
      out.lineWidth = 3;
      roundRect(out, 1.5, 1.5, layout.width - 3, height - 3, r - 1);
      out.stroke();
    }
  }

  out.drawImage(scratch, 0, 0, layout.width, height, 0, 0, layout.width, height);
  return overlay;
};

/**
 * Draws a transparent sticker for daily nutrition quality and macros.
 */
export const drawNutritionOverlay = (
  consumed: Nutrients,
  profile: UserProfile,
  theme: StickerTheme = 'glass',
): HTMLCanvasElement => {
  const width = BLOCK_W;
  const pad = 44;
  const inner = width - pad * 2;
  const scratch = document.createElement('canvas');
  scratch.width = width;
  scratch.height = 1000;
  const ctx = scratch.getContext('2d') as CanvasRenderingContext2D;

  const quality = computeNutritionQualityScore(consumed, profile.sex, profile.age);

  let y = pad;

  // Header wordmark
  wordmark(ctx, pad, y + 26, 26);
  y += 56;

  // Big score
  ctx.font = `700 84px ${font.display}`;
  ctx.fillStyle = loud.figure;
  ctx.fillText(String(quality.score), pad, y + 68);
  const scoreW = ctx.measureText(String(quality.score)).width;

  ctx.font = `700 30px ${font.display}`;
  ctx.fillStyle = loud.loud;
  ctx.fillText(`/100 · ${quality.grade.toUpperCase()}`, pad + scoreW + 16, y + 42);

  ctx.font = `600 20px ${font.uiStrong}`;
  track(ctx, 6);
  ctx.fillStyle = faint;
  ctx.fillText('NUTRITION QUALITY INDEX', pad + scoreW + 16, y + 70);
  track(ctx, 0);

  y += 106;

  // Macros row
  const cells: [string, string][] = [
    ['PROTEIN', `${Math.round(consumed.proteinG)}g`],
    ['CARBS', `${Math.round(consumed.carbsG)}g`],
    ['FAT', `${Math.round(consumed.fatG)}g`],
  ];
  if (consumed.fiberG && consumed.fiberG > 0) {
    cells.push(['FIBER', `${Math.round(consumed.fiberG)}g`]);
  }
  if (consumed.kcal > 0) {
    cells.push(['KCAL', `${Math.round(consumed.kcal)}`]);
  }

  const { under } = statRow(ctx, cells, pad, y + 36, inner, 46);
  y += under + 50;

  // Highlight badge
  if (quality.highlights.length > 0) {
    ctx.font = `600 22px ${font.uiStrong}`;
    track(ctx, 2);
    ctx.fillStyle = loud.loud;
    ctx.fillText('✓ ' + quality.highlights[0].toUpperCase(), pad, y + 10);
    track(ctx, 0);
    y += 34;
  }

  y += pad;

  const height = y;
  const overlay = document.createElement('canvas');
  overlay.width = width;
  overlay.height = height;
  const out = overlay.getContext('2d') as CanvasRenderingContext2D;

  if (theme !== 'hud') {
    const r = 36;
    if (theme === 'glass') {
      out.fillStyle = 'rgba(13, 14, 18, 0.76)';
      roundRect(out, 0, 0, width, height, r);
      out.fill();

      const rim = out.createLinearGradient(0, 0, 0, 48);
      rim.addColorStop(0, 'rgba(255, 255, 255, 0.25)');
      rim.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
      out.strokeStyle = rim;
      out.lineWidth = 1.5;
      roundRect(out, 1, 1, width - 2, height - 2, r - 1);
      out.stroke();
    } else if (theme === 'solid') {
      out.fillStyle = '#0B0C0E';
      roundRect(out, 0, 0, width, height, r);
      out.fill();

      out.strokeStyle = 'rgba(247, 245, 239, 0.12)';
      out.lineWidth = 2;
      roundRect(out, 1, 1, width - 2, height - 2, r - 1);
      out.stroke();
    } else if (theme === 'prism') {
      out.fillStyle = 'rgba(14, 15, 20, 0.9)';
      roundRect(out, 0, 0, width, height, r);
      out.fill();

      const borderGrad = out.createLinearGradient(0, 0, width, height);
      borderGrad.addColorStop(0, '#FF3B30');
      borderGrad.addColorStop(0.5, '#FF5E3A');
      borderGrad.addColorStop(1, '#FF9500');
      out.strokeStyle = borderGrad;
      out.lineWidth = 3;
      roundRect(out, 1.5, 1.5, width - 3, height - 3, r - 1);
      out.stroke();
    }
  }

  out.drawImage(scratch, 0, 0, width, height, 0, 0, width, height);
  return overlay;
};

export interface StickerExport {
  file: File;
  url: string;
  blob: Blob;
  width: number;
  height: number;
}

// Files and Blobs cannot cross the DOM bridge; the native app only needs the PNG and its size.
export type NativeStickerExport = Pick<StickerExport, 'url' | 'width' | 'height'>;

export const exportStickerCanvas = async (
  canvas: HTMLCanvasElement,
  title: string,
): Promise<StickerExport | null> => {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  const stem = title.replace(/[^\w-]+/g, '-').toLowerCase() || 'ascend-sticker';
  const name = `${stem}-sticker.png`;
  const file = new File([blob], name, { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  return { file, url, blob, width: canvas.width, height: canvas.height };
};

export const copyStickerToClipboard = async (blob: Blob): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      return true;
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  }
  return false;
};

export const shareStickerPng = async (
  title: string,
  sticker: StickerExport | NativeStickerExport,
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> => {
  if (Platform.OS !== 'web') {
    try {
      if (!(await Sharing.isAvailableAsync()) || !FileSystem.cacheDirectory) return 'failed';
      let localUri = sticker.url;
      const targetPath = `${FileSystem.cacheDirectory ?? ''}${title.replace(/[^\w-]+/g, '-').toLowerCase()}-sticker.png`;
      if (sticker.url.startsWith('data:')) {
        const base64Data = sticker.url.split(',')[1] ?? sticker.url;
        await FileSystem.writeAsStringAsync(targetPath, base64Data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        localUri = targetPath;
      }
      await Sharing.shareAsync(localUri, {
        mimeType: 'image/png',
        dialogTitle: `${title} Sticker`,
        UTI: 'public.png',
      });
      return 'shared';
    } catch {
      return 'failed';
    }
  }

  if (!('file' in sticker)) return 'failed';
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [sticker.file] })) {
    try {
      await navigator.share({
        files: [sticker.file],
        title: `${title} Sticker`,
      });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  const link = document.createElement('a');
  link.href = sticker.url;
  link.download = sticker.file.name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  return 'downloaded';
};

/**
 * The photograph, graded as the card always grades it, with the overlay put
 * where it was left. The file that gets shared.
 */
export const composeCard = (
  photo: HTMLImageElement,
  overlay: HTMLCanvasElement,
  place: Placement,
  subject: HTMLCanvasElement | null = null,
): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  backdrop(ctx, photo);

  const legal = clampPlacement(place, overlay, { width: W, height: H });
  const { left, top } = placementOrigin(legal, overlay, { width: W, height: H });
  // The same shadow the poster's type carries, for the same reason: the block
  // has to sit on whatever happens to be behind it.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 6;
  ctx.drawImage(overlay, left, top, overlay.width * legal.scale, overlay.height * legal.scale);

  // The person, last, over the type that was over the picture. That order is
  // the whole of the depth: a headline disappearing behind a shoulder reads as
  // somewhere the words are, rather than something stuck on the front. The
  // cut-out is the photograph ungraded, so the subject keeps the light the
  // background has given up.
  if (subject !== null) {
    ctx.shadowColor = 'transparent';
    ctx.drawImage(subject, 0, 0, W, H);
  }
  return canvas;
};
