"""Punctuation and symbols, including Bulgarian „…“ quotes, guillemets, € and №."""

from __future__ import annotations

import math

from pathops import Path

from geometry import ASC, CAP, DESC, OS, XH, box, diff, ellipse, inter, mirror_x, poly, rect, ring, rot180, shift, stroke, union
from glyphset import LC_DIAG, LC_ROUND, LC_STRAIGHT, GlyphSet
from shapes import dot


def comma_shape(d: float, tail_w: float) -> Path:
    """Round head with a tail sweeping down-left; head sits on y=0."""
    head = dot(d / 2, 0, d)
    bottom = -(110 + d * 0.45)  # fixed-ish depth: a bold comma must not reach the next line
    tail = inter(stroke(d * 0.72, d * 0.45, d * 0.12, bottom, tail_w), box(y0=bottom, y1=d * 0.5))
    return union(head, tail)


def chevron(width: float, height: float, y0: float, t: float, pointing_left: bool) -> Path:
    mid = y0 + height / 2
    upper = stroke(width - t * 0.5, y0 + height, t * 0.5, mid, t)
    lower = stroke(t * 0.5, mid, width - t * 0.5, y0, t)
    shape = inter(union(upper, lower), box(x0=0, x1=width, y0=y0, y1=y0 + height))
    return shape if pointing_left else rot180(shape, width / 2, mid)


