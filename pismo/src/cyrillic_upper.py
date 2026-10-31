"""Cyrillic capitals А–Я (+ Ё Ѝ Й via marks.py)."""

from __future__ import annotations

from geometry import CAP, OS, box, diff, inter, lobe, mirror_x, rect, ring, shift, stroke, union
from glyphset import UC_DIAG, UC_ROUND, UC_STRAIGHT, GlyphSet
from shapes import k_branch, three_shape

# Cyrillic letters that share the Latin drawing exactly.
SAME_AS_LATIN = {
    0x410: "A", 0x412: "B", 0x415: "E", 0x41A: "K", 0x41C: "M", 0x41D: "H",
    0x41E: "O", 0x420: "P", 0x421: "C", 0x422: "T", 0x425: "X",
}

DESC_TAIL = -150


def add_cyrillic_upper(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.cs, w.ch
    mid = CAP * 0.5

    for code, latin in SAME_AS_LATIN.items():
        g.alias(f"uni{code:04X}", code, latin)

    bw = w.wide(530)
    bmid = CAP * 0.56
    be = union(rect(0, 0, s, CAP), rect(0, CAP - h, bw - 50, CAP), lobe(0, 0, bw, bmid, s * 1.06, h, bmid * 0.5))
    g.add("uni0411", 0x411, be, UC_STRAIGHT, UC_ROUND)

    g.add("uni0413", 0x413, union(rect(0, 0, s, CAP), rect(0, CAP - h, w.wide(450), CAP)), UC_STRAIGHT, UC_DIAG + 6)

    dw = w.wide(660)
    d_stem_x = dw - 60 - s
    d_leg = inter(stroke(dw * 0.3, CAP, 95, h, s * 0.95), box(y0=h * 0.5, y1=CAP))
    de = union(
        rect(d_stem_x, 0, d_stem_x + s, CAP),
        rect(dw * 0.3 - s * 0.5, CAP - h, d_stem_x + s, CAP),
        d_leg,
        rect(0, 0, dw, h),
        rect(0, DESC_TAIL, h * 1.15, h),
        rect(dw - h * 1.15, DESC_TAIL, dw, h),
    )
    g.add("uni0414", 0x414, de, UC_DIAG + 4, UC_DIAG + 4)

    zw = w.wide(860)
    zc = zw / 2
    right = k_branch(zc - s / 2, zw / 2 + s / 2, CAP, s, 250, 400)
    zhe = union(rect(zc - s / 2, 0, zc + s / 2, CAP), right, mirror_x(right, zc))
    g.add("uni0416", 0x416, zhe, UC_DIAG, UC_DIAG)

    g.add("uni0417", 0x417, three_shape(w.wide(500), CAP, s, h), UC_ROUND - 4, UC_ROUND)

    iw = w.wide(620)
    i_diag = inter(stroke(s * 0.45, 0, iw - s * 0.45, CAP, s * 0.98), box(0, 0, iw, CAP))
    g.add("uni0418", 0x418, union(rect(0, 0, s * 0.86, CAP), rect(iw - s * 0.86, 0, iw, CAP), i_diag), UC_STRAIGHT, UC_STRAIGHT)

    lw = w.wide(600)
    l_leg = inter(stroke(lw * 0.3, CAP, s * 0.5, 0, s * 0.95), box(y0=0, y1=CAP))
    el = union(rect(lw - s, 0, lw, CAP), rect(lw * 0.3 - s * 0.5, CAP - h, lw, CAP), l_leg)
    g.add("uni041B", 0x41B, el, UC_DIAG, UC_STRAIGHT)

    pw = w.wide(600)
    g.add("uni041F", 0x41F, union(rect(0, 0, s, CAP), rect(pw - s, 0, pw, CAP), rect(0, CAP - h, pw, CAP)), UC_STRAIGHT, UC_STRAIGHT)

    uw = w.wide(620)
    u_long = stroke(uw - s * 0.55, CAP, uw * 0.2, 0, s)
    meet_y = CAP * 0.3
    meet_x = uw * 0.2 + (uw - s * 0.55 - uw * 0.2) * meet_y / CAP
    u_short = stroke(h * 0.6, CAP, meet_x, meet_y, h * 1.12)
    g.add("uni0423", 0x423, inter(union(u_long, u_short), box(y0=0, y1=CAP)), UC_DIAG, UC_DIAG)

    fw = w.wide(760)
    ef = union(ring(0, 70, fw, CAP - 50, s * 0.95, h), rect(fw / 2 - s / 2, 0, fw / 2 + s / 2, CAP))
    g.add("uni0424", 0x424, ef, UC_ROUND, UC_ROUND)

    cw = w.wide(600)
    tse = union(
        rect(0, 0, s, CAP),
        rect(cw - s, 0, cw, CAP),
        rect(0, 0, cw + 70, h),
        rect(cw + 70 - h * 1.15, DESC_TAIL, cw + 70, h),
    )
    g.add("uni0426", 0x426, tse, UC_STRAIGHT, UC_DIAG)

    chw = w.wide(560)
    ch_low = CAP * 0.22
    ch_depth = CAP * 0.2
    ch_bowl = inter(ring(0, ch_low, chw, ch_low + 2 * ch_depth, s, h), box(y1=ch_low + ch_depth))
    che = union(ch_bowl, rect(0, ch_low + ch_depth - 1, s, CAP), rect(chw - s, 0, chw, CAP))
    g.add("uni0427", 0x427, che, UC_STRAIGHT - 6, UC_STRAIGHT)

    shw = w.wide(860)
    sha = union(rect(0, 0, s, CAP), rect(shw / 2 - s / 2, 0, shw / 2 + s / 2, CAP), rect(shw - s, 0, shw, CAP), rect(0, 0, shw, h))
    g.add("uni0428", 0x428, sha, UC_STRAIGHT, UC_STRAIGHT)
    shcha = union(sha, rect(0, 0, shw + 70, h), rect(shw + 70 - h * 1.15, DESC_TAIL, shw + 70, h))
    g.add("uni0429", 0x429, shcha, UC_STRAIGHT, UC_DIAG)

    sw = w.wide(520)
    smid = CAP * 0.56
    soft = union(rect(0, 0, s, CAP), lobe(0, 0, sw, smid, s * 1.06, h, smid * 0.5))
    g.add("uni042C", 0x42C, soft, UC_STRAIGHT, UC_ROUND)
    g.add("uni042A", 0x42A, union(shift(soft, 170), rect(0, CAP - h, 170 + s, CAP)), UC_DIAG + 6, UC_ROUND)
    yeru = union(soft, rect(sw + 130, 0, sw + 130 + s, CAP))
    g.add("uni042B", 0x42B, yeru, UC_STRAIGHT, UC_STRAIGHT)

    ew = w.wide(610)
    e_rev = mirror_x(diff(ring(0, -OS, ew, CAP + OS, s * 1.06, h), box(x0=ew * 0.5, y0=200, y1=CAP - 200)), ew / 2)
    g.add("uni042D", 0x42D, union(e_rev, rect(ew * 0.32, mid - h / 2, ew - s * 0.5, mid + h / 2)), UC_ROUND - 14, UC_ROUND)

    ow = w.wide(640)
    ox = s + 90
    yu = union(rect(0, 0, s, CAP), rect(0, mid - h / 2, ox + 30, mid + h / 2), ring(ox, -OS, ox + ow, CAP + OS, s * 1.06, h))
    g.add("uni042E", 0x42E, yu, UC_STRAIGHT, UC_ROUND)

    yw = w.wide(560)
    ya_top = CAP * 0.40
    ya_bowl = mirror_x(lobe(0, ya_top, yw, CAP, s * 1.06, h, (CAP - ya_top) * 0.5), yw / 2)
    ya_leg = inter(stroke(yw * 0.52, ya_top + h / 2, s * 0.5 - 20, 0, s), box(y0=0, y1=ya_top + h / 2))
    g.add("uni042F", 0x42F, union(rect(yw - s, 0, yw, CAP), ya_bowl, ya_leg), UC_DIAG, UC_STRAIGHT)
