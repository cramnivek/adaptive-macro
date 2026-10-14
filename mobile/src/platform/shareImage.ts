import { Platform, Share } from 'react-native';
import { type ShareCard, titleLines } from '../shareCard';
import { font } from '../theme';
import { session as loud } from '../theme/sessionTheme';

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
 * The one figure the card leads with, and what it was: a new best if the day
 * made one, then the weight moved, then — on a day that was cardio rather than
 * lifting — the distance, then the steps, and sets if the day was none of those.
 * Whatever leads is left out of the row below, so the card never says a number
 * twice.
 */
const heroOf = (summary: ShareCard): { figure: string; label: string; red: boolean } => {
  if (summary.highlight) {
    // An exercise carries its equipment in brackets — ARNOLD PRESS (DUMBBELL) —
    // and that is the part the line runs out of room for, so it goes first. A
    // best is a best whichever dumbbell it was on, and "ARNOLD PRESS (DUMBBE…"
    // tells nobody anything.
    const lift = summary.highlight.label.replace(/\s*\([^)]*\)\s*$/, '');
    return { figure: summary.highlight.figure, label: `NEW BEST · ${lift}`, red: true };
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

  const scale = Math.max(W / photo.naturalWidth, H / photo.naturalHeight);
  const w = photo.naturalWidth * scale;
  const h = photo.naturalHeight * scale;
  ctx.save();
  ctx.filter = `grayscale(${(0.2 + 0.25 * heavy).toFixed(2)}) contrast(${(1.04 + 0.1 * heavy).toFixed(2)}) brightness(${(1 - 0.32 * heavy).toFixed(2)})`;
  ctx.drawImage(photo, (W - w) / 2, (H - h) / 2, w, h);
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
    const best = ctx.measureText(exercise.best).width;
    ctx.textAlign = 'left';
    ctx.font = `600 42px ${font.uiStrong}`;
    ctx.fillText(fit(ctx, exercise.name.toUpperCase(), panelInner - best - 40), left, y);
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
      const image = new Image();
      // The card is drawn from this image more than once — once for the
      // preview, again for the file, and again whenever the layout changes —
      // and the browser is within its rights to need the source again each
      // time. Letting go of the address as soon as it had loaded was asking
      // for a picture that works once and then does not.
      image.src = URL.createObjectURL(file);
      image.onload = () => done({ ok: true, image });
      image.onerror = () => done({ ok: false, why: 'unreadable' });
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
  const canvas = drawShareCard(summary, photo);
  const type = photo ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.92));
  if (!blob) return null;
  const name = `${summary.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'workout'}.${photo ? 'jpg' : 'png'}`;
  const file = new File([blob], name, { type });
  return { file, url: URL.createObjectURL(blob) };
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
      e.isCardio ? `${e.name}: ${e.best}${e.detail ? ` (${e.detail})` : ''}` : `${e.name}: ${e.best}`,
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