def add_punctuation(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.s, w.h
    d = s * 1.2

    period = dot(d / 2, 0, d)
    g.add("period", 0x2E, period, LC_ROUND + 10, LC_ROUND + 10)
    comma = comma_shape(d, s * 0.62)
    g.add("comma", 0x2C, comma, LC_ROUND + 10, LC_ROUND + 6)
    g.add("colon", 0x3A, union(period, dot(d / 2, XH - d, d)), LC_ROUND + 16, LC_ROUND + 16)
    g.add("semicolon", 0x3B, union(comma, dot(d / 2, XH - d, d)), LC_ROUND + 16, LC_ROUND + 10)
    g.add("ellipsis", 0x2026, union(period, shift(period, d * 2.1), shift(period, d * 4.2)), LC_ROUND + 10, LC_ROUND + 10)

    excl = union(poly((0, CAP), (d, CAP), (d * 0.5 + s * 0.38, 230), (d * 0.5 - s * 0.38, 230)), period)
    g.add("exclam", 0x21, excl, LC_STRAIGHT, LC_STRAIGHT)

    qw = w.wide(400)
    q_top = 330
    q_ring = ring(0, q_top, qw, CAP + OS, s, h)
    qcx, qcy = qw / 2, (q_top + CAP + OS) / 2
    question = union(
        inter(q_ring, union(box(y0=qcy + 50), box(x0=qcx, y1=qcy))),
        rect(qcx - s / 2, 230, qcx + s / 2, q_top + h),
        dot(qcx, 0, d),
    )
    g.add("question", 0x3F, question, LC_ROUND, LC_ROUND)

    g.add("hyphen", [0x2D, 0x2010], rect(0, 230, w.wide(250), 230 + h * 1.05), LC_DIAG + 30, LC_DIAG + 30)
    g.add("endash", 0x2013, rect(0, 232, 500, 232 + h), 0, 0)
    g.add("emdash", 0x2014, rect(0, 232, 1000, 232 + h), 0, 0)
    g.add("underscore", 0x5F, rect(0, -150, 500, -150 + h), 0, 0)

    ph = (DESC + 40, ASC + 30)
    paren = inter(ring(0, ph[0], 1000, ph[1], s * 0.95, s * 0.7), box(x1=210))
    g.add("parenleft", 0x28, paren, LC_ROUND + 20, LC_DIAG)
    g.add("parenright", 0x29, rot180(paren, 105, (ph[0] + ph[1]) / 2), LC_DIAG, LC_ROUND + 20)
    bracket = union(rect(0, ph[0], s, ph[1]), rect(0, ph[0], 190, ph[0] + h), rect(0, ph[1] - h, 190, ph[1]))
    g.add("bracketleft", 0x5B, bracket, LC_STRAIGHT, LC_DIAG)
    g.add("bracketright", 0x5D, rot180(bracket, 95, (ph[0] + ph[1]) / 2), LC_DIAG, LC_STRAIGHT)
    g.add("bar", 0x7C, rect(0, DESC, s * 0.8, ASC), LC_STRAIGHT + 20, LC_STRAIGHT + 20)

    slash = stroke(0, DESC + 60, 360, ASC, s * 0.9)
    g.add("slash", 0x2F, slash, 0, 0)
    g.add("backslash", 0x5C, stroke(360, DESC + 60, 0, ASC, s * 0.9), 0, 0)

    # Straight quotes: tapered wedges. Curly quotes: comma shapes (Bulgarian „ “, English “ ”).
    wedge = poly((0, CAP + 10), (s * 1.05, CAP + 10), (s * 0.78, CAP - 230), (s * 0.27, CAP - 230))
    g.add("quotesingle", 0x27, wedge, LC_STRAIGHT, LC_STRAIGHT)
    g.add("quotedbl", 0x22, union(wedge, shift(wedge, s * 2)), LC_STRAIGHT, LC_STRAIGHT)

    cq = shift(comma, 0, CAP - d)  # ’ sits on cap height
    oq = rot180(cq, d / 2, CAP - d / 2 - 90)  # ‘ is ’ turned
    gap = d * 1.55
    g.add("quoteright", 0x2019, cq, LC_ROUND + 10, LC_ROUND + 10)
    g.add("quoteleft", 0x2018, oq, LC_ROUND + 10, LC_ROUND + 10)
    g.add("quotedblright", 0x201D, union(cq, shift(cq, gap)), LC_ROUND + 10, LC_ROUND + 10)
    g.add("quotedblleft", 0x201C, union(oq, shift(oq, gap)), LC_ROUND + 10, LC_ROUND + 10)
    g.add("quotesinglbase", 0x201A, comma, LC_ROUND + 10, LC_ROUND + 10)
    g.add("quotedblbase", 0x201E, union(comma, shift(comma, gap)), LC_ROUND + 10, LC_ROUND + 10)

    cv_w, cv_h, cv_y = 190, 300, 90
    left = chevron(cv_w, cv_h, cv_y, s * 0.82, True)
    right = chevron(cv_w, cv_h, cv_y, s * 0.82, False)
    g.add("guilsinglleft", 0x2039, left, LC_DIAG + 20, LC_DIAG + 20)
    g.add("guilsinglright", 0x203A, right, LC_DIAG + 20, LC_DIAG + 20)
    g.add("guillemetleft", 0xAB, union(left, shift(left, cv_w * 0.85)), LC_DIAG + 20, LC_DIAG + 20)
    g.add("guillemetright", 0xBB, union(right, shift(right, cv_w * 0.85)), LC_DIAG + 20, LC_DIAG + 20)

    mw = w.wide(500)
    math_y = 300
    g.add("plus", 0x2B, union(rect(0, math_y - h / 2, mw, math_y + h / 2), rect(mw / 2 - h / 2, math_y - mw / 2, mw / 2 + h / 2, math_y + mw / 2)), LC_ROUND, LC_ROUND)
    g.add("minus", 0x2212, rect(0, math_y - h / 2, mw, math_y + h / 2), LC_ROUND, LC_ROUND)
    g.add("equal", 0x3D, union(rect(0, math_y + 50, mw, math_y + 50 + h), rect(0, math_y - 50 - h, mw, math_y - 50)), LC_ROUND, LC_ROUND)
    lt = chevron(mw * 0.9, mw * 0.85, math_y - mw * 0.425, h * 1.05, True)
    g.add("less", 0x3C, lt, LC_ROUND, LC_ROUND)
    g.add("greater", 0x3E, rot180(lt, mw * 0.45, math_y), LC_ROUND, LC_ROUND)
    times_arm = stroke(0, math_y - mw * 0.36, mw * 0.72, math_y + mw * 0.36, h)
    times = inter(union(times_arm, mirror_x(times_arm, mw * 0.36)), box(y0=math_y - mw * 0.36, y1=math_y + mw * 0.36))
    g.add("multiply", 0xD7, times, LC_ROUND, LC_ROUND)

    asterisk_arm = rect(-h * 0.5, 0, h * 0.5, 150)
    arms = [asterisk_arm.transform(math.cos(a), math.sin(a), -math.sin(a), math.cos(a), 0, 0) for a in (math.radians(k * 72) for k in range(5))]
    g.add("asterisk", 0x2A, shift(union(*arms), 0, CAP - 150), LC_ROUND, LC_ROUND)

    hw = w.wide(560)
    hash_v = stroke(hw * 0.32, 0, hw * 0.42, CAP - 40, s * 0.85)
    hash_ = union(
        hash_v,
        shift(hash_v, hw * 0.3),
        rect(hw * 0.08, 200, hw, 200 + h),
        rect(0, 450, hw * 0.92, 450 + h),
    )
    g.add("numbersign", 0x23, inter(hash_, box(y0=0, y1=CAP - 40)), LC_DIAG + 10, LC_DIAG + 10)

    pc = 230
    pct = union(
        ring(0, CAP - pc - 20, pc - 20, CAP + OS, s * 0.8, h * 0.8),
        ring(380, -OS, 380 + pc - 20, pc + 20, s * 0.8, h * 0.8),
        inter(stroke(80, -OS, 520, CAP + OS, s * 0.75), box(y0=-OS, y1=CAP + OS)),
    )
    g.add("percent", 0x25, pct, LC_ROUND, LC_ROUND)

    g.add("degree", 0xB0, ring(0, CAP - 250, 250, CAP + OS, h * 0.95, h * 0.95), LC_ROUND, LC_ROUND)
    g.add("periodcentered", 0xB7, dot(d / 2, math_y - d / 2, d), LC_ROUND + 10, LC_ROUND + 10)
    g.add("bullet", 0x2022, dot(d * 0.8, math_y - d * 0.8, d * 1.6), LC_ROUND + 20, LC_ROUND + 20)

    tl = w.wide(500)
    wave = union(
        inter(ring(0, 230, tl * 0.5 + h * 0.5, 430, h, h), box(y0=330)),
        inter(ring(tl * 0.5 - h * 0.5, 230, tl, 430, h, h), box(y1=330)),
    )
    g.add("asciitilde", 0x7E, wave, LC_ROUND, LC_ROUND)
    caret = inter(union(stroke(h * 0.6, CAP - 300, 150, CAP, h), stroke(300 - h * 0.6, CAP - 300, 150, CAP, h)), box(y0=CAP - 300, y1=CAP))
    g.add("asciicircum", 0x5E, caret, LC_DIAG + 20, LC_DIAG + 20)

    # € : C with two bars; № : N + raised o with underline.
    ew = w.wide(600)
    e_ring = diff(ring(110, -OS, 110 + ew - 60, CAP + OS, w.cs * 1.04, w.ch), box(x0=110 + (ew - 60) * 0.5, y0=200, y1=CAP - 200))
    euro = union(e_ring, rect(0, 380, 400, 380 + h * 0.95), rect(0, 240, 360, 240 + h * 0.95))
    g.add("Euro", 0x20AC, euro, LC_DIAG, LC_ROUND - 10)

    nw = w.wide(560)
    n_diag = inter(stroke(w.cs * 0.42, CAP, nw - w.cs * 0.42, 0, w.cs * 0.95), box(0, 0, nw, CAP))
    n_cap = union(rect(0, 0, w.cs * 0.84, CAP), rect(nw - w.cs * 0.84, 0, nw, CAP), n_diag)
    o_w = 260 + (s - 86) * 1.4
    o_small = ring(nw + 70, CAP - 330, nw + 70 + o_w, CAP + OS, s * 0.85, h * 0.8)
    numero = union(n_cap, o_small, rect(nw + 70, CAP - 400 - h, nw + 70 + o_w, CAP - 400))
    g.add("numero", 0x2116, numero, LC_STRAIGHT + 14, LC_ROUND)

    # @ : single-storey a inside an open ring.
    ig = (s - 86) * 0.8
    inner = union(ring(220 - ig, 90 - ig * 0.5, 500, 470 + ig * 0.5, s * 0.95, h), rect(500 - s * 0.95, 90 - ig * 0.5, 500, 470 + ig * 0.5))
    outer = diff(ring(0, -170, 800, 720, s * 0.82, s * 0.82), box(x0=500, y0=-200, y1=200))
    tail = inter(ring(500 - s * 0.95, 0, 800, 400, s * 0.95, h * 0.9), box(y1=205, x0=500 - s * 0.95))
    g.add("at", 0x40, union(inner, outer, tail), LC_ROUND, LC_ROUND)

    # & : loop on top, open bowl below, leg out to the right.
    grow = (s - 86) * 1.3  # bolder strokes need bigger loops or the counters close up
    loop = ring(80, 370 - grow * 0.3, 380 + grow, CAP + OS, s * 0.9, h)
    bowl = diff(ring(0, -OS, 470, 440, s, h), box(x0=235, y0=190))
    leg = inter(stroke(120, 470, 590, 0, s), box(y0=0, y1=470))
    arm = inter(stroke(400, 120, 560, 360, s * 0.95), box(y0=120, y1=360))
    amp = union(loop, bowl, leg, arm)
    loop_counter = ellipse(80 + s * 0.9, 370 - grow * 0.3 + h, 380 + grow - s * 0.9, CAP + OS - h)
    g.add("ampersand", 0x26, diff(amp, loop_counter), LC_ROUND, LC_DIAG)
