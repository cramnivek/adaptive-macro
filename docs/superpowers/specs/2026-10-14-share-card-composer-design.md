# The share card composer

Design, 2026-10-14. What the owner asked for: a card like Hevy's — the figures
on a transparent overlay that can be moved over your own photo, resized, and cut
down to the parts you want. Plus, later, depth: the type passing behind the
person in the picture.

## Where this sits

The card today is one canvas, 1080 × 1920, drawn in one pass: the photo and its
grade, then every piece of type at a fixed place. It is a poster. You can give it
a picture but you cannot say where anything goes, and the type always lands on
top of whoever is in the frame.

## The decision this rests on

**A card you can move has to be a different shape from a card that fills the
frame.** Today's layout is anchored to the edges — wordmark at the head, panel at
the foot, headline a third of the way down. Moving all of that as one block is
meaningless: it already is the frame.

So the card becomes two shapes, and which one you get follows from whether there
is a photo:

- **Poster** — today's card, unchanged, edge to edge. What you get with no photo,
  and still available with one.
- **Sticker** — a compact block holding only what you chose, with the wordmark
  attached to it, placed anywhere over your photo. What you get when you add a
  picture.

This is not a mode switch to explain to anyone. Add a photo and the card becomes
a sticker you can move; remove it and it is a poster again. The toggle between
them is there for the person who wants the poster treatment over their photo
anyway.

## How it is built

Today `drawShareCard(summary, photo)` does everything at once. It splits:

```
drawOverlay(summary, blocks)        → a canvas with a transparent background,
                                      sized to its own content
composeCard(photo, overlay, place)  → the 1080 × 1920 canvas that gets shared
```

Everything follows from that split:

- **Dragging never redraws anything.** The preview is two layers — the photo and
  the overlay — and moving one is a transform, not a repaint. The overlay is
  redrawn only when its *content* changes, which is when a block is toggled.
- **Export is one compose** at full size, from the same numbers the preview used.
- **Depth slots in later** with no further surgery: compose photo, then type,
  then the subject cut out of the photo on top of it. The split is what makes
  that a third draw rather than a rewrite.

### Placement

Held as fractions of the frame, never pixels:

```ts
interface Placement {
  /** The overlay's centre, 0..1 of the frame's width and height. */
  x: number;
  y: number;
  /** 0.6 to 1.4, where 1 is the overlay drawn at its natural size. */
  scale: number;
}
```

Fractions because the preview is about 360 points wide and the export is 1080:
the same numbers have to mean the same thing in both. Clamped so the overlay
can never be dragged more than half-way off the frame — you can tuck it against
an edge, you cannot lose it.

Pure, and therefore tested: `clampPlacement(place, overlaySize, frameSize)`, and
`placementFrom(gesture, …)`. The canvas work is not tested — this project tests
pure modules and the database, not drawing.

### The blocks

Five, each on or off, in a fixed order. The sticker is whatever is left, in that
order, measured to fit:

| Block | What it is | Default |
| --- | --- | --- |
| `title` | PULL #1 / PHASE 1. | on |
| `hero` | the new best, or the weight moved | on |
| `stats` | time · sets · lifted · lifts | on |
| `lifts` | the three named lifts and their best sets | on |
| `climb` | every working set as a bar | on |

Turning everything off leaves the wordmark, which is a legitimate thing to want
over a good photograph. The choice is remembered in settings, like the
post-or-share preference already is: the person who wants only the hero figure
wants it every time.

### What the sticker looks like

The same type, the same red, the same wordmark — it is the poster's content in a
panel rather than spread over a page. One padded block, the panel background the
poster already uses over a photo, with the wordmark along its foot. It is drawn
by the same code paths, so a change to the poster's typography is a change to
both.

## The screen

The finish sheet keeps its shape. The preview grows into the composer:

- the photo fills the preview, the overlay sits on it;
- drag it with one finger, pinch with two;
- a row of five chips under the preview turns blocks on and off;
- RESET puts it back to the middle at natural size;
- CHANGE PHOTO and REMOVE stay where they are.

Dragging is `PanResponder`, which works the same on the web and on a device.
Pinch is two touches tracked by the same responder rather than a gesture library:
one dependency we do not need, and the only gesture is a scale.

## What this does not do

- **No text editing.** The card says what the workout was; a caption is already a
  separate thing that goes with the post.
- **No rotation.** Tilted type on a photo looks like a mistake nine times in ten,
  and the lean the brand already has is doing that job.
- **No filters on the photo** beyond the grade it already gets. A filter is a
  different feature with a different argument behind it.
- **No multiple stickers.** One block, placed once.

## Testing

- Pure: `clampPlacement` at every edge and both scale limits; the block order and
  what an all-off sticker contains; the sticker's measured height for each
  combination.
- By hand, on the owner's phone, because gestures cannot be tested here: drag to
  each corner, pinch to both limits, toggle every block, share, and check the
  shared file matches what the preview showed.

## Afterwards

Depth — the subject segmented out of the photo so the type passes behind them —
is a separate design on top of this one, and the reason this one splits drawing
from composing. The feed showing the composed image is a third, and brings
storage, its policies, and the fact that nothing can filter a photograph.
