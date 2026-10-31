"""Lining tabular figures 0–9."""

from __future__ import annotations

from geometry import CAP, KAPPA, OS, box, diff, ellipse, inter, rect, ring, rot180, shift, stroke, union
from glyphset import GlyphSet
from shapes import s_curve, three_shape


def add_figures(g: GlyphSet) -> None:
    w = g.weight
    s, h = w.cs * 0.94, w.ch
    adv = w.wide(570)  # every figure shares one advance: columns of numbers line up
    fw = w.wide(450)

    zero = ring(0, -OS, fw, CAP + OS, s, h)
    g.add("zero", 0x30, zero, 0, 0, advance=adv)

    x1 = fw * 0.5
    one = union(
        rect(x1, 0, x1 + s, CAP),
        inter(stroke(x1 - 150, CAP - 200, x1 + s * 0.4, CAP, h * 1.05), box(x1=x1 + s, y1=CAP)),
    )
    g.add("one", 0x31, one, 0, 0, advance=adv)

    # 2: top half-ring flowing into a diagonal, flat base. The diagonal starts inside the
    # ring's right stroke; outside the ring it is trimmed to the outer curve.
    ry = CAP * 0.3
    cy = CAP + OS - ry
    outer2 = ellipse(0, cy - ry, fw, CAP + OS)
    counter2 = ellipse(s, cy - ry + h, fw - s, CAP + OS - h, KAPPA + 0.03)
    top = inter(diff(outer2, counter2), union(box(y0=cy + 40), box(x0=fw / 2, y0=cy - ry * 0.35)))
    diag2 = stroke(fw - s * 0.52, cy - ry * 0.3, s * 0.6, h * 0.5, s * 0.9)
    diag2 = inter(diag2, box(0, h * 0.5, fw, CAP), union(outer2, box(y1=cy - ry * 0.6)))
    two = union(top, diag2, rect(0, 0, fw + 10, h))
    g.add("two", 0x32, two, 0, 0, advance=adv)

    three = three_shape(fw, CAP, s, h)
    g.add("three", 0x33, three, 0, 0, advance=adv)

    fx = fw - s - 40
    bar = 190
    four = union(
        rect(fx, 0, fx + s, CAP),
        rect(0, bar, fw, bar + h),
        inter(stroke(fx + s * 0.55, CAP, s * 0.5, bar + h / 2, s * 0.95), box(x0=0, x1=fx + s, y0=bar, y1=CAP)),
    )
    g.add("four", 0x34, four, 0, 0, advance=adv)

    # 5: flag, stem flowing straight into the bowl's left side, open lower-left terminal.
    bowl_top = CAP * 0.6
    bcx5, bcy5 = fw / 2, bowl_top / 2
    b5 = inter(
        ring(0, -OS, fw, bowl_top + OS, s, h),
        union(box(x0=bcx5), box(y1=bcy5 - CAP * 0.1), box(y0=bcy5)),
    )
    five = union(rect(0, CAP - h, fw - 10, CAP), rect(0, bcy5, s, CAP), b5)
    g.add("five", 0x35, five, 0, 0, advance=adv)

    # 6 and 9 are the same drawing turned around.
    bowl6_top = CAP * 0.6
    bowl6 = ring(0, -OS, fw, bowl6_top + OS, s, h)
    big = ring(0, -OS, fw + 40, CAP + OS, s, h)
    big_cy = CAP / 2
    six = union(
        bowl6,
        rect(0, bowl6_top / 2, s, big_cy),
        inter(big, union(box(x1=(fw + 40) / 2), box(y0=CAP - 210)), box(y0=big_cy)),
    )
    six = inter(six, box(x1=fw))
    g.add("six", 0x36, six, 0, 0, advance=adv)
    g.add("nine", 0x39, rot180(six, fw / 2, CAP / 2), 0, 0, advance=adv)

    seven = union(
        rect(0, CAP - h, fw, CAP),
        inter(stroke(fw - s * 0.6, CAP - h, fw * 0.32, 0, s), box(y0=0, y1=CAP)),
    )
    g.add("seven", 0x37, seven, 0, 0, advance=adv)

    ym8 = CAP * 0.54
    eight = union(ring(28, ym8 - h / 2, fw - 28, CAP + OS, s * 0.94, h), ring(0, -OS, fw, ym8 + h / 2, s, h))
    g.add("eight", 0x38, eight, 0, 0, advance=adv)

    # Dollar sign reuses the S spine.
    dollar = union(s_curve(fw, CAP - 60, s, h), rect(fw / 2 - h * 0.45, -110, fw / 2 + h * 0.45, CAP + 50))
    g.add("dollar", 0x24, shift(dollar, 0, 30), 0, 0, advance=adv)

