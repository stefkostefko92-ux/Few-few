"""Reusable letter parts shared by Latin and Cyrillic (arches, bowls, hooks)."""

from __future__ import annotations

from pathops import Path

from geometry import (
    OS,
    Weight,
    box,
    diff,
    ellipse,
    inter,
    mirror_x,
    rect,
    ring,
    rot180,
    stroke,
    union,
)


def arch(x0: float, x1: float, top: float, depth: float, sv: float, sh: float) -> tuple[Path, float]:
    """Upper half of a ring (the shoulder of n, m, h). Returns (path, spring height)."""
    r = ring(x0, top + OS - 2 * depth, x1, top + OS, sv, sh)
    cy = top + OS - depth
    return inter(r, box(y0=cy)), cy


def n_shape(w: Weight, width: float, height: float, stem_top: float, stem_bottom: float = 0) -> Path:
    """Stem + shoulder + right leg, the skeleton of n h m-halves п т(bg)."""
    a, cy = arch(0, width, height, width * 0.56, w.s, w.h)
    return union(rect(0, stem_bottom, w.s, stem_top), a, rect(width - w.s, 0, width, cy + 1))


def u_shape(w: Weight, width: float, height: float) -> Path:
    return rot180(n_shape(w, width, height, height), width / 2, height / 2)


def o_ring(w: Weight, width: float, height: float, sv: float, sh: float) -> Path:
    return ring(0, -OS, width, height + OS, sv, sh)


def stem_bowl(
    w: Weight, width: float, height: float, stem_y0: float, stem_y1: float, side: str = "left"
) -> Path:
    """b/d/p/q: the counter's stem side is straight, the bowl joins with a lighter crotch."""
    s, h = w.s, w.h
    outer = ellipse(0, -OS, width, height + OS)
    inner = ellipse(s * 0.45, -OS + h, width - s * 1.06, height + OS - h, 0.61)
    shape = union(diff(outer, inner), rect(0, stem_y0, s, stem_y1))
    return mirror_x(shape, width / 2) if side == "right" else shape


def bottom_hook(x_stem: float, reach: float, spring: float, s: float, h: float) -> Path:
    """Tail turning right at the foot of a stem (t, l, ц-like). Stem left edge at x_stem."""
    hook = ring(x_stem, -OS, x_stem + reach * 1.6, spring * 2, s, h)
    return inter(hook, box(y1=spring, x1=x_stem + reach))


def top_hook(x_stem: float, reach: float, top: float, depth: float, s: float, h: float) -> Path:
    """Hook turning right at the top of a stem (f)."""
    hook = ring(x_stem, top + OS - 2 * depth, x_stem + reach * 1.6, top + OS, s, h)
    return inter(hook, box(y0=top - depth, x1=x_stem + reach))


def descender_hook(x_stem_right: float, reach: float, bottom: float, depth: float, s: float, h: float) -> Path:
    """Hook turning left under a descender (j, g, у-tail). Stem right edge at x_stem_right."""
    hook = ring(x_stem_right - reach * 1.6, bottom - OS, x_stem_right, bottom + 2 * depth, s, h)
    return inter(hook, box(y1=bottom + depth, x0=x_stem_right - reach))


def diagonals_v(width: float, top: float, bottom: float, thick: float, thin: float) -> Path:
    """V shape: thick left stroke, thin right stroke, flat vertex."""
    left = stroke(thick * 0.55, top, width / 2, bottom, thick)
    right = stroke(width - thin * 0.55, top, width / 2, bottom, thin)
    return inter(union(left, right), box(y0=bottom, y1=top))


def dot(cx: float, y0: float, d: float) -> Path:
    return ellipse(cx - d / 2, y0, cx + d / 2, y0 + d, 0.56)


def s_curve(width: float, height: float, sv: float, sh: float, top_inset: float = 18) -> Path:
    """S/s/З-family: two stacked half-rings sharing the spine."""
    ym = height * 0.52
    top_r = ring(top_inset, ym - sh / 2, width - top_inset * 0.5, height + OS, sv * 0.98, sh)
    bot_r = ring(0, -OS, width, ym + sh / 2, sv, sh)
    tcx, tcy = width / 2, (ym - sh / 2 + height + OS) / 2
    bcx, bcy = width / 2, (-OS + ym + sh / 2) / 2
    gap = height * 0.11
    top_part = inter(top_r, union(box(y0=tcy + gap), box(x1=tcx)))
    bot_part = inter(bot_r, union(box(y1=bcy - gap), box(x0=bcx)))
    return union(top_part, bot_part)


def k_branch(x0: float, width: float, height: float, s: float, arm_y: float, leg_y: float) -> Path:
    """Arm + leg of K/k/Ж growing right from a stem whose right edge is x0 + s."""
    arm = stroke(x0 + s * 0.6, arm_y, x0 + width - s * 0.6, height, s * 0.93)
    leg = stroke(x0 + s + 0.16 * width, leg_y, x0 + width - s * 0.52, 0, s)
    return inter(union(arm, leg), box(x0=x0 + s * 0.5, y0=0, y1=height))


def three_shape(width: float, height: float, s: float, h: float) -> Path:
    """Figure 3 / Cyrillic З: two right-facing bowls, middle stroke stops short on the left."""
    ym = height * 0.53
    t_ring = ring(30, ym - h / 2, width - 18, height + OS, s * 0.96, h)
    b_ring = ring(0, -OS, width, ym + h / 2, s, h)
    tcx, tcy = (30 + width - 18) / 2, (ym - h / 2 + height + OS) / 2
    bcx, bcy = width / 2, (-OS + ym + h / 2) / 2
    cut = height * 0.1
    band = (ym - h / 2, ym + h / 2)  # the shared middle stroke
    return union(
        inter(t_ring, union(box(x0=tcx), box(y0=tcy + cut), box(x0=tcx - 70, y0=band[0], y1=band[1]))),
        inter(b_ring, union(box(x0=bcx), box(y1=bcy - cut), box(x0=bcx - 70, y0=band[0], y1=band[1]))),
        # Fill the wedge where the two bowls part, so the middle stroke has one clean end.
        rect(min(tcx, bcx) - 70, band[0], max(tcx, bcx), band[1]),
    )

