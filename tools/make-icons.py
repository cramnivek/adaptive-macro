"""
Generates the app icon set.

The icons shipped so far were Expo's stock placeholder — a blue chevron on pale
blue with the construction guides still visible in the artwork.

The mark is the calorie ring, which is the one element every screen of this app
already draws and the thing the user actually opens it to look at: a paper
track with the day's progress laid over it in the session red.

A first attempt put a leaning red bar through the middle of the ring, to carry
the session screen's diagonal into the icon. It had to be thrown away — a bar
across a circle is the international prohibition sign, and an icon that says
"banned" on a home screen is worse than a plain one. The diagonal belongs on
the screens, not here.

Everything is drawn at 4x and resampled down, because Pillow does not
antialias its arc primitive.
"""

from PIL import Image, ImageDraw

INK = (10, 10, 11, 255)        # session ground  #0A0A0B
PAPER = (247, 245, 239, 255)   # session figure  #F7F5EF
LOUD = (232, 53, 42, 255)      # session loud    #E8352A

SS = 4          # supersample factor
SIZE = 1024     # final edge length
C = SIZE * SS   # working canvas edge

# Where the filled arc stops. Not a round fraction: a ring sitting exactly at a
# half or three quarters reads as a diagram of a fraction rather than as a day
# in progress.
FILLED_DEGREES = 236


def draw_mark(scale=1.0, track=PAPER, filled=LOUD):
    """The ring alone, on transparency. `scale` fits it into a safe zone."""
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    mid = C / 2
    radius = 300 * SS * scale
    stroke = int(124 * SS * scale)
    box = [mid - radius, mid - radius, mid + radius, mid + radius]

    # PIL measures from three o'clock and sweeps clockwise, so 270 is twelve
    # o'clock — the same place the ring on the Today screen starts.
    start = 270
    end = start + FILLED_DEGREES

    draw.arc(box, start=end, end=start, fill=track, width=stroke)
    draw.arc(box, start=start, end=end, fill=filled, width=stroke)
    return layer


def finish(layer, size, background=None):
    """Flattens onto an optional ground and resamples to the target size."""
    if background is not None:
        base = Image.new("RGBA", (C, C), background)
        base.alpha_composite(layer)
        layer = base
    return layer.resize((size, size), Image.LANCZOS)


OUT = "mobile/assets"  # run from the repo root

# The square icon: full bleed, since iOS applies its own mask.
finish(draw_mark(), SIZE, INK).save(f"{OUT}/icon.png")

# Android masks aggressively, so the foreground lives inside the safe circle
# and the ground is a separate flat layer.
finish(draw_mark(scale=0.58), SIZE).save(f"{OUT}/android-icon-foreground.png")
Image.new("RGBA", (SIZE, SIZE), INK).save(f"{OUT}/android-icon-background.png")

# Themed icons are a single-colour silhouette that Android tints itself, so the
# two arcs have to become one solid ring — a two-tone mark flattened to one
# colour would just be a circle with a seam in it.
finish(draw_mark(scale=0.58, track=PAPER, filled=PAPER), SIZE).save(
    f"{OUT}/android-icon-monochrome.png"
)

finish(draw_mark(scale=0.70), SIZE).save(f"{OUT}/splash-icon.png")
finish(draw_mark(), 64, INK).save(f"{OUT}/favicon.png")

print("wrote icon.png, android-icon-{foreground,background,monochrome}.png, splash-icon.png, favicon.png")
