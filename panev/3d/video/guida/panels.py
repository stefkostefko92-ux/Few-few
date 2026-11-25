"""Drawings of the counterweight-guide film over the frame (overlay.frame_overlay calls draw()): the 5 mm between the
head of the rail and its plumb line while the rail is set to it (step 8)."""
import math
from overlay import fade, s, WHITE, callout

GAP_SHOW = (80.0, 82.6)


def draw(c, t, pts):
    a, b = GAP_SHOW
    if not (a <= t < b and pts.get("tip_sx") and pts.get("wtip_sx")):
        return
    p, q = pts["tip_sx"][:2], pts["wtip_sx"][:2]

    def lines(d, sh):
        ang = math.atan2(q[1] - p[1], q[0] - p[0])
        nx, ny = -math.sin(ang), math.cos(ang)
        for e in (p, q):
            d.line(s(e[0], e[1], e[0] - nx * 70, e[1] - ny * 70), fill=(*WHITE, 255), width=2 * 2)
        d.line(s(p[0] - nx * 56, p[1] - ny * 56, q[0] - nx * 56, q[1] - ny * 56), fill=(*WHITE, 255), width=3 * 2)
    c.layer(fade(t, a, b, 0.4), lines)
    m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 56, 1]
    callout(c, t, m, "", "5 mm dalla testa della guida", a, b, 70, -110)
