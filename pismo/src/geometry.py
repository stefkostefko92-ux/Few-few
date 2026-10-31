"""Geometric primitives for Pismo glyphs.

Every glyph is the boolean union of a few closed shapes (rectangles, elliptic
rings, slanted strokes) clipped by half-planes. skia-pathops does the booleans,
so contours come out clean (no overlaps) and correctly wound.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import pathops
from pathops import Path, PathOp

BIG = 4000.0


@dataclass(frozen=True)
class Weight:
    """Stroke parameters for one weight; every glyph is drawn from these."""

    name: str
    os2_weight: int
    s: float  # lowercase vertical stem
    h: float  # lowercase horizontal stroke
    cs: float  # capital vertical stem
    ch: float  # capital horizontal stroke

    def wide(self, base: float) -> float:
        """Widen a body as the stem grows so counters keep their area."""
        return base + (self.s - 86.0) * 0.9


# Vertical metrics (units per em = 1000).
UPM = 1000
XH = 520
CAP = 710
ASC = 760
DESC = -230
OS = 12  # overshoot for round shapes
KAPPA = 0.58  # slightly squarer than a true ellipse (0.5523): calmer text colour


def rect(x0: float, y0: float, x1: float, y1: float) -> Path:
    p = Path()
    p.moveTo(x0, y0)
    p.lineTo(x1, y0)
    p.lineTo(x1, y1)
    p.lineTo(x0, y1)
    p.close()
    return p


def poly(*pts: tuple[float, float]) -> Path:
    p = Path()
    p.moveTo(*pts[0])
    for pt in pts[1:]:
        p.lineTo(*pt)
    p.close()
    return p


def ellipse(x0: float, y0: float, x1: float, y1: float, k: float = KAPPA) -> Path:
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    p = Path()
    p.moveTo(cx, y1)
    p.cubicTo(cx + rx * k, y1, x1, cy + ry * k, x1, cy)
    p.cubicTo(x1, cy - ry * k, cx + rx * k, y0, cx, y0)
    p.cubicTo(cx - rx * k, y0, x0, cy - ry * k, x0, cy)
    p.cubicTo(x0, cy + ry * k, cx - rx * k, y1, cx, y1)
    p.close()
    return p


def union(*paths: Path) -> Path:
    out = Path()
    for p in paths:
        out = pathops.op(out, p, PathOp.UNION)
    return out


def diff(a: Path, *bs: Path) -> Path:
    for b in bs:
        a = pathops.op(a, b, PathOp.DIFFERENCE)
    return a


def inter(a: Path, *bs: Path) -> Path:
    for b in bs:
        a = pathops.op(a, b, PathOp.INTERSECTION)
    return a


def ring(x0: float, y0: float, x1: float, y1: float, sv: float, sh: float) -> Path:
    """Elliptic ring: sv = side stroke, sh = top/bottom stroke."""
    outer = ellipse(x0, y0, x1, y1)
    inner = ellipse(x0 + sv, y0 + sh, x1 - sv, y1 - sh, KAPPA + 0.03)
    return diff(outer, inner)


def stadium(x0: float, y0: float, x1: float, y1: float, rx: float) -> Path:
    """Flat left side, elliptic right side (D, P, B lobes)."""
    rx = min(rx, x1 - x0)
    return union(rect(x0, y0, x1 - rx, y1), ellipse(x1 - 2 * rx, y0, x1, y1))


def lobe(x0: float, y0: float, x1: float, y1: float, sv: float, sh: float, rx: float) -> Path:
    outer = stadium(x0, y0, x1, y1, rx)
    inner = stadium(x0 - 1, y0 + sh, x1 - sv, y1 - sh, max(rx - sv * 0.8, 10))
    return diff(outer, inner)


def stroke(x0: float, y0: float, x1: float, y1: float, t: float) -> Path:
    """Slanted stroke with horizontal ends and perpendicular thickness t."""
    dy = abs(y1 - y0)
    length = math.hypot(x1 - x0, y1 - y0)
    w = t * length / dy / 2
    return poly((x0 - w, y0), (x0 + w, y0), (x1 + w, y1), (x1 - w, y1))


def box(x0: float = -BIG, y0: float = -BIG, x1: float = BIG, y1: float = BIG) -> Path:
    return rect(x0, y0, x1, y1)


def mirror_x(p: Path, axis: float) -> Path:
    return p.transform(-1, 0, 0, 1, 2 * axis, 0)


def rot180(p: Path, cx: float, cy: float) -> Path:
    return p.transform(-1, 0, 0, -1, 2 * cx, 2 * cy)


def shift(p: Path, dx: float, dy: float = 0.0) -> Path:
    return p.transform(1, 0, 0, 1, dx, dy)


def bounds(p: Path) -> tuple[float, float, float, float]:
    return p.bounds if list(p.segments) else (0.0, 0.0, 0.0, 0.0)
