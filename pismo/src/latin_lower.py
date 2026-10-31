"""Latin lowercase a–z."""

from __future__ import annotations

from geometry import ASC, DESC, OS, XH, box, diff, inter, rect, ring, shift, stroke, union
from glyphset import LC_DIAG, LC_ROUND, LC_STRAIGHT, GlyphSet
from shapes import (
    arch,
    bottom_hook,
    descender_hook,
    diagonals_v,
    dot,
    n_shape,
    o_ring,
    s_curve,
    stem_bowl,
    top_hook,
    u_shape,
)


def add_latin_lower(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.s, w.h
    dot_d = s * 1.18
    dot_y = XH + 100

    nw = w.wide(420)
    g.add("n", 0x6E, n_shape(w, nw, XH, XH), LC_STRAIGHT, LC_STRAIGHT - 4)
    g.add("h", 0x68, n_shape(w, nw, XH, ASC), LC_STRAIGHT, LC_STRAIGHT - 4)
    g.add("u", 0x75, u_shape(w, nw, XH), LC_STRAIGHT - 4, LC_STRAIGHT)

    mw = w.wide(690)
    mid = mw / 2
    a1, cy1 = arch(0, mid + s / 2, XH, mid * 0.6, s, h)
    a2, cy2 = arch(mid - s / 2, mw, XH, mid * 0.6, s, h)
    m = union(rect(0, 0, s, XH), a1, a2, rect(mid - s / 2, 0, mid + s / 2, cy1 + 1), rect(mw - s, 0, mw, cy2 + 1))
    g.add("m", 0x6D, m, LC_STRAIGHT, LC_STRAIGHT - 4)

    rw = w.wide(390)
    ra, _ = arch(0, rw, XH, rw * 0.6, s, h * 0.95)
    r = union(rect(0, 0, s, XH), inter(ra, box(x1=rw * 0.72)))
    g.add("r", 0x72, r, LC_STRAIGHT, LC_DIAG + 10)

    ow = w.wide(470)
    g.add("o", 0x6F, o_ring(w, ow, XH, s * 1.06, h), LC_ROUND, LC_ROUND)

    cw = w.wide(430)
    c = diff(o_ring(w, cw, XH, s * 1.06, h), box(x0=cw * 0.5, y0=148, y1=XH - 150))
    g.add("c", 0x63, c, LC_ROUND, LC_ROUND - 14)

    ew = w.wide(450)
    bar_y = XH * 0.47
    e = union(
        diff(o_ring(w, ew, XH, s * 1.06, h), box(x0=ew * 0.5, y0=128, y1=bar_y)),
        rect(s * 0.5, bar_y, ew - s * 0.5, bar_y + h * 0.92),
    )
    g.add("e", 0x65, e, LC_ROUND, LC_ROUND - 8)

    bw = w.wide(470)
    g.add("b", 0x62, stem_bowl(w, bw, XH, 0, ASC), LC_STRAIGHT, LC_ROUND)
    g.add("p", 0x70, stem_bowl(w, bw, XH, DESC, XH), LC_STRAIGHT, LC_ROUND)
    g.add("d", 0x64, stem_bowl(w, bw, XH, 0, ASC, "right"), LC_ROUND, LC_STRAIGHT)
    g.add("q", 0x71, stem_bowl(w, bw, XH, DESC, XH, "right"), LC_ROUND, LC_STRAIGHT)

    gw = bw
    g_bowl = stem_bowl(w, gw, XH, 0, XH, "right")
    g_shape = union(
        diff(g_bowl, box(y1=0, x1=gw - s)),
        rect(gw - s, DESC + 150, gw, XH),
        descender_hook(gw, gw * 0.8, DESC, 150, s, h),
    )
    g.add("g", 0x67, g_shape, LC_ROUND, LC_STRAIGHT)

    # Two-storey a: the most legible form at text sizes.
    aw = w.wide(410)
    top_arc, cya = arch(12, aw, XH, 230, s, h)
    top_arc = inter(top_arc, union(box(x0=aw * 0.45), box(y0=XH - 140)))
    a_bowl = ring(0, -OS, aw - s * 0.35, XH * 0.58, s * 0.96, h * 0.95)
    a_shape = union(top_arc, rect(aw - s, 0, aw, cya + 1), a_bowl)
    g.add("a", 0x61, a_shape, LC_ROUND + 4, LC_STRAIGHT - 6)

    g.add("s", 0x73, s_curve(w.wide(380), XH, s, h, 14), LC_ROUND, LC_ROUND)

    g.add("i", 0x69, union(rect(0, 0, s, XH), dot(s / 2, dot_y, dot_d)), LC_STRAIGHT, LC_STRAIGHT)
    jx = 190
    j = union(
        rect(jx, DESC + 150, jx + s, XH),
        descender_hook(jx + s, 190, DESC, 150, s, h),
        dot(jx + s / 2, dot_y, dot_d),
    )
    g.add("j", 0x6A, j, LC_DIAG - 30, LC_STRAIGHT)

    hook_reach = w.wide(170)
    l_shape = union(rect(0, 150, s, ASC), bottom_hook(0, hook_reach, 150, s, h))
    g.add("l", 0x6C, l_shape, LC_STRAIGHT, LC_DIAG + 6)

    t_shape = union(
        rect(0, 150, s, XH + 140),
        bottom_hook(0, hook_reach, 150, s, h),
        rect(-105, XH - h, s + 150, XH),
    )
    g.add("t", 0x74, t_shape, LC_DIAG + 6, LC_DIAG + 4)

    f_shape = union(
        rect(0, 0, s, ASC - 160),
        top_hook(0, w.wide(200), ASC, 160, s, h),
        rect(-105, XH - h, s + 150, XH),
    )
    g.add("f", 0x66, f_shape, LC_DIAG + 6, LC_DIAG - 4)

    kw = w.wide(410)
    arm = inter(stroke(s * 0.6, 150, kw - s * 0.6, XH, s * 0.95), box(x0=s * 0.5, y0=0, y1=XH))
    leg = inter(stroke(s + 70, 300, kw - s * 0.55, 0, s), box(x0=s * 0.5, y0=0, y1=XH))
    g.add("k", 0x6B, union(rect(0, 0, s, ASC), arm, leg), LC_STRAIGHT, LC_DIAG)

    vw = w.wide(450)
    g.add("v", 0x76, diagonals_v(vw, XH, 0, s * 0.98, s * 0.8), LC_DIAG, LC_DIAG)

    ww = w.wide(680)
    half = diagonals_v(ww / 2 + s * 0.3, XH, 0, s * 0.92, s * 0.74)
    g.add("w", 0x77, union(half, shift(half, ww / 2 - s * 0.3)), LC_DIAG, LC_DIAG)

    xw = w.wide(430)
    x_shape = inter(
        union(stroke(s * 0.55, XH, xw - s * 0.55, 0, s), stroke(xw - s * 0.45, XH, s * 0.45, 0, s * 0.8)),
        box(y0=0, y1=XH),
    )
    g.add("x", 0x78, x_shape, LC_DIAG, LC_DIAG)

    yw = vw
    x_desc = yw - s * 0.45 - (XH - DESC) * (yw / 2 - s * 0.45) / XH
    y_shape = inter(
        union(stroke(s * 0.55, XH, yw / 2, 0, s * 0.98), stroke(yw - s * 0.45, XH, x_desc, DESC, s * 0.8)),
        box(y0=DESC, y1=XH),
    )
    g.add("y", 0x79, y_shape, LC_DIAG, LC_DIAG)

    zw = w.wide(400)
    z_shape = union(
        rect(0, XH - h, zw, XH),
        rect(0, 0, zw, h),
        inter(stroke(zw - s * 0.62, XH - h / 2, s * 0.62, h / 2, s * 0.95), box(x0=0, x1=zw, y0=0, y1=XH)),
    )
    g.add("z", 0x7A, z_shape, LC_ROUND - 6, LC_ROUND - 6)

    # Dotless i/j for accents.
    g.add("dotlessi", 0x131, rect(0, 0, s, XH), LC_STRAIGHT, LC_STRAIGHT)
