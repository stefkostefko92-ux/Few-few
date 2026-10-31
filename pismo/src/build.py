"""Build Pismo Regular/Bold as OTF (CFF), TTF (quadratic) and WOFF2.

Usage: python src/build.py [--out fonts]
Output is deterministic: fixed timestamps, sorted glyph order.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path as FsPath

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

from features import feature_code
from geometry import ASC, CAP, DESC, UPM, XH, Weight
from glyphset import GlyphSet
from registry import build_glyphset

FAMILY = "Pismo"
VERSION = "1.000"
# 2026-10-31 00:00 UTC in seconds since 1904-01-01 (OpenType epoch) — keeps builds reproducible.
FIXED_TIMESTAMP = 3_844_713_600
COPYRIGHT = "Copyright 2026 Carbon Stealth VCC (https://carbonstealth.eu). All rights reserved."

WEIGHTS = [
    Weight("Regular", 400, s=86, h=74, cs=94, ch=80),
    Weight("Bold", 700, s=146, h=118, cs=158, ch=126),
]


def name_strings(style: str) -> dict[str, str]:
    return {
        "copyright": COPYRIGHT,
        "familyName": FAMILY,
        "styleName": style,
        "uniqueFontIdentifier": f"{FAMILY}-{style};{VERSION};CSVCC",
        "fullName": f"{FAMILY} {style}",
        "version": f"Version {VERSION}",
        "psName": f"{FAMILY}-{style}",
        "manufacturer": "Carbon Stealth VCC",
        "designer": "Carbon Stealth VCC",
        "vendorURL": "https://carbonstealth.eu",
        "description": "Pismo — a text typeface for Bulgarian Cyrillic and Latin.",
    }


def glyph_order(gs: GlyphSet) -> list[str]:
    names = sorted(n for n in gs.glyphs if n not in (".notdef", "space"))
    return [".notdef", "space", *names]


def setup_common(fb: FontBuilder, gs: GlyphSet, order: list[str]) -> None:
    w = gs.weight
    cmap: dict[int, str] = {}
    for name in order:
        for code in gs.glyphs[name].codes:
            if code in cmap:
                raise ValueError(f"U+{code:04X} mapped twice ({cmap[code]}, {name})")
            cmap[code] = name
    fb.setupCharacterMap(cmap)
    metrics = {}
    for name in order:
        gd = gs.glyphs[name]
        x0 = int(round(gd.path.bounds[0])) if list(gd.path.segments) else 0
        metrics[name] = (gd.advance, x0)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASC + 190, descent=DESC - 50, lineGap=0)
    fb.setupNameTable(name_strings(w.name))
    fb.setupOS2(
        sTypoAscender=ASC,
        sTypoDescender=DESC,
        sTypoLineGap=1000 - (ASC - DESC) + 200,
        usWinAscent=ASC + 190,
        usWinDescent=-(DESC - 50),
        sxHeight=XH,
        sCapHeight=CAP,
        usWeightClass=w.os2_weight,
        fsSelection=(0x20 if w.os2_weight >= 700 else 0x40) | 0x80,  # BOLD/REGULAR + USE_TYPO_METRICS
        version=4,
        achVendID="CSVC",
        fsType=0,
        ulCodePageRange1=(1 << 0) | (1 << 2),  # Latin 1 + Cyrillic
    )
    fb.setupPost()
    fb.font["head"].created = FIXED_TIMESTAMP
    fb.font["head"].modified = FIXED_TIMESTAMP
    fb.font["head"].macStyle = 0x01 if w.os2_weight >= 700 else 0x00
    fb.addOpenTypeFeatures(feature_code(gs))


def build_otf(gs: GlyphSet, order: list[str]) -> TTFont:
    fb = FontBuilder(UPM, isTTF=False)
    fb.setupGlyphOrder(order)
    charstrings = {}
    for name in order:
        gd = gs.glyphs[name]
        pen = T2CharStringPen(gd.advance, None)
        gd.path.draw(pen)
        charstrings[name] = pen.getCharString()
    fb.setupCFF(f"{FAMILY}-{gs.weight.name}", {"FullName": f"{FAMILY} {gs.weight.name}"}, charstrings, {})
    setup_common(fb, gs, order)
    return fb.font


def build_ttf(gs: GlyphSet, order: list[str]) -> TTFont:
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(None)
        gs.glyphs[name].path.draw(Cu2QuPen(pen, max_err=1.0, reverse_direction=True))
        glyphs[name] = pen.glyph()
    fb.setupGlyf(glyphs)
    setup_common(fb, gs, order)
    return fb.font


def save(font: TTFont, path: FsPath, flavor: str | None = None) -> None:
    font.flavor = flavor
    font.recalcTimestamp = False  # keep FIXED_TIMESTAMP: builds must be byte-identical
    font.save(str(path), reorderTables=True)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=str(FsPath(__file__).resolve().parent.parent / "fonts"))
    args = parser.parse_args(argv)
    out = FsPath(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for weight in WEIGHTS:
        gs = build_glyphset(weight)
        order = glyph_order(gs)
        base = f"{FAMILY}-{weight.name}"
        save(build_otf(gs, order), out / f"{base}.otf")
        ttf = build_ttf(gs, order)
        save(ttf, out / f"{base}.ttf")
        save(TTFont(str(out / f"{base}.ttf"), recalcTimestamp=False), out / f"{base}.woff2", "woff2")
        print(f"{base}: {len(order)} glyphs")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
