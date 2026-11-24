"""Italian on-screen text of the mounting video: step cards, part callouts (catalogue numbering, p. 10),
the angle readout, the slide arrow and the cut line, intro and closing cards. Drawn at 2x and reduced."""
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import os

_HERE = os.path.dirname(os.path.abspath(__file__))
# Designed in 1920x1080, drawn at SS times that and reduced to VIDEO_OUT (1920x1080 or 3840x2160).
W, H = 1920, 1080
OW, OH = map(int, os.environ.get("VIDEO_OUT", "1920x1080").split("x"))
SS = 2 if OW <= W else 3
FONT = os.environ.get("VIDEO_FONTS", os.path.join(_HERE, "assets", "fonts")) + os.sep
LOGO = os.path.join(_HERE, "..", "..", "img", "brand", "panev-ascensori-logo.webp")
NAVY, DEEP, ACCENT, WHITE, RED = (22, 40, 98), (16, 29, 73), (143, 176, 255), (255, 255, 255), (229, 72, 77)

from timeline import STEPS as STEP_TIMES, DURATION
from texts import STEP_TEXT, CALLOUTS
STEPS = [(a, b, *txt) for (a, b), txt in zip(STEP_TIMES, STEP_TEXT)]
N_STEPS = len(STEPS)
_fonts = {}


def font(name, size):
    key = (name, size)
    if key not in _fonts:
        _fonts[key] = ImageFont.truetype(f"{FONT}{name}.otf", size * SS)
    return _fonts[key]


