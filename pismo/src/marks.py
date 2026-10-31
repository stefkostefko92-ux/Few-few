"""Accented letters built from base + mark (Italian, German, Cyrillic й ё ѝ)."""

from __future__ import annotations

from pathops import Path

from geometry import CAP, XH, box, inter, ring, shift, stroke, union
from glyphset import GlyphSet
from shapes import dot

# (glyph name, code point, base glyph, mark)
LATIN_COMPOSITES = [
    ("agrave", 0xE0, "a", "grave"), ("egrave", 0xE8, "e", "grave"), ("eacute", 0xE9, "e", "acute"),
    ("igrave", 0xEC, "dotlessi", "grave"), ("iacute", 0xED, "dotlessi", "acute"),
    ("ograve", 0xF2, "o", "grave"), ("oacute", 0xF3, "o", "acute"), ("ugrave", 0xF9, "u", "grave"),
    ("uacute", 0xFA, "u", "acute"), ("aacute", 0xE1, "a", "acute"),
    ("adieresis", 0xE4, "a", "dieresis"), ("odieresis", 0xF6, "o", "dieresis"), ("udieresis", 0xFC, "u", "dieresis"),
    ("Agrave", 0xC0, "A", "grave.cap"), ("Egrave", 0xC8, "E", "grave.cap"), ("Eacute", 0xC9, "E", "acute.cap"),
    ("Igrave", 0xCC, "I", "grave.cap"), ("Ograve", 0xD2, "O", "grave.cap"), ("Ugrave", 0xD9, "U", "grave.cap"),
    ("Adieresis", 0xC4, "A", "dieresis.cap"), ("Odieresis", 0xD6, "O", "dieresis.cap"), ("Udieresis", 0xDC, "U", "dieresis.cap"),
]

CYRILLIC_COMPOSITES = [
    ("uni0439", 0x439, "uni0438", "breve"), ("uni0419", 0x419, "uni0418", "breve.cap"),
    ("uni0451", 0x451, "uni0435", "dieresis"), ("uni0401", 0x401, "uni0415", "dieresis.cap"),
    ("uni045D", 0x45D, "uni0438", "grave"), ("uni040D", 0x40D, "uni0418", "grave.cap"),
    # Bulgarian forms of й and ѝ (substituted through locl BGR).
    ("uni0439.bg", None, "uni0438.bg", "breve"), ("uni045D.bg", None, "uni0438.bg", "grave"),
]


def mark_shapes(g: GlyphSet) -> dict[str, Path]:
    s, h = g.weight.s, g.weight.h
    d = s * 1.12
    lo, cap = XH + 95, CAP + 75
    acute = stroke(-55, lo, 55, lo + 170, s * 0.78)
    acute_cap = stroke(-60, cap, 60, cap + 125, g.weight.ch * 0.95)
    gap = d * 0.85
    bw = (s - 86) * 0.6  # bold breves widen so the cup stays open
    return {
        "acute": acute,
        "grave": acute.transform(-1, 0, 0, 1, 0, 0),
        "acute.cap": acute_cap,
        "grave.cap": acute_cap.transform(-1, 0, 0, 1, 0, 0),
        "dieresis": union(dot(-gap, lo, d), dot(gap, lo, d)),
        "dieresis.cap": union(dot(-gap, cap, d * 0.95), dot(gap, cap, d * 0.95)),
        "breve": inter(ring(-130 - bw, lo - 20, 130 + bw, lo + 230, s * 0.72, h * 0.8), box(y1=lo + 105)),
        "breve.cap": inter(ring(-140 - bw, cap - 40, 140 + bw, cap + 170, g.weight.ch * 0.8, g.weight.ch * 0.8), box(y1=cap + 65)),
    }


def add_composites(g: GlyphSet, table: list[tuple[str, int | None, str, str]]) -> None:
    marks = mark_shapes(g)
    for name, code, base, mark in table:
        base_path = g.placed(base)
        x0, _, x1, _ = base_path.bounds
        cx = (x0 + x1) / 2
        if base == "dotlessi":
            cx = x0 + g.weight.s / 2
        path = union(base_path, shift(marks[mark], cx))
        g.add_placed(name, [] if code is None else code, path, g.advance(base))
