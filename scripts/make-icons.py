"""Generates the app and tray icons from the PC Workshop logo.

Run from the repo root: python3 scripts/make-icons.py <path to PCW_LOGO.png>
Outputs build/icon.png (1024), build/icon.ico, build/icon.icns,
resources/tray.ico, resources/tray.png, resources/trayTemplate(@2x).png,
src/renderer/assets/mark.png and src/renderer/assets/logo.png.
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageChops

LOGO = Image.open(sys.argv[1]).convert("RGBA")
GREEN = (98, 165, 49, 255)
FONT = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"


def mark():
    """The 'pc' mark without the Workshop wordmark."""
    img = LOGO.copy()
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            # below the 'c', keep only the green stem of the 'p' (drops the
            # blue 'Workshop' wordmark and its anti-aliased edges)
            if a and y > 290 and not (g > r + 40 and g > b + 40):
                px[x, y] = (0, 0, 0, 0)
    bbox = img.getbbox()
    return img.crop(bbox)


def rounded(size, radius, fill):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size - 1, size - 1), radius, fill=255)
    tile = Image.new("RGBA", (size, size), fill)
    tile.putalpha(m)
    return tile, m


def app_tile(size, radius):
    """White rounded tile: full logo on top, green CARE band underneath."""
    tile, mask = rounded(size, radius, (255, 255, 255, 255))
    band_h = int(size * 0.27)
    band = Image.new("RGBA", (size, band_h), GREEN)
    tile.alpha_composite(band, (0, size - band_h))
    logo = LOGO.copy()
    target_w = int(size * 0.62)
    logo = logo.resize((target_w, int(logo.height * target_w / logo.width)), Image.LANCZOS)
    top_space = size - band_h
    tile.alpha_composite(logo, ((size - logo.width) // 2, (top_space - logo.height) // 2 + int(size * 0.01)))
    d = ImageDraw.Draw(tile)
    font = ImageFont.truetype(FONT, int(band_h * 0.56))
    text = "CARE"
    spacing = int(band_h * 0.09)
    widths = [d.textbbox((0, 0), ch, font=font)[2] for ch in text]
    total = sum(widths) + spacing * (len(text) - 1)
    x = (size - total) // 2
    tb = d.textbbox((0, 0), "C", font=font)
    y = size - band_h + (band_h - (tb[3] - tb[1])) // 2 - tb[1]
    for ch, cw in zip(text, widths):
        d.text((x, y), ch, font=font, fill=(255, 255, 255, 255))
        x += cw + spacing
    # re-apply the rounded mask so the band doesn't poke out of the corners
    alpha = ImageChops.multiply(tile.getchannel("A"), mask)
    tile.putalpha(alpha)
    return tile


# macOS: 824px tile on a 1024 canvas (Apple's icon grid) with a soft shadow.
canvas = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
shadow = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
sd = ImageDraw.Draw(shadow)
sd.rounded_rectangle((100, 112, 924, 936), 185, fill=(0, 0, 0, 70))
from PIL import ImageFilter
shadow = shadow.filter(ImageFilter.GaussianBlur(14))
canvas.alpha_composite(shadow)
tile = app_tile(824, 185)
canvas.alpha_composite(tile, (100, 100))
canvas.save("build/icon.png")
canvas.save("build/icon.icns")

# Windows: nearly full-bleed tile.
win = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
win.alpha_composite(app_tile(984, 150), (20, 20))
win.save("build/icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

# Tray icons.
m = mark()
def fit(img, size, pad):
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    inner = size - 2 * pad
    scale = min(inner / img.width, inner / img.height)
    r = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)
    out.alpha_composite(r, ((size - r.width) // 2, (size - r.height) // 2))
    return out

fit(m, 256, 8).save("resources/tray.ico", sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (48, 48)])
fit(m, 32, 1).save("resources/tray.png")
for name, size in (("trayTemplate.png", 18), ("trayTemplate@2x.png", 36)):
    t = fit(m, size, 1)
    black = Image.new("RGBA", t.size, (0, 0, 0, 255))
    black.putalpha(t.getchannel("A"))
    black.save("resources/" + name)

import os
os.makedirs("src/renderer/assets", exist_ok=True)
fit(m, 128, 4).save("src/renderer/assets/mark.png")
logo = LOGO.copy()
logo.thumbnail((360, 360), Image.LANCZOS)
logo.save("src/renderer/assets/logo.png")
print("ok")
