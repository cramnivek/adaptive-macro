"""Generate install artwork from the same vector paths used by the app and cards."""

import json
import re
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ARTWORK = json.loads((ROOT / "mobile/assets/brand/artwork.json").read_text(encoding="utf-8"))
MARK = ARTWORK["mark"]
# Artwork equivalents of brand.mark and the session figure in the runtime theme.
RED = (232, 53, 42, 255)
PAPER = (247, 245, 239, 255)
SS = 4
SIZE = 1024
C = SIZE * SS


def contours(path):
    """Flatten the absolute path commands used by our canonical artwork."""
    tokens = re.findall(r"[MLHVQCZ]|-?\d+(?:\.\d+)?", path)
    index = 0
    current = (0, 0)
    start = current
    points = []
    result = []
    while index < len(tokens):
        command = tokens[index]
        index += 1
        count = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6, "Z": 0}[command]
        values = [float(value) for value in tokens[index:index + count]]
        index += count
        if command in ("M", "L"):
            current = tuple(values)
            if command == "M":
                start = current
            points.append(current)
        elif command in ("H", "V"):
            current = (values[0], current[1]) if command == "H" else (current[0], values[0])
            points.append(current)
        elif command in ("Q", "C"):
            x0, y0 = current
            for step in range(1, 17):
                t = step / 16
                u = 1 - t
                if command == "Q":
                    x1, y1, x2, y2 = values
                    point = (u*u*x0 + 2*u*t*x1 + t*t*x2, u*u*y0 + 2*u*t*y1 + t*t*y2)
                else:
                    x1, y1, x2, y2, x3, y3 = values
                    point = (u**3*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t**3*x3,
                             u**3*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t**3*y3)
                points.append(point)
            current = points[-1]
        else:
            result.append(points)
            points = []
            current = start
    return result


def draw_mark(width=520, fill=PAPER):
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    scale = width * SS / MARK["width"]
    left = (C - MARK["width"] * scale) / 2
    top = (C - MARK["height"] * scale) / 2
    for shape in MARK["shapes"]:
        mask = Image.new("L", (C, C))
        draw = ImageDraw.Draw(mask)
        for index, contour in enumerate(contours(shape["d"])):
            points = [(left + (x + shape["x"]) * scale, top + (y + shape["y"]) * scale) for x, y in contour]
            draw.polygon(points, fill=255 if index == 0 else 0)
        layer.alpha_composite(Image.composite(Image.new("RGBA", (C, C), fill), Image.new("RGBA", (C, C)), mask))
    return layer


def finish(layer, size, background=None):
    if background is not None:
        base = Image.new("RGBA", (C, C), background)
        base.alpha_composite(layer)
        layer = base
    return layer.resize((size, size), Image.Resampling.LANCZOS)


def svg(artwork):
    paths = "\n".join(
        f'  <path d="{shape["d"]}" transform="translate({shape["x"]} {shape["y"]})" '
        f'fill="{"#E8352A" if shape["role"] == "accent" else "currentColor"}" fill-rule="evenodd" />'
        for shape in artwork["shapes"]
    )
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {artwork["width"]} {artwork["height"]}">\n{paths}\n</svg>\n'


if __name__ == "__main__":
    assets = ROOT / "mobile/assets"
    public = ROOT / "mobile/public"
    finish(draw_mark(), SIZE, RED).save(assets / "icon.png")
    # The complete dotted mark fits inside Android's central safe circle.
    finish(draw_mark(width=420), SIZE).save(assets / "android-icon-foreground.png")
    Image.new("RGBA", (SIZE, SIZE), RED).save(assets / "android-icon-background.png")
    finish(draw_mark(width=420), SIZE).save(assets / "android-icon-monochrome.png")
    finish(draw_mark(width=600, fill=RED), SIZE).save(assets / "splash-icon.png")
    finish(draw_mark(), 64, RED).save(assets / "favicon.png")
    finish(draw_mark(), 512, RED).save(public / "icon-512.png")
    finish(draw_mark(), 192, RED).save(public / "icon-192.png")
    for name in ("mark", "wordmark"):
        (assets / f"brand/{name}.svg").write_text(svg(ARTWORK[name]), encoding="utf-8")
    print("Wrote Starke app, adaptive, monochrome, splash, favicon and PWA artwork.")