def fade(t, a, b, d=0.35):
    if t < a or t >= b:
        return 0.0
    return min(1.0, (t - a) / d, (b - t) / d)


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Canvas:
    def __init__(self):
        self.img = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
        self.shadow = Image.new("RGBA", (W * SS, H * SS), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.ds = ImageDraw.Draw(self.shadow)

    def layer(self, alpha, fn):
        """Draws fn(draw, shadow_draw) on its own layer and merges it at `alpha`."""
        if alpha <= 0:
            return
        lay = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        sh = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        fn(ImageDraw.Draw(lay), ImageDraw.Draw(sh))
        if alpha < 1:
            lay.putalpha(lay.getchannel("A").point(lambda v: int(v * alpha)))
            sh.putalpha(sh.getchannel("A").point(lambda v: int(v * alpha)))
        self.shadow.alpha_composite(sh)
        self.img.alpha_composite(lay)

    def result(self):
        sh = self.shadow.filter(ImageFilter.GaussianBlur(14 * SS))
        out = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        out.alpha_composite(sh)
        out.alpha_composite(self.img)
        return out.resize((OW, OH), Image.LANCZOS)


def s(*v):
    return [x * SS for x in v]


def text_w(txt, f, spacing=0):
    return f.getlength(txt) + spacing * SS * max(0, len(txt) - 1)


def spaced(d, xy, txt, f, fill, spacing):
    x, y = xy
    for ch in txt:
        d.text((x, y), ch, font=f, fill=fill)
        x += f.getlength(ch) + spacing * SS


def wrap(txt, f, width):
    words, lines, cur = [w for w in txt.split(" ") if w], [], ""  # split on plain spaces only: U+00A0 keeps "A + B" together
    for w in words:
        test = f"{cur} {w}".strip()
        if f.getlength(test) <= width * SS:
            cur = test
        else:
            lines.append(cur)
            cur = w
    return lines + [cur]


def step_card(c, t, k, a, b, title, body):
    al = fade(t, a, b, 0.45)
    slide = (1 - ease((t - a) / 0.6)) * 40

    def draw(d, sh):
        x, w = 72, 800
        lines = wrap(body, font("Inter-Regular", 27), w - 120 - font("InterDisplay-Bold", 120).getlength(str(k)) / SS - 40)
        h = 64 + 56 + 14 + len(lines) * 39 + 34
        y = H - 72 - h + slide
        sh.rounded_rectangle(s(x, y + 8, x + w, y + h + 8), 24 * SS, fill=(0, 0, 0, 120))
        d.rounded_rectangle(s(x, y, x + w, y + h), 24 * SS, fill=(*DEEP, 236))
        d.text(s(x + 40, y + 26), str(k), font=font("InterDisplay-Bold", 120), fill=ACCENT)
        tx = x + 40 + font("InterDisplay-Bold", 120).getlength(str(k)) / SS + 30
        spaced(d, s(tx, y + 36), f"PASSO {k} DI {N_STEPS}", font("Inter-SemiBold", 18), (*ACCENT, 255), 3)
        d.text(s(tx, y + 64), title, font=font("InterDisplay-SemiBold", 44), fill=WHITE)
        for i, ln in enumerate(lines):
            d.text(s(tx + 2, y + 64 + 56 + 14 + i * 39), ln, font=font("Inter-Regular", 27), fill=(214, 221, 240, 255))
    c.layer(al, draw)


def header(c, t, k):
    al = fade(t, 4.0, STEPS[-1][1], 0.5)

    def draw(d, sh):
        x, y = 72, 64
        txt = "GUIDA AL MONTAGGIO  ·  STAFFA A 45 175 2 + B 45 320"
        f = font("Inter-SemiBold", 20)
        sh.rounded_rectangle(s(x - 18, y - 14, x + text_w(txt, f, 3) / SS + 18, y + 64), 14 * SS, fill=(0, 0, 0, 90))
        spaced(d, s(x, y), txt, f, (*WHITE, 240), 3)
        for i in range(N_STEPS):
            col = (*WHITE, 255) if i + 1 == k else (*WHITE, 150) if i + 1 < k else (*WHITE, 60)
            d.rounded_rectangle(s(x + i * 40, y + 40, x + i * 40 + 32, y + 46), 3 * SS, fill=col)
    c.layer(al, draw)


def callout(c, t, p, badge, label, a, b, dx, dy):
    if p is None or p[2] <= 0:
        return
    al = fade(t, a, b, 0.4)
    grow = ease((t - a) / 0.5)

    def draw(d, sh):
        px, py = p[0], p[1]
        bx, by = px + dx * grow, py + dy * grow
        d.line(s(px, py, bx, by), fill=(*WHITE, 255), width=3 * SS)
        d.ellipse(s(px - 8, py - 8, px + 8, py + 8), fill=(*WHITE, 255), outline=(*NAVY, 255), width=3 * SS)
        f = font("Inter-SemiBold", 23)
        lw = text_w(label, f) / SS + 32
        side = 1 if dx >= 0 else -1
        r = 26 if badge else 0
        if badge:
            sh.ellipse(s(bx - r, by - r + 4, bx + r, by + r + 4), fill=(0, 0, 0, 140))
            d.ellipse(s(bx - r, by - r, bx + r, by + r), fill=(*NAVY, 255), outline=(*WHITE, 255), width=3 * SS)
            fb = font("Inter-Bold", 24 if len(badge) < 3 else 20)
            d.text(s(bx, by + 1), badge, font=fb, fill=WHITE, anchor="mm")
        x0 = bx + side * (r + 10) if side > 0 else bx - (r + 10) - lw
        sh.rounded_rectangle(s(x0, by - 21 + 4, x0 + lw, by + 21 + 4), 21 * SS, fill=(0, 0, 0, 120))
        d.rounded_rectangle(s(x0, by - 21, x0 + lw, by + 21), 21 * SS, fill=(*WHITE, 250))
        d.text(s(x0 + 16, by + 1), label, font=f, fill=NAVY, anchor="lm")
    c.layer(al, draw)


def dashed(d, a, b, col, width, dash=14, gap=10):
    (x0, y0), (x1, y1) = a, b
    L = math.hypot(x1 - x0, y1 - y0)
    if L < 1:
        return
    ux, uy = (x1 - x0) / L, (y1 - y0) / L
    pos = 0.0
    while pos < L:
        e = min(L, pos + dash)
        d.line(s(x0 + ux * pos, y0 + uy * pos, x0 + ux * e, y0 + uy * e), fill=col, width=width * SS)
        pos = e + gap


def cut_line(c, t, pts):
    """Step 11: the red dashed cut line on plate A, flush with the sill's front edge, until the disc reaches it."""
    a, b = pts.get("cut_a"), pts.get("cut_b")
    if not (a and b) or a[2] <= 0 or b[2] <= 0:
        return
    c.layer(fade(t, 96.3, 98.0, 0.35), lambda d, sh: dashed(d, a[:2], b[:2], (*RED, 255), 5, 16, 9))


def angle_panel(c, t, pts):
    al = fade(t, 75.2, 84.0, 0.4)
    k = ease((t - 76.0) / 3.0)
    val = 5.0 * k

    def draw(d, sh):
        x, y, w, h = W - 72 - 330, 64, 330, 170
        sh.rounded_rectangle(s(x, y + 8, x + w, y + h + 8), 22 * SS, fill=(0, 0, 0, 120))
        d.rounded_rectangle(s(x, y, x + w, y + h), 22 * SS, fill=(*DEEP, 236))
        spaced(d, s(x + 30, y + 26), "REGOLAZIONE ANGOLARE", font("Inter-SemiBold", 17), (*ACCENT, 255), 2.5)
        d.text(s(x + 28, y + 52), f"{val:.1f}°".replace(".", ","), font=font("InterDisplay-Bold", 72), fill=WHITE)
        d.text(s(x + 30, y + 134), "Campo di regolazione ± 7°", font=font("Inter-Medium", 21), fill=(214, 221, 240, 255))
    c.layer(al, draw)


def dimension(c, t, pts):
    al = fade(t, 23.6, 30.0, 0.4)
    if not (pts.get("dim_a") and pts.get("dim_b")):
        return

    def draw(d, sh):
        a, b = pts["dim_a"][:2], pts["dim_b"][:2]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        nx, ny = -math.sin(ang), math.cos(ang)
        L = 60
        for p in (a, b):  # extension lines
            d.line(s(p[0], p[1], p[0] - nx * L, p[1] - ny * L), fill=(*WHITE, 255), width=2 * SS)
        qa = (a[0] - nx * L * 0.8, a[1] - ny * L * 0.8)
        qb = (b[0] - nx * L * 0.8, b[1] - ny * L * 0.8)
        d.line(s(*qa, *qb), fill=(*WHITE, 255), width=3 * SS)
        for p, q in ((qa, qb), (qb, qa)):
            an = math.atan2(p[1] - q[1], p[0] - q[0])
            for sg in (-1, 1):
                e = (p[0] - 14 * math.cos(an + sg * 0.45), p[1] - 14 * math.sin(an + sg * 0.45))
                d.line(s(*p, *e), fill=(*WHITE, 255), width=3 * SS)
    c.layer(al, draw)
    m = [(pts["dim_a"][0] + pts["dim_b"][0]) / 2, (pts["dim_a"][1] + pts["dim_b"][1]) / 2 - 50, 1]
    callout(c, t, m, "", "Distanza soglia di piano – soglia di cabina: 25–32 mm", 23.8, 30.0, 60, -130)


def logo_card(c, x, y, h, alpha=1.0):
    logo = Image.open(LOGO).convert("RGBA")
    lw = round(logo.width * (h - 28) * SS / logo.height)
    logo = logo.resize((lw, (h - 28) * SS), Image.LANCZOS)

    def draw(d, sh):
        sh.rounded_rectangle(s(x, y + 6, x + lw / SS + 40, y + h + 6), 16 * SS, fill=(0, 0, 0, 110))
        d.rounded_rectangle(s(x, y, x + lw / SS + 40, y + h), 16 * SS, fill=(*WHITE, 255))
    c.layer(alpha, draw)
    lay = Image.new("RGBA", c.img.size, (0, 0, 0, 0))
    lay.alpha_composite(logo, (int((x + 20) * SS), int((y + 14) * SS)))
    if alpha < 1:
        lay.putalpha(lay.getchannel("A").point(lambda v: int(v * alpha)))
    c.img.alpha_composite(lay)


def intro(c, t):
    al = fade(t, 0.0, 4.15, 0.6)
    logo_card(c, 96, 96, 96, al)

    def draw(d, sh):
        x, y = 96, 360
        spaced(d, s(x, y), "GUIDA AL MONTAGGIO", font("Inter-SemiBold", 24), (*ACCENT, 255), 5)
        d.text(s(x - 4, y + 44), "Montaggio", font=font("InterDisplay-Bold", 104), fill=WHITE)
        d.text(s(x - 4, y + 160), "in undici passi", font=font("InterDisplay-Bold", 104), fill=WHITE)
        d.text(s(x, y + 304), "Staffa articolata A 45 175 2 + B 45 320", font=font("Inter-Medium", 32), fill=(214, 221, 240, 255))
        d.text(s(x, y + 352), "Regolazione angolare ± 7° · lamiera 5 mm", font=font("Inter-Regular", 26), fill=(184, 196, 228, 255))
    c.layer(al, draw)


def outro(c, t):
    al = fade(t, STEPS[-1][1] + 0.4, DURATION + 0.5, 0.7)

    def draw(d, sh):
        x, y, w, h = 72, H - 72 - 300, 900, 300
        sh.rounded_rectangle(s(x, y + 8, x + w, y + h + 8), 24 * SS, fill=(0, 0, 0, 120))
        d.rounded_rectangle(s(x, y, x + w, y + h), 24 * SS, fill=(*DEEP, 238))
        spaced(d, s(x + 40, y + 34), "MONTAGGIO COMPLETATO", font("Inter-SemiBold", 19), (*ACCENT, 255), 3)
        d.text(s(x + 38, y + 64), "Soglia in bolla, tre staffe bloccate", font=font("InterDisplay-SemiBold", 44), fill=WHITE)
        for i, ln in enumerate(wrap("Sintesi per installatori qualificati: fanno fede i disegni di montaggio del catalogo tecnico e il progetto dell’impianto.",
                                    font("Inter-Regular", 25), w - 80)):
            d.text(s(x + 40, y + 132 + i * 36), ln, font=font("Inter-Regular", 25), fill=(214, 221, 240, 255))
        d.text(s(x + 40, y + 228), "panevascensori.it  ·  Catalogo tecnico 2026, pag. 10", font=font("Inter-SemiBold", 26), fill=WHITE)
    c.layer(al, draw)
    logo_card(c, 72, 64, 84, al)


def frame_overlay(t, pts):
    c = Canvas()
    if t < 4.15:
        intro(c, t)
    k = next((i + 1 for i, (a, b, *_rest) in enumerate(STEPS) if a <= t < b), 0)
    if 4.0 <= t < STEPS[-1][1]:
        header(c, t, k)
    for i, (a, b, title, body) in enumerate(STEPS):
        if a <= t < b:
            step_card(c, t, i + 1, a, b, title, body)
    if 74.0 <= t < 84.0:
        angle_panel(c, t, pts)
    if 21.0 <= t < 30.0:
        dimension(c, t, pts)
    if 96.3 <= t < 98.0:
        cut_line(c, t, pts)
    for name, badge, label, a, b, dx, dy in CALLOUTS:
        if a <= t < b:
            callout(c, t, pts.get(name), badge, label, a, b, dx, dy)
    if t >= STEPS[-1][1]:
        outro(c, t)
    return c.result()


if __name__ == "__main__":
    import json
    import sys
    base, pts_file, t, out = sys.argv[1], sys.argv[2], float(sys.argv[3]), sys.argv[4]
    allpts = json.load(open(pts_file))
    f = str(round(t * 24))
    img = Image.open(base).convert("RGBA").resize((W, H), Image.LANCZOS)
    img.alpha_composite(frame_overlay(t, allpts.get(f, {})))
    img.convert("RGB").save(out)
