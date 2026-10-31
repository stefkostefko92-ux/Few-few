"""Gate for Pismo: coverage, metrics, OpenType features, reproducible build."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

from fontTools.pens.boundsPen import BoundsPen  # noqa: E402
from fontTools.ttLib import TTFont  # noqa: E402

import build  # noqa: E402

FONTS = ROOT / "fonts"
STYLES = [w.name for w in build.WEIGHTS]
FORMATS = ["otf", "ttf", "woff2"]

BULGARIAN = "АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯабвгдежзийклмнопрстуфхцчшщъьюяЍѝ"
RUSSIAN_EXTRA = "ЁЫЭёыэ"
LATIN = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
ITALIAN = "àèéìíòóùúÀÈÉÌÒÙ"
GERMAN = "äöüÄÖÜ"
FIGURES = "0123456789"
PUNCT = " .,:;!?-–—()[]/\\'\"„“”‘’‚«»‹›…*#%&@+−=<>×~^|_°·•€$№"
REQUIRED = BULGARIAN + RUSSIAN_EXTRA + LATIN + ITALIAN + GERMAN + FIGURES + PUNCT


def font(style: str, fmt: str) -> TTFont:
    return TTFont(str(FONTS / f"Pismo-{style}.{fmt}"))


class Coverage(unittest.TestCase):
    def test_every_required_character_is_mapped(self) -> None:
        for style in STYLES:
            for fmt in FORMATS:
                cmap = font(style, fmt).getBestCmap()
                missing = [c for c in REQUIRED if ord(c) not in cmap]
                self.assertEqual(missing, [], f"{style}.{fmt} misses {''.join(missing)}")

    def test_no_empty_glyph_except_space(self) -> None:
        for style in STYLES:
            f = font(style, "ttf")
            gs = f.getGlyphSet()
            for name in f.getGlyphOrder():
                if name == "space":
                    continue
                pen = BoundsPen(gs)
                gs[name].draw(pen)
                self.assertIsNotNone(pen.bounds, f"{style}: {name} has no outline")


class Metrics(unittest.TestCase):
    def test_outlines_stay_inside_the_line_box(self) -> None:
        for style in STYLES:
            f = font(style, "ttf")
            os2 = f["OS/2"]
            top, bottom = os2.usWinAscent, -os2.usWinDescent
            gs = f.getGlyphSet()
            for name in f.getGlyphOrder():
                pen = BoundsPen(gs)
                gs[name].draw(pen)
                if pen.bounds is None:
                    continue
                _, y0, _, y1 = pen.bounds
                self.assertLessEqual(y1, top, f"{style}: {name} clipped at top")
                self.assertGreaterEqual(y0, bottom, f"{style}: {name} clipped at bottom")

    def test_figures_are_tabular(self) -> None:
        for style in STYLES:
            hmtx = font(style, "ttf")["hmtx"]
            widths = {hmtx[n][0] for n in ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]}
            self.assertEqual(len(widths), 1, f"{style}: figures differ in width {widths}")

    def test_weight_classes(self) -> None:
        self.assertEqual(font("Regular", "otf")["OS/2"].usWeightClass, 400)
        self.assertEqual(font("Bold", "otf")["OS/2"].usWeightClass, 700)


class Features(unittest.TestCase):
    def test_bulgarian_locl_substitutes_forms(self) -> None:
        for style in STYLES:
            gsub = font(style, "otf")["GSUB"].table
            mapping: dict[str, str] = {}
            for lookup in gsub.LookupList.Lookup:
                for sub in lookup.SubTable:
                    mapping.update(getattr(sub, "mapping", {}) or {})
            for base in ["uni0434", "uni0438", "uni043B", "uni043F", "uni0442", "uni0448"]:
                self.assertEqual(mapping.get(base), f"{base}.bg", f"{style}: no Bulgarian form for {base}")
            langs = {
                ls.LangSysTag
                for sr in gsub.ScriptList.ScriptRecord
                if sr.ScriptTag == "cyrl"
                for ls in sr.Script.LangSysRecord
            }
            self.assertIn("BGR ", langs)

    def test_kerning_present(self) -> None:
        for style in STYLES:
            tags = {fr.FeatureTag for fr in font(style, "otf")["GPOS"].table.FeatureList.FeatureRecord}
            self.assertIn("kern", tags)


class Reproducible(unittest.TestCase):
    def test_committed_fonts_match_a_fresh_build(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(build.main(["--out", tmp]), 0)
            for style in STYLES:
                for fmt in FORMATS:
                    name = f"Pismo-{style}.{fmt}"
                    fresh = (Path(tmp) / name).read_bytes()
                    committed = (FONTS / name).read_bytes()
                    self.assertEqual(fresh, committed, f"{name} is stale — run python src/build.py")


if __name__ == "__main__":
    unittest.main()
