"""Cyrillic lowercase а–я, plus Bulgarian alternates (*.bg) used by locl BGR."""

from __future__ import annotations

from geometry import ASC, DESC, OS, XH, box, diff, inter, lobe, mirror_x, rect, ring, rot180, shift, stroke, union
from glyphset import LC_DIAG, LC_ROUND, LC_STRAIGHT, GlyphSet
from shapes import k_branch, three_shape, top_hook

SAME_AS_LATIN = {0x430: "a", 0x435: "e", 0x43E: "o", 0x440: "p", 0x441: "c", 0x443: "y", 0x445: "x"}

TAIL = -140

# Bulgarian forms that are the Latin drawing (or a turned one).
BG_FROM_LATIN = {"uni0434.bg": "g", "uni043A.bg": "k", "uni043F.bg": "n", "uni0442.bg": "m", "uni0438.bg": "u"}


def add_cyrillic_lower(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.s, w.h
    mid = XH * 0.5
    adv_straight = LC_STRAIGHT

    for code, latin in SAME_AS_LATIN.items():
        g.alias(f"uni{code:04X}", code, latin)

    # б: round body, left side rising into a flag.
    bw = w.wide(470)
    be = union(
        ring(0, -OS, bw, XH + OS, s * 1.06, h),
        rect(0, XH * 0.5, s, ASC - 150),
        top_hook(0, bw * 0.78, ASC, 150, s, h),
    )
    g.add("uni0431", 0x431, inter(be, box(x1=bw)), LC_ROUND, LC_ROUND)

    vw = w.wide(430)
    vmid = XH * 0.53
    ve = union(
        rect(0, 0, s, XH),
        lobe(0, vmid - h / 2, vw - 30, XH, s, h, (XH - vmid) * 0.5),
        lobe(0, 0, vw, vmid + h / 2, s * 1.04, h, vmid * 0.52),
    )
    g.add("uni0432", 0x432, ve, adv_straight, LC_ROUND)

    g.add("uni0433", 0x433, union(rect(0, 0, s, XH), rect(0, XH - h, w.wide(360), XH)), adv_straight, LC_DIAG + 4)

    dw = w.wide(500)
    d_stem = dw - 50 - s
    de = union(
        rect(d_stem, 0, d_stem + s, XH),
        rect(dw * 0.3 - s * 0.5, XH - h, d_stem + s, XH),
        inter(stroke(dw * 0.3, XH, 80, h, s * 0.95), box(y0=h * 0.5, y1=XH)),
        rect(0, 0, dw, h),
        rect(0, TAIL, h * 1.15, h),
        rect(dw - h * 1.15, TAIL, dw, h),
    )
    g.add("uni0434", 0x434, de, LC_DIAG + 4, LC_DIAG + 4)

    zw = w.wide(700)
    zc = zw / 2
    right = k_branch(zc - s / 2, zw / 2 + s / 2, XH, s, 170, 290)
    zhe = union(rect(zc - s / 2, 0, zc + s / 2, XH), right, mirror_x(right, zc))
    g.add("uni0436", 0x436, zhe, LC_DIAG, LC_DIAG)
    g.add("uni0436.bg", None, union(zhe, rect(zc - s / 2, 0, zc + s / 2, ASC)), LC_DIAG, LC_DIAG)

    g.add("uni0437", 0x437, three_shape(w.wide(390), XH, s, h), LC_ROUND - 4, LC_ROUND)

    iw = w.wide(440)
    i_diag = inter(stroke(s * 0.45, 0, iw - s * 0.45, XH, s * 0.95), box(0, 0, iw, XH))
    g.add("uni0438", 0x438, union(rect(0, 0, s * 0.9, XH), rect(iw - s * 0.9, 0, iw, XH), i_diag), adv_straight, adv_straight)

    kw = w.wide(410)
    g.add("uni043A", 0x43A, union(rect(0, 0, s, XH), k_branch(0, kw, XH, s, 150, 270)), adv_straight, LC_DIAG)

    lw = w.wide(450)
    el = union(
        rect(lw - s, 0, lw, XH),
        rect(lw * 0.3 - s * 0.5, XH - h, lw, XH),
        inter(stroke(lw * 0.3, XH, s * 0.5, 0, s * 0.95), box(y0=0, y1=XH)),
    )
    g.add("uni043B", 0x43B, el, LC_DIAG, adv_straight)
    lam = inter(union(stroke(s * 0.5, 0, lw / 2, XH, h * 1.1), stroke(lw - s * 0.55, 0, lw / 2, XH, s)), box(y0=0, y1=XH))
    g.add("uni043B.bg", None, lam, LC_DIAG, LC_DIAG)

    mw = w.wide(560)
    m_diag = inter(union(stroke(s * 0.5 + 16, XH, mw / 2, 0, h * 1.1), stroke(mw - s * 0.5 - 16, XH, mw / 2, 0, h * 1.1)), box(0, 0, mw, XH))
    g.add("uni043C", 0x43C, union(rect(0, 0, s * 0.9, XH), rect(mw - s * 0.9, 0, mw, XH), m_diag), adv_straight, adv_straight)

    nw = w.wide(430)
    g.add("uni043D", 0x43D, union(rect(0, 0, s, XH), rect(nw - s, 0, nw, XH), rect(0, mid - h / 2, nw, mid + h / 2)), adv_straight, adv_straight)
    g.add("uni043F", 0x43F, union(rect(0, 0, s, XH), rect(nw - s, 0, nw, XH), rect(0, XH - h, nw, XH)), adv_straight, adv_straight)

    tw = w.wide(420)
    g.add("uni0442", 0x442, union(rect(0, XH - h, tw, XH), rect(tw / 2 - s / 2, 0, tw / 2 + s / 2, XH)), LC_DIAG + 6, LC_DIAG + 6)

    fw = w.wide(640)
    ef = union(ring(0, -OS, fw, XH + OS, s, h), rect(fw / 2 - s / 2, DESC, fw / 2 + s / 2, ASC))
    g.add("uni0444", 0x444, ef, LC_ROUND, LC_ROUND)

    cw = w.wide(440)
    tse = union(rect(0, 0, s, XH), rect(cw - s, 0, cw, XH), rect(0, 0, cw + 60, h), rect(cw + 60 - h * 1.15, TAIL, cw + 60, h))
    g.add("uni0446", 0x446, tse, adv_straight, LC_DIAG)

    chw = w.wide(420)
    ch_low, ch_depth = XH * 0.2, XH * 0.2
    ch_bowl = inter(ring(0, ch_low, chw, ch_low + 2 * ch_depth, s, h), box(y1=ch_low + ch_depth))
    g.add("uni0447", 0x447, union(ch_bowl, rect(0, ch_low + ch_depth - 1, s, XH), rect(chw - s, 0, chw, XH)), adv_straight - 4, adv_straight)

    shw = w.wide(660)
    sha = union(rect(0, 0, s, XH), rect(shw / 2 - s / 2, 0, shw / 2 + s / 2, XH), rect(shw - s, 0, shw, XH), rect(0, 0, shw, h))
    g.add("uni0448", 0x448, sha, adv_straight, adv_straight)
    tail = rect(shw + 60 - h * 1.15, TAIL, shw + 60, h)
    g.add("uni0449", 0x449, union(sha, rect(0, 0, shw + 60, h), tail), adv_straight, LC_DIAG)

    sw = w.wide(420)
    smid = XH * 0.58
    soft = union(rect(0, 0, s, XH), lobe(0, 0, sw, smid, s * 1.04, h, smid * 0.5))
    g.add("uni044C", 0x44C, soft, adv_straight, LC_ROUND)
    g.add("uni044A", 0x44A, union(shift(soft, 140), rect(0, XH - h, 140 + s, XH)), LC_DIAG + 6, LC_ROUND)
    g.add("uni044B", 0x44B, union(soft, rect(sw + 110, 0, sw + 110 + s, XH)), adv_straight, adv_straight)

    ew = w.wide(430)
    e_rev = mirror_x(diff(ring(0, -OS, ew, XH + OS, s * 1.06, h), box(x0=ew * 0.5, y0=148, y1=XH - 150)), ew / 2)
    g.add("uni044D", 0x44D, union(e_rev, rect(ew * 0.3, mid - h / 2, ew - s * 0.5, mid + h / 2)), LC_ROUND - 14, LC_ROUND)

    ow = w.wide(450)
    ox = s + 70
    yu = union(rect(0, 0, s, XH), rect(0, mid - h / 2, ox + 30, mid + h / 2), ring(ox, -OS, ox + ow, XH + OS, s * 1.06, h))
    g.add("uni044E", 0x44E, yu, adv_straight, LC_ROUND)
    g.add("uni044E.bg", None, union(yu, rect(0, 0, s, ASC)), adv_straight, LC_ROUND)

    yw = w.wide(420)
    ya_top = XH * 0.42
    ya_bowl = mirror_x(lobe(0, ya_top, yw, XH, s * 1.04, h, (XH - ya_top) * 0.5), yw / 2)
    ya_leg = inter(stroke(yw * 0.52, ya_top + h / 2, s * 0.5 - 16, 0, s), box(y0=0, y1=ya_top + h / 2))
    g.add("uni044F", 0x44F, union(rect(yw - s, 0, yw, XH), ya_bowl, ya_leg), LC_DIAG, adv_straight)

    # Bulgarian alternates borrowed from Latin drawings.
    for name, latin in BG_FROM_LATIN.items():
        g.alias(name, [], latin)
    m_turned = rot180(g.raw["m"], 0, XH / 2)
    g.add("uni0448.bg", None, m_turned, adv_straight - 4, adv_straight)
    x0, _, x1, _ = m_turned.bounds
    g.add("uni0449.bg", None, union(m_turned, rect(x1 - h * 1.15 + 50, TAIL, x1 + 50, h), rect(x1 - s, 0, x1 + 50, h)), adv_straight - 4, LC_DIAG)
    u_raw = g.raw["u"]
    ux0, _, ux1, _ = u_raw.bounds
    g.add("uni0446.bg", None, union(u_raw, rect(ux1 - s, 0, ux1 + 50, h), rect(ux1 + 50 - h * 1.15, TAIL, ux1 + 50, h)), adv_straight - 4, LC_DIAG)
