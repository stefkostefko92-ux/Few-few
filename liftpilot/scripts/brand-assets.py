# Builds every LiftPilot brand file the site serves from the one source logo (brand/liftpilot-logo.webp):
# the logo for the top bar and the e-mails, the icons (favicon, Apple touch, 192/512) from its emblem, and the
# social preview of each language (1200x630) with the landing page's headline in IBM Plex Sans.
# Run from liftpilot/ after the logo or the headline changes: python3 scripts/brand-assets.py
# Needs Pillow and fontTools with brotli (to read the site's WOFF2 fonts).
import io
import json
import os

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, "public")
IMG = os.path.join(PUB, "img")
NAVY, NAVY_2 = (7, 13, 26), (15, 35, 80)
STANDARDS = "DPR 162/1999 · UNI EN 81-20 · UNI EN 81-50 · UNI 10411-1"

src = Image.open(os.path.join(ROOT, "brand", "liftpilot-logo.webp")).convert("RGBA")
logo = src.crop(src.getchannel("A").point(lambda v: 255 if v > 4 else 0).getbbox())
# the emblem (building, car and ring) ends just before the "L" of the word mark
emblem = src.crop((8, 0, 568, src.height))
emblem = emblem.crop(emblem.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox())


def width(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def tile(size, pad):
    """The emblem on a navy rounded square: legible on light and dark tabs and home screens alike."""
    t = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.22), fill=255)
    t.paste(Image.new("RGBA", (size, size), NAVY + (255,)), (0, 0), mask)
    inner = size * (1 - 2 * pad)
    s = inner / max(emblem.size)
    em = emblem.resize((max(1, round(emblem.width * s)), max(1, round(emblem.height * s))), Image.LANCZOS)
    t.alpha_composite(em, ((size - em.width) // 2, (size - em.height) // 2))
    return t


def font(weight, subset, size):
    f = TTFont(os.path.join(PUB, "fonts", f"plex-sans-{weight}-{subset}.woff2"))
    f.flavor = None
    buf = io.BytesIO()
    f.save(buf)
    buf.seek(0)
    return ImageFont.truetype(buf, size), set(f.getBestCmap())


def runs(text, fonts):
    """Splits the text by the first font whose subset has each character (Latin, then Cyrillic)."""
    out = []
    for ch in text:
        f = next((ft for ft, cmap in fonts if ord(ch) in cmap), fonts[0][0])
        if out and out[-1][1] is f:
            out[-1][0] += ch
        else:
            out.append([ch, f])
    return out


def measure(text, fonts):
    return sum(f.getlength(s) for s, f in runs(text, fonts))


def wrap(text, fonts, limit):
    """One line when it fits, else two lines of balanced width."""
    words = text.split()
    if measure(text, fonts) <= limit:
        return [text]
    cuts = [(" ".join(words[:i]), " ".join(words[i:])) for i in range(1, len(words))]
    return list(min(cuts, key=lambda c: max(measure(c[0], fonts), measure(c[1], fonts))))


def draw_centered(d, y, text, fonts, fill, W):
    x = (W - measure(text, fonts)) / 2
    for s, f in runs(text, fonts):
        d.text((x, y), s, font=f, fill=fill)
        x += f.getlength(s)


def social(locale):
    W, H = 1200, 630
    im = Image.new("RGBA", (W, H))
    g = ImageDraw.Draw(im)
    for y in range(H):  # diagonal-ish navy gradient, darker at the top
        k = y / (H - 1)
        g.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * k) for a, b in zip(NAVY, NAVY_2)) + (255,))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W / 2 - 430, 60, W / 2 + 430, 360), fill=(0, 160, 255, 70))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(90)))
    lg = width(logo, 760)
    im.alpha_composite(lg, ((W - lg.width) // 2, 70))
    msgs = json.load(open(os.path.join(ROOT, "messages", f"{locale}.json"), encoding="utf-8"))
    head = msgs["landing"]["h1"].split(":", 1)[-1].strip()
    head = head[:1].upper() + head[1:]
    big = [font(500, "latin", 44), font(500, "cyrillic", 44)]
    small = [font(400, "latin", 24), font(400, "cyrillic", 24)]
    d = ImageDraw.Draw(im)
    y = 120 + lg.height
    for line in wrap(head, big, 1000):
        draw_centered(d, y, line, big, (226, 233, 246), W)
        y += 58
    draw_centered(d, H - 70, STANDARDS, small, (143, 163, 200), W)
    return im.convert("RGB")


os.makedirs(IMG, exist_ok=True)
for w in (120, 240, 360, 720):
    width(logo, w).save(os.path.join(IMG, f"liftpilot-logo-{w}.webp"), "WEBP", quality=90, method=6)
width(logo, 480).save(os.path.join(IMG, "liftpilot-logo-480.png"), optimize=True)
tile(48, 0.05).save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[tile(16, 0.04), tile(32, 0.05)])
tile(180, 0.10).save(os.path.join(PUB, "apple-touch-icon.png"), optimize=True)
for n in (192, 512):
    tile(n, 0.10).save(os.path.join(IMG, f"icon-{n}.png"), optimize=True)
for loc in ("it", "en", "bg"):
    social(loc).save(os.path.join(IMG, f"og-{loc}.png"), optimize=True)
print("brand files written to public/ and public/img/")
