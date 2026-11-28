#!/usr/bin/env python3
"""Draws the five "Avviso di fermo impianto" sign templates from scratch.

Everything on the sheets comes from this file: the shapes are drawn by the code, the lettering is
Fira Sans / Fira Sans Condensed (SIL OFL 1.1, @fontsource) and the only photographs are our own 3D
renders (public/img/site/vano-*.webp, bottoniera-*.webp), toned to the colour of each template.
No sample data: the fields for date, address, city, place and the message to the people are empty.

Deterministic: the same bytes at every run (fixed sizes, no timestamps, no random numbers).

    cd rilievi && python3 -I scripts/cartelli/disegna.py [out-dir]

Map coordinates are in "map pixels"; the picture is SCALA times bigger (SCALA = 2 -> A4 at ~300 dpi).
The JSON next to each JPEG keeps the map coordinates, `scala` = SCALA and the new `sha256`.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "assets" / "cartelli"
SCALA = 2
LONG, SHORT = 1750, 1220  # map pixels; A4 with the 14 pt margin of src/cartelli/pdf.ts is ~1.435:1

FONT_DIRS = [
    ROOT / "node_modules" / "@fontsource",
    ROOT / "public" / "fonts",
]


def font_path(family: str, weight: int, style: str = "normal") -> Path:
    name = f"{family}-latin-{weight}-{style}.woff"
    for base in FONT_DIRS:
        for candidate in (base / family / "files" / name, base / name):
            if candidate.exists():
                return candidate
    raise SystemExit(f"font missing: {name}")


def font(family: str, weight: int, size: float, style: str = "normal") -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(font_path(family, weight, style)), max(1, round(size * SCALA)))


COND = "fira-sans-condensed"
SANS = "fira-sans"


def hexrgb(h: str):
    return tuple(int(h[i : i + 2], 16) for i in (1, 3, 5))


def mix(a: str, b: str, t: float) -> str:
    ca, cb = hexrgb(a), hexrgb(b)
    return "#%02x%02x%02x" % tuple(round(x * (1 - t) + y * t) for x, y in zip(ca, cb))


class Sheet:
    def __init__(self, w: int, h: int, bg: str):
        self.w, self.h = w, h
        self.im = Image.new("RGB", (w * SCALA, h * SCALA), bg)
        self.d = ImageDraw.Draw(self.im)

    def px(self, *v):
        return [round(x * SCALA) for x in v]

    def rect(self, x0, y0, x1, y1, fill=None, outline=None, width=1):
        self.d.rectangle(self.px(x0, y0, x1, y1), fill=fill, outline=outline, width=round(width * SCALA))

    def line(self, x0, y0, x1, y1, fill, width=1):
        self.d.line(self.px(x0, y0, x1, y1), fill=fill, width=max(1, round(width * SCALA)))

    def poly(self, pts, fill):
        self.d.polygon([(round(x * SCALA), round(y * SCALA)) for x, y in pts], fill=fill)

    def width(self, text, f, tracking=0.0):
        return (f.getlength(text) + tracking * SCALA * max(0, len(text) - 1)) / SCALA

    def text(self, x, y, text, f, fill, tracking=0.0, anchor="l"):
        """Text with the baseline at y; `tracking` in map pixels, kerning kept."""
        w = self.width(text, f, tracking)
        x0 = x - (w if anchor == "r" else w / 2 if anchor == "m" else 0)
        if not tracking:
            self.d.text((round(x0 * SCALA), round(y * SCALA)), text, font=f, fill=fill, anchor="ls")
            return
        for i, ch in enumerate(text):
            dx = f.getlength(text[:i]) + tracking * SCALA * i
            self.d.text((round(x0 * SCALA + dx), round(y * SCALA)), ch, font=f, fill=fill, anchor="ls")

    def fit(self, text, family, weight, maxw, size, tracking=0.0, style="normal"):
        f = font(family, weight, size, style)
        while self.width(text, f, tracking) > maxw and size > 8:
            size -= 0.5
            f = font(family, weight, size, style)
        return f

    def paste(self, img: Image.Image, x, y):
        self.im.paste(img, (round(x * SCALA), round(y * SCALA)))


def vertical_fade(w: int, h: int, top: int, bottom: int) -> Image.Image:
    """An 'L' mask going linearly from `top` (row 0) to `bottom` (last row)."""
    g = Image.linear_gradient("L").resize((w, h), Image.BILINEAR)  # 0 at the top, 255 at the bottom
    return g.point(lambda v: round(top + (bottom - top) * v / 255))


def photo(sheet: Sheet, name: str, box, dark: str, light: str, focus=(0.5, 0.5), cut=1, fade=None):
    """Our render, cropped to the box (cover), toned between two colours of the template."""
    x0, y0, x1, y1 = box
    bw, bh = round((x1 - x0) * SCALA), round((y1 - y0) * SCALA)
    src = Image.open(ROOT / "public" / "img" / "site" / name).convert("L")
    k = max(bw / src.width, bh / src.height)
    r = src.resize((max(bw, round(src.width * k)), max(bh, round(src.height * k))), Image.LANCZOS)
    cx = min(max(round(focus[0] * r.width - bw / 2), 0), r.width - bw)
    cy = min(max(round(focus[1] * r.height - bh / 2), 0), r.height - bh)
    r = r.crop((cx, cy, cx + bw, cy + bh))
    r = ImageOps.autocontrast(r, cutoff=cut)
    tone = ImageOps.colorize(r, black=dark, white=light)
    if fade:  # (edge, color): the bottom half of the photograph melts into the colour
        edge, color = fade
        assert edge == "bottom"
        n = bh // 2
        mask = Image.new("L", (bw, bh), 0)
        mask.paste(vertical_fade(bw, n, 0, 255), (0, bh - n))
        tone = Image.composite(Image.new("RGB", (bw, bh), color), tone, mask)
    sheet.im.paste(tone, (round(x0 * SCALA), round(y0 * SCALA)))


def prohibition(sheet: Sheet, cx, cy, radius, ink: str, gap: str, icon=True):
    """The 'forbidden' sign, drawn here: ring, a lift door pictogram and the slash. Antialiased by 4x."""
    S = 4
    size = round(2 * radius * SCALA)
    big = size * S
    layer = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    c = big / 2
    R = big / 2 - S
    d.ellipse((c - R, c - R, c + R, c + R), fill=hexrgb(ink) + (255,))
    d.ellipse((c - R * 0.82, c - R * 0.82, c + R * 0.82, c + R * 0.82), fill=(0, 0, 0, 0))
    if icon:
        # the lift: a frame with the two doors
        w, h = R * 0.56, R * 0.86
        t = R * 0.07
        x0, y0, x1, y1 = c - w / 2, c - h / 2 + R * 0.06, c + w / 2, c + h / 2 + R * 0.06
        d.rectangle((x0, y0, x1, y1), outline=hexrgb(ink) + (255,), width=round(t * 1.4))
        d.rectangle((c - t / 2, y0, c + t / 2, y1), fill=hexrgb(ink) + (255,))
    # the slash, from upper left to lower right, with a clear edge so that it stays readable over the lift
    ang = math.radians(45)
    dx, dy = math.cos(ang), math.sin(ang)
    px, py = -dy, dx

    def bar(half_len, half_w, fill):
        pts = [
            (c - dx * half_len + px * half_w, c - dy * half_len + py * half_w),
            (c + dx * half_len + px * half_w, c + dy * half_len + py * half_w),
            (c + dx * half_len - px * half_w, c + dy * half_len - py * half_w),
            (c - dx * half_len - px * half_w, c - dy * half_len - py * half_w),
        ]
        d.polygon(pts, fill=fill)

    inner = R * 0.82
    bar(inner + R * 0.02, R * 0.115 + R * 0.05, hexrgb(gap) + (255,))
    bar(R * 0.97, R * 0.115, hexrgb(ink) + (255,))
    # trim whatever sticks out of the circle
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((c - R, c - R, c + R, c + R), fill=255)
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    small = layer.resize((size, size), Image.LANCZOS)
    sheet.im.paste(small, (round(cx * SCALA - size / 2), round(cy * SCALA - size / 2)), small)


def stripes(sheet: Sheet, y0, y1, a: str, b: str, pitch=46):
    """Diagonal hazard stripes between two rows (a under, b over)."""
    sheet.rect(0, y0, sheet.w, y1, fill=a)
    h = y1 - y0
    x = -h
    while x < sheet.w + h:
        sheet.poly([(x, y1), (x + pitch / 2, y1), (x + pitch / 2 + h, y0), (x + h, y0)], b)
        x += pitch


def fields(sheet: Sheet, cols, y_label, y_val, ink, rule, size_lab=25, tracking=2.0, rule_w=2):
    """The four captions with a rule under each value place."""
    labels = ["DATA", "INDIRIZZO", "CITTÀ", "UBICAZIONE IMPIANTO"]
    for (x, w), lab in zip(cols, labels):
        f = sheet.fit(lab, COND, 700, w, size_lab, tracking)
        sheet.text(x, y_label, lab, f, ink, tracking)
        sheet.line(x, y_val + 16, x + w, y_val + 16, rule, rule_w)


def user_label(sheet: Sheet, x, y, ink, accent, size=34, rule_to=None):
    f = font(COND, 800, size)
    sheet.text(x, y, "INFORMAZIONE AGLI UTENTI", f, ink, 3.0)
    w = sheet.width("INFORMAZIONE AGLI UTENTI", f, 3.0)
    sheet.rect(x, y + 12, x + (rule_to or w), y + 17, fill=accent)


def clip_band(sheet: Sheet, y0, y1, draw):
    """Runs draw(sheet) and restores everything outside the band y0..y1 (for the stripes)."""
    keep = sheet.im.copy()
    draw(sheet)
    top = round(y0 * SCALA)
    bot = round(y1 * SCALA)
    sheet.im.paste(keep.crop((0, 0, keep.width, top)), (0, 0))
    sheet.im.paste(keep.crop((0, bot, keep.width, keep.height)), (0, bot))
    sheet.d = ImageDraw.Draw(sheet.im)


def card(
    id_, titolo, sheet, logo_box, lastra, az_box, az_color, az_size, vy, vsize, vcolor, cols, tx, ty, tw, trow, trighe, tsize, tcolor
):
    file = f"{id_}.jpg"
    path = OUT / file
    sheet.im.save(path, "JPEG", quality=93, subsampling=0, optimize=False, progressive=False, dpi=(300, 300))
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    logo = {"box": logo_box}
    if lastra:
        logo["lastra"] = lastra
    data = {
        "id": id_,
        "titolo": titolo,
        "fonte": (
            "Disegnato da Carbon Stealth VCC il 28/11/2026 con scripts/cartelli/disegna.py: grafica e scritte "
            "generate dal codice (Fira Sans, SIL OFL 1.1), foto: nostro rendering 3D (public/img/site/"
            f"{PHOTO[id_]})"
        ),
        "file": file,
        "sha256": sha,
        "larghezza": sheet.w,
        "altezza": sheet.h,
        "scala": SCALA,
        "copri": [],
        "logo": logo,
        "azienda": {"box": az_box, "colore": az_color, "dimensione": az_size},
        "valori": {"y": vy, "dimensione": vsize, "colore": vcolor, "colonne": [list(c) for c in cols]},
        "testo": {"x": tx, "y": ty, "larghezza": tw, "riga": trow, "righe": trighe, "dimensione": tsize, "colore": tcolor},
        "scritte": [],
    }
    (OUT / f"{id_}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(id_, sheet.im.size, sha[:12])


PHOTO = {
    "rosso": "vano-2400.webp",
    "giallo-nero": "vano-2400.webp",
    "fuori-servizio": "bottoniera-1600.webp",
    "blu": "vano-2400.webp",
    "grafite-oro": "vano-portrait-1200.webp",
}


# --------------------------------------------------------------------------------------------------
def rosso():
    RED, INK, PALE = "#c8102e", "#14100f", "#f4efee"
    s = Sheet(LONG, SHORT, "#ffffff")
    # head: the logo and the company data go here, on white
    s.rect(0, 160, LONG, 440, fill=RED)
    prohibition(s, 190, 300, 112, "#ffffff", RED)
    t = s.fit("AVVISO DI FERMO IMPIANTO", COND, 800, 1330, 138)
    s.text(350, 312, "AVVISO DI FERMO IMPIANTO", t, "#ffffff")
    s.text(352, 392, "ASCENSORE FERMO · LAVORI IN CORSO", font(COND, 700, 56), "#ffffff", 3.0)
    cols = [(70, 250), (360, 560), (950, 330), (1310, 370)]
    fields(s, cols, 492, 566, RED, INK)
    # message to the people, on a pale panel; the photograph on the right bleeds off the sheet
    s.rect(0, 626, 1100, 1120, fill=PALE)
    s.rect(0, 626, 14, 1120, fill=RED)
    user_label(s, 70, 690, INK, RED)
    photo(s, "vano-2400.webp", (1100, 626, LONG, 1196), "#1a0508", "#ff8a98", focus=(0.52, 0.55))
    s.rect(1100, 626, 1108, 1196, fill=RED)
    s.text(70, 1170, "Ci scusiamo per il disagio.", font(SANS, 500, 46, "italic"), INK)
    s.rect(0, 1196, LONG, SHORT, fill=RED)
    card("rosso", "Rosso", s, [70, 16, 350, 146], None, [372, 16, 1690, 146], "#14100f", 24, 566, 40, "#14100f", cols,
         70, 772, 1000, 58, 5, 44, "#14100f")


def giallo_nero():
    Y, K = "#ffd200", "#121212"
    s = Sheet(LONG, SHORT, Y)
    clip_band(s, 0, 40, lambda sh: stripes(sh, 0, 40, K, Y))
    clip_band(s, 1184, SHORT, lambda sh: stripes(sh, 1184, SHORT, K, Y))
    s.rect(0, 40, LONG, 176, fill="#ffffff")
    s.rect(0, 176, LONG, 184, fill=K)
    s.rect(0, 184, LONG, 472, fill=K)
    prohibition(s, 186, 328, 104, Y, K)
    t = s.fit("AVVISO DI FERMO IMPIANTO", COND, 800, 1340, 136)
    s.text(344, 336, "AVVISO DI FERMO IMPIANTO", t, Y)
    s.text(346, 416, "LAVORI IN CORSO · ASCENSORE FERMO", font(COND, 700, 54), "#ffffff", 3.0)
    # a band of our render across the middle, toned black and yellow
    photo(s, "vano-2400.webp", (0, 472, LONG, 632), K, "#ffe66b", focus=(0.5, 0.5))
    s.rect(0, 632, LONG, 640, fill=K)
    cols = [(70, 250), (360, 560), (950, 330), (1310, 370)]
    fields(s, cols, 704, 780, K, K, rule_w=3)
    user_label(s, 70, 876, K, K)
    s.text(70, 1164, "Ci scusiamo per il disagio.", font(SANS, 500, 44, "italic"), K)
    card("giallo-nero", "Giallo e nero", s, [70, 56, 350, 162], None, [372, 56, 1690, 162], K, 24, 780, 40, K, cols,
         70, 938, 1610, 54, 4, 42, K)


def fuori_servizio():
    SL, OR, INK = "#1b222c", "#f0520f", "#161a20"
    s = Sheet(LONG, SHORT, "#ffffff")
    LW = 470
    s.rect(0, 0, LW, SHORT, fill=SL)
    photo(s, "bottoniera-1600.webp", (0, 0, LW, 520), "#0b0f14", "#9fb0c2", focus=(0.52, 0.45), fade=("bottom", SL))
    prohibition(s, LW / 2, 770, 168, "#ffffff", SL)
    s.text(LW / 2, 1066, "ASCENSORE", font(COND, 800, 50), "#ffffff", 7.0, anchor="m")
    s.rect(LW, 0, LW + 14, SHORT, fill=OR)
    s.text(LW / 2, 1150, "Ci scusiamo", font(SANS, 500, 38, "italic"), "#ffffff", anchor="m")
    s.text(LW / 2, 1196, "per il disagio.", font(SANS, 500, 38, "italic"), "#ffffff", anchor="m")
    X0 = 520
    s.text(X0, 262, "AVVISO DI FERMO IMPIANTO", s.fit("AVVISO DI FERMO IMPIANTO", COND, 700, 1180, 62, 4.0), OR, 4.0)
    t = s.fit("FUORI SERVIZIO", COND, 800, 1180, 250)
    s.text(X0 - 8, 458, "FUORI SERVIZIO", t, INK)
    s.text(X0, 540, "LAVORI IN CORSO", font(COND, 700, 62), INK, 4.0)
    s.rect(X0, 572, 1680, 580, fill=INK)
    cols = [(X0, 200), (X0 + 230, 400), (X0 + 660, 240), (X0 + 930, 250)]
    fields(s, cols, 650, 724, OR, INK, size_lab=24)
    s.rect(X0 - 20, 808, 1710, 1130, fill="#eef0f2")
    user_label(s, X0, 870, INK, OR, size=32)
    card("fuori-servizio", "Fuori servizio", s, [X0, 24, 800, 134], None, [822, 24, 1700, 134], INK, 22, 724, 36, INK, cols,
         X0, 940, 1170, 54, 4, 42, INK)


def blu():
    W, H = SHORT, LONG  # portrait
    B, BD, LT = "#0a3a8a", "#06235a", "#cfe0ff"
    s = Sheet(W, H, "#ffffff")
    s.rect(0, 178, W, 1020, fill=B)
    grid = mix(B, "#ffffff", 0.13)
    for x in range(0, W, 40):
        s.line(x, 178, x, 1020, grid, 1 if x % 200 else 2)
    for y in range(178, 1020, 40):
        s.line(0, y, W, y, grid, 1 if (y - 178) % 200 else 2)
    s.rect(0, 170, W, 178, fill=BD)
    s.text(60, 300, "AVVISO DI", s.fit("AVVISO DI", COND, 800, 880, 150), "#ffffff")
    t = s.fit("FERMO IMPIANTO", COND, 800, 880, 150)
    s.text(60, 430, "FERMO IMPIANTO", t, "#ffffff")
    s.text(62, 492, "ASCENSORE FERMO · LAVORI IN CORSO", s.fit("ASCENSORE FERMO · LAVORI IN CORSO", COND, 700, 1090, 52, 3.0), LT, 3.0)
    # the photograph in a technical frame with corner marks
    fx0, fy0, fx1, fy1 = 60, 540, W - 60, 960
    photo(s, "vano-2400.webp", (fx0, fy0, fx1, fy1), "#031230", "#9cc0ff", focus=(0.5, 0.6))
    for (cx, cy, sx, sy) in ((fx0, fy0, 1, 1), (fx1, fy0, -1, 1), (fx0, fy1, 1, -1), (fx1, fy1, -1, -1)):
        s.line(cx - sx * 14, cy - sy * 14, cx + sx * 56, cy - sy * 14, "#ffffff", 3)
        s.line(cx - sx * 14, cy - sy * 14, cx - sx * 14, cy + sy * 56, "#ffffff", 3)
    prohibition(s, W - 150, 330, 100, "#ffffff", B)
    cols = [(60, 190), (275, 340), (640, 215), (880, 280)]
    fields(s, cols, 1090, 1164, B, "#0a3a8a", size_lab=23, tracking=1.5)
    s.rect(40, 1226, W - 40, 1630, fill="#eaf1ff")
    s.rect(40, 1226, 48, 1630, fill=B)
    user_label(s, 70, 1284, "#06235a", B, size=32)
    s.text(60, 1700, "Ci scusiamo per il disagio.", font(SANS, 500, 42, "italic"), "#06235a")
    s.rect(0, 1730, W, H, fill=B)
    card("blu", "Blu tecnico", s, [60, 24, 340, 150], None, [362, 24, 1170, 150], "#06235a", 24, 1164, 32, "#06235a", cols,
         70, 1352, 1080, 54, 5, 42, "#06235a")


def grafite_oro():
    W, H = SHORT, LONG
    G, GOLD, CREAM = "#1d1f23", "#cfa94b", "#f4ecd6"
    s = Sheet(W, H, G)
    photo(s, "vano-portrait-1200.webp", (0, 0, W, 760), "#0a0b0d", "#6e6a60", focus=(0.5, 0.45), fade=("bottom", G))
    s.rect(0, 0, W, 6, fill=GOLD)
    s.text(60, 360, "AVVISO DI", s.fit("AVVISO DI", COND, 800, 760, 130), GOLD)
    t = s.fit("FERMO IMPIANTO", COND, 800, 790, 130)
    s.text(60, 490, "FERMO IMPIANTO", t, GOLD)
    s.text(62, 560, "ASCENSORE · LAVORI IN CORSO", s.fit("ASCENSORE · LAVORI IN CORSO", COND, 700, 790, 46, 3.0), CREAM, 3.0)
    prohibition(s, W - 190, 410, 116, GOLD, "#16171a")
    s.rect(60, 676, W - 60, 680, fill=GOLD)
    cols = [(60, 190), (275, 340), (640, 215), (880, 280)]
    fields(s, cols, 748, 822, GOLD, GOLD, size_lab=23, tracking=1.5)
    # text panel with a gold hairline frame
    s.rect(60, 900, W - 60, 1604, outline=GOLD, width=2)
    user_label(s, 96, 970, CREAM, GOLD, size=32)
    s.text(60, 1700, "Ci scusiamo per il disagio.", font(SANS, 500, 42, "italic"), CREAM)
    s.rect(0, H - 6, W, H, fill=GOLD)
    card("grafite-oro", "Grafite e oro", s, [60, 40, 340, 150], "#ffffff", [362, 40, 1170, 150], CREAM, 24, 822, 32, CREAM, cols,
         96, 1058, 1030, 72, 6, 52, CREAM)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for build in (rosso, giallo_nero, fuori_servizio, blu, grafite_oro):
        build()
