"""Assembles the full glyph set for one weight."""

from __future__ import annotations

from cyrillic_lower import add_cyrillic_lower
from cyrillic_upper import add_cyrillic_upper
from figures import add_figures
from geometry import CAP, Weight, diff, rect
from glyphset import GlyphSet
from latin_lower import add_latin_lower
from latin_upper import add_latin_upper
from marks import CYRILLIC_COMPOSITES, LATIN_COMPOSITES, add_composites
from punctuation import add_punctuation


def build_glyphset(weight: Weight) -> GlyphSet:
    g = GlyphSet(weight)
    notdef = diff(rect(0, 0, 500, CAP), rect(60, 60, 440, CAP - 60))
    g.add(".notdef", None, notdef, 50, 50)
    g.add("space", [0x20, 0xA0], rect(0, 0, 0, 0), 0, 0, advance=weight.wide(250))
    add_latin_lower(g)
    add_latin_upper(g)
    add_figures(g)
    add_punctuation(g)
    add_cyrillic_upper(g)
    add_cyrillic_lower(g)
    add_composites(g, LATIN_COMPOSITES)
    add_composites(g, CYRILLIC_COMPOSITES)
    return g
