"""Latin capitals A–Z."""

from __future__ import annotations

from geometry import CAP, OS, box, diff, inter, lobe, poly, rect, ring, shift, stroke, union
from glyphset import UC_DIAG, UC_ROUND, UC_STRAIGHT, GlyphSet
from shapes import diagonals_v, s_curve


def add_latin_upper(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.cs, w.ch
    mid = CAP * 0.5

    aw = w.wide(640)
    a_legs = inter(
        union(stroke(h * 0.6, 0, aw / 2, CAP, h * 1.12), stroke(aw - s * 0.6, 0, aw / 2, CAP, s)),
        box(y0=0, y1=CAP),
    )
    a_bar = inter(rect(0, 185, aw, 185 + h), poly((0, 0), (aw / 2, CAP), (aw, 0)))
    g.add("A", 0x41, union(a_legs, a_bar), UC_DIAG, UC_DIAG)

    bw = w.wide(520)
    bmid = CAP * 0.53
    b_shape = union(
        rect(0, 0, s, CAP),
        lobe(0, bmid - h / 2, bw - 40, CAP, s * 1.02, h, (CAP - bmid) * 0.5),
        lobe(0, 0, bw, bmid + h / 2, s * 1.06, h, bmid * 0.52),
    )
    g.add("B", 0x42, b_shape, UC_STRAIGHT, UC_ROUND)

    cw = w.wide(610)
    c_ring = ring(0, -OS, cw, CAP + OS, s * 1.06, h)
    g.add("C", 0x43, diff(c_ring, box(x0=cw * 0.5, y0=200, y1=CAP - 200)), UC_ROUND, UC_ROUND - 14)

    dw = w.wide(630)
    g.add("D", 0x44, union(rect(0, 0, s, CAP), lobe(0, 0, dw, CAP, s * 1.08, h, CAP * 0.4)), UC_STRAIGHT, UC_ROUND)

    ew = w.wide(470)
    e_shape = union(rect(0, 0, s, CAP), rect(0, CAP - h, ew, CAP), rect(0, mid - h / 2, ew - 40, mid + h / 2), rect(0, 0, ew + 8, h))
    g.add("E", 0x45, e_shape, UC_STRAIGHT, UC_DIAG + 28)
    f_shape = union(rect(0, 0, s, CAP), rect(0, CAP - h, ew, CAP), rect(0, mid - h / 2 - 20, ew - 40, mid + h / 2 - 20))
    g.add("F", 0x46, f_shape, UC_STRAIGHT, UC_DIAG + 20)

    gw = w.wide(640)
    g_bar = CAP * 0.46
    g_shape = union(
        diff(ring(0, -OS, gw, CAP + OS, s * 1.06, h), box(x0=gw * 0.5, y0=g_bar - h, y1=CAP - 200)),
        rect(gw * 0.52, g_bar - h, gw, g_bar),
        rect(gw - s, CAP * 0.12, gw, g_bar),
    )
    g.add("G", 0x47, g_shape, UC_ROUND, UC_STRAIGHT - 10)

    hw = w.wide(600)
    g.add("H", 0x48, union(rect(0, 0, s, CAP), rect(hw - s, 0, hw, CAP), rect(0, mid - h / 2, hw, mid + h / 2)), UC_STRAIGHT, UC_STRAIGHT)
    g.add("I", 0x49, rect(0, 0, s, CAP), UC_STRAIGHT, UC_STRAIGHT)

    jx = w.wide(250)
    j_hook = inter(ring(jx + s - 330, -OS, jx + s, 400, s, h), box(y1=200, x0=jx + s - 290))
    g.add("J", 0x4A, union(rect(jx, 200, jx + s, CAP), j_hook), UC_DIAG + 10, UC_STRAIGHT)

    kw = w.wide(560)
    k_arm = inter(stroke(s * 0.6, 220, kw - s * 0.6, CAP, s * 0.92), box(x0=s * 0.5, y0=0, y1=CAP))
    k_leg = inter(stroke(s + 110, 400, kw - s * 0.5, 0, s), box(x0=s * 0.5, y0=0, y1=CAP))
    g.add("K", 0x4B, union(rect(0, 0, s, CAP), k_arm, k_leg), UC_STRAIGHT, UC_DIAG)

    g.add("L", 0x4C, union(rect(0, 0, s, CAP), rect(0, 0, w.wide(450), h)), UC_STRAIGHT, UC_DIAG + 10)

    mw = w.wide(760)
    m_diag = inter(
        union(stroke(s * 0.5 + 20, CAP, mw / 2, 0, h * 1.15), stroke(mw - s * 0.5 - 20, CAP, mw / 2, 0, h * 1.15)),
        box(0, 0, mw, CAP),
    )
    g.add("M", 0x4D, union(rect(0, 0, s * 0.9, CAP), rect(mw - s * 0.9, 0, mw, CAP), m_diag), UC_STRAIGHT, UC_STRAIGHT)

    nw = w.wide(620)
    n_diag = inter(stroke(s * 0.45, CAP, nw - s * 0.45, 0, s * 0.98), box(0, 0, nw, CAP))
    g.add("N", 0x4E, union(rect(0, 0, s * 0.86, CAP), rect(nw - s * 0.86, 0, nw, CAP), n_diag), UC_STRAIGHT, UC_STRAIGHT)

    ow = w.wide(700)
    o_shape = ring(0, -OS, ow, CAP + OS, s * 1.08, h)
    g.add("O", 0x4F, o_shape, UC_ROUND, UC_ROUND)
    q_tail = inter(stroke(ow * 0.6, 150, ow * 0.86, -140, s * 0.95), box(y0=-140, y1=CAP))
    g.add("Q", 0x51, union(o_shape, q_tail), UC_ROUND, UC_ROUND)

    pw = w.wide(540)
    p_top = CAP * 0.40
    g.add("P", 0x50, union(rect(0, 0, s, CAP), lobe(0, p_top, pw, CAP, s * 1.06, h, (CAP - p_top) * 0.5)), UC_STRAIGHT, UC_ROUND)
    r_leg = inter(stroke(pw * 0.48, p_top + h / 2, pw - s * 0.5 + 20, 0, s), box(y0=0, y1=p_top + h / 2))
    g.add("R", 0x52, union(rect(0, 0, s, CAP), lobe(0, p_top, pw, CAP, s * 1.06, h, (CAP - p_top) * 0.5), r_leg), UC_STRAIGHT, UC_DIAG)

    g.add("S", 0x53, s_curve(w.wide(520), CAP, s, h), UC_ROUND, UC_ROUND)

    tw = w.wide(560)
    g.add("T", 0x54, union(rect(0, CAP - h, tw, CAP), rect(tw / 2 - s / 2, 0, tw / 2 + s / 2, CAP)), UC_DIAG + 6, UC_DIAG + 6)

    uw = w.wide(600)
    depth = uw * 0.5
    u_bowl = inter(ring(0, -OS, uw, 2 * depth - OS, s, h), box(y1=depth - OS))
    u_shape = union(u_bowl, rect(0, depth - OS - 1, s, CAP), rect(uw - s, depth - OS - 1, uw, CAP))
    g.add("U", 0x55, u_shape, UC_STRAIGHT - 6, UC_STRAIGHT - 6)

    vw = w.wide(630)
    g.add("V", 0x56, diagonals_v(vw, CAP, 0, s, h * 1.12), UC_DIAG, UC_DIAG)

    ww = w.wide(930)
    half = diagonals_v(ww / 2 + s * 0.3, CAP, 0, s * 0.96, h * 1.05)
    g.add("W", 0x57, union(half, shift(half, ww / 2 - s * 0.3)), UC_DIAG, UC_DIAG)

    xw = w.wide(600)
    x_shape = inter(
        union(stroke(s * 0.55, CAP, xw - s * 0.55, 0, s), stroke(xw - s * 0.45, CAP, s * 0.45, 0, h * 1.12)),
        box(y0=0, y1=CAP),
    )
    g.add("X", 0x58, x_shape, UC_DIAG, UC_DIAG)

    yw = w.wide(600)
    y_fork = CAP * 0.42
    y_arms = inter(
        union(stroke(s * 0.55, CAP, yw / 2, y_fork, s), stroke(yw - s * 0.5, CAP, yw / 2, y_fork, h * 1.12)),
        box(y0=y_fork, y1=CAP),
    )
    g.add("Y", 0x59, union(y_arms, rect(yw / 2 - s / 2, 0, yw / 2 + s / 2, y_fork + 1)), UC_DIAG, UC_DIAG)

    zw = w.wide(540)
    z_shape = union(
        rect(10, CAP - h, zw - 10, CAP),
        rect(0, 0, zw, h),
        inter(stroke(zw - s * 0.62, CAP - h / 2, s * 0.62, h / 2, s), box(0, 0, zw - 10, CAP)),
    )
    g.add("Z", 0x5A, z_shape, UC_ROUND - 10, UC_ROUND - 10)
