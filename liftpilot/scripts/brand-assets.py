# Builds the LiftPilot brand files the site serves from the Premium pack's branding (brand/premium/): the full logo
# (the wordmark with its emblem and "ELEVATOR DESIGN SOFTWARE") at 1x/2x/3x, the compact lockup for the headers (emblem
# and name without that line, which under 40 px of height is a smudge), the e-mail logo (PNG: every mail client shows
# it), the emblem alone for the application's sidebar, the favicon (16/32/48), the Apple touch icon and the
# 192/512 icons. With --og it also draws the social preview of each language (1200x630) with the landing page's
# headline in Manrope; the previews belong to the landing page, run it when the headline or the look changes.
# Run from liftpilot/: python3 -I scripts/brand-assets.py [--og]
# Needs Pillow with WebP, and for --og fontTools with brotli (to read the site's WOFF2 fonts).
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "premium")
PUB = os.path.join(ROOT, "public")
IMG = os.path.join(PUB, "img")
BG = (3, 10, 17)  # --bg of globals.css
# the sizes on the page (src/lib/brand.ts): the full logo's width (LOGO), the lockup's height (LOGO_COMPACT), the emblem's
LOGO_W, LOCKUP_H, EMBLEM_W = 160, 36, 32
MAIL_W = 480
STANDARDS = "DPR 162/1999 · UNI EN 81-20/50:2020 · UNI 10411-1/-11:2024"


def load(name):
    return Image.open(os.path.join(SRC, name)).convert("RGBA")


def width(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def square(im, size):
    return im.resize((size, size), Image.LANCZOS)


# the wordmark's drawing (emblem, LiftPilot, the line under it) within its 1480x300 canvas, with its glow and a margin
wordmark = load("liftpilot-wordmark.png").crop((48, 53, 841, 242))
# the lockup: the wordmark's emblem (with its glow) and its name, the name centred on the emblem's height and as close
# to it as in the template's workspace brand (32 px emblem, 9 px gap), the line under it left out; 608x188
lockup = Image.new("RGBA", (608, 188), (0, 0, 0, 0))
lockup.alpha_composite(load("liftpilot-wordmark.png").crop((48, 54, 236, 242)), (0, 0))
lockup.alpha_composite(load("liftpilot-wordmark.png").crop((300, 84, 688, 174)), (220, 49))
# the emblem's drawing and glow, square, within its 768 canvas
emblem = load("liftpilot-emblem.png").crop((104, 97, 664, 657))
app_icon = load("liftpilot-app-icon.png")
favicon = load("favicon.png")


def on_bg(im, size):
    """The icon on a full square of the site's background: home screens round it themselves, no transparent corner."""
    t = Image.new("RGBA", (size, size), BG + (255,))
    t.alpha_composite(square(im, size))
    return t.convert("RGB")


def write_site_files():
    os.makedirs(IMG, exist_ok=True)
    for old in os.listdir(IMG):  # the sizes of an earlier logo go with it
        if old.startswith(("liftpilot-logo-", "liftpilot-lockup-", "liftpilot-emblem-")) and old.endswith(".webp"):
            os.remove(os.path.join(IMG, old))
    for k in (1, 2, 3):
        width(wordmark, LOGO_W * k).save(os.path.join(IMG, f"liftpilot-logo-{LOGO_W * k}.webp"), "WEBP", quality=90, method=6, exact=True)
        h = LOCKUP_H * k
        lockup.resize((round(lockup.width * h / lockup.height), h), Image.LANCZOS).save(
            os.path.join(IMG, f"liftpilot-lockup-{h}.webp"), "WEBP", quality=90, method=6, exact=True)
        square(emblem, EMBLEM_W * k).save(os.path.join(IMG, f"liftpilot-emblem-{EMBLEM_W * k}.webp"), "WEBP", quality=90, method=6, exact=True)
    width(wordmark, MAIL_W).save(os.path.join(IMG, f"liftpilot-logo-{MAIL_W}.png"), optimize=True)
    fav = [square(favicon, s) for s in (16, 32, 48)]
    fav[2].save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=fav[:2])
    on_bg(app_icon, 180).save(os.path.join(PUB, "apple-touch-icon.png"), optimize=True)
    for n in (192, 512):
        square(app_icon, n).save(os.path.join(IMG, f"icon-{n}.png"), optimize=True)
    h = round(wordmark.height * LOGO_W / wordmark.width)
    lw = round(lockup.width * LOCKUP_H / lockup.height)
    print(f"brand files written to public/ and public/img/ (logo {LOGO_W}x{h}, lockup {lw}x{LOCKUP_H}, emblem {EMBLEM_W}x{EMBLEM_W})")


# ---- social previews (--og) ----------------------------------------------------------------------------------------

def font(weight, subset, size):
    from fontTools.ttLib import TTFont
    from PIL import ImageFont

    f = TTFont(os.path.join(PUB, "fonts", f"manrope-{weight}-{subset}.woff2"))
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


def draw_line(d, x, y, text, fonts, fill):
    for s, f in runs(text, fonts):
        d.text((x, y), s, font=f, fill=fill)
        x += f.getlength(s)


def social(locale):
    W, H = 1200, 630
    im = Image.new("RGBA", (W, H), BG + (255,))
    grid = ImageDraw.Draw(im)
    for x in range(0, W, 36):  # the blueprint grid of the site, faint
        grid.line([(x, 0), (x, H)], fill=(10, 40, 52, 255))
    for y in range(0, H, 36):
        grid.line([(0, y), (W, y)], fill=(10, 40, 52, 255))
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse((W - 620, -260, W + 220, 420), fill=(6, 32, 43, 255))
    im.alpha_composite(glow.filter(ImageFilter.GaussianBlur(120)))
    lg = width(wordmark, 470)
    im.alpha_composite(lg, (72, 64))
    msgs = json.load(open(os.path.join(ROOT, "messages", f"{locale}.json"), encoding="utf-8"))
    head = msgs["landing"]["h1"].split(":", 1)[-1].strip()
    head = head[:1].upper() + head[1:]
    big = [font(700, "latin", 58), font(700, "cyrillic", 58)]
    small = [font(500, "latin", 24), font(500, "cyrillic", 24)]
    d = ImageDraw.Draw(im)
    y = 120 + lg.height
    for line in wrap(head, big, 1040):
        draw_line(d, 72, y, line, big, (244, 248, 250))
        y += 72
    d.rectangle((72, H - 86, 98, H - 83), fill=(39, 223, 240))
    draw_line(d, 112, H - 98, STANDARDS, small, (158, 178, 189))
    return im.convert("RGB")


write_site_files()
if "--og" in sys.argv[1:]:
    for loc in ("it", "en", "bg"):
        social(loc).save(os.path.join(IMG, f"og-{loc}.png"), optimize=True)
    print("social previews written to public/img/og-*.png")
