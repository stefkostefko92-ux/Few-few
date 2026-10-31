"""Glyph registry: collects outlines per weight and fixes spacing."""

from __future__ import annotations

from dataclasses import dataclass, field

from pathops import Path

from geometry import Weight, bounds, shift

# Sidebearings (font units). Straight stems need more air than rounds,
# diagonals almost none — this is what keeps the text colour even.
LC_STRAIGHT = 70
LC_ROUND = 46
LC_DIAG = 14
UC_STRAIGHT = 84
UC_ROUND = 54
UC_DIAG = 12


@dataclass
class GlyphDef:
    name: str
    codes: list[int]
    path: Path
    advance: int


@dataclass
class GlyphSet:
    weight: Weight
    glyphs: dict[str, GlyphDef] = field(default_factory=dict)
    # Raw outlines before spacing, reused by composites (accents, Cyrillic look-alikes).
    raw: dict[str, Path] = field(default_factory=dict)

    def add(
        self,
        name: str,
        codes: list[int] | int | None,
        path: Path,
        lsb: float,
        rsb: float,
        advance: float | None = None,
    ) -> None:
        if name in self.glyphs:
            raise ValueError(f"duplicate glyph {name}")
        if codes is None:
            code_list: list[int] = []
        elif isinstance(codes, int):
            code_list = [codes]
        else:
            code_list = list(codes)
        self.raw[name] = path
        x0, _, x1, _ = bounds(path)
        if advance is None:
            placed = shift(path, lsb - x0)
            adv = round(lsb + (x1 - x0) + rsb)
        else:
            # Fixed advance (tabular figures, space): centre the outline.
            adv = round(advance)
            placed = shift(path, (adv - (x1 - x0)) / 2 - x0)
        self.glyphs[name] = GlyphDef(name, code_list, placed, adv)

    def add_placed(self, name: str, codes: list[int] | int, path: Path, advance: int) -> None:
        """Register an outline already in its final position (composites)."""
        if name in self.glyphs:
            raise ValueError(f"duplicate glyph {name}")
        code_list = [codes] if isinstance(codes, int) else list(codes)
        self.raw[name] = path
        self.glyphs[name] = GlyphDef(name, code_list, path, advance)

    def alias(self, name: str, codes: list[int] | int, source: str) -> None:
        """Same outline and advance under another name (e.g. Cyrillic а = Latin a)."""
        src = self.glyphs[source]
        code_list = [codes] if isinstance(codes, int) else list(codes)
        self.raw[name] = self.raw[source]
        self.glyphs[name] = GlyphDef(name, code_list, src.path, src.advance)

    def placed(self, name: str) -> Path:
        return self.glyphs[name].path

    def advance(self, name: str) -> int:
        return self.glyphs[name].advance
