"""The mounted level of the counterweight-guide film as a function of second t, per side (SX left, DX right; the DX
side does each step off camera, a beat after the SX one we watch). Owner's order (25.11.2026): SU marked, drilled and
anchored; SG on its arm, snug; the rail; the N1 clips with washer, grower and nut; the rail to 5 mm from its plumb line;
everything tight. The ratchet and the level are placed in pose.py from the times here."""
import math
from mathutils import Matrix, Vector
from lib import MM, seg
from motion import show, jitter, blend
from ratchet import stroke
from parts import place, GROWER
from build import SLIDE0, SIGN

DEG = math.radians
SU_IN = {"sx": (12.2, 13.2), "dx": (19.8, 20.6)}      # held to the wall to be marked
SU_OUT = {"sx": (17.2, 18.0), "dx": (21.8, 22.6)}
SU_BACK = {"sx": (30.4, 31.4), "dx": (38.0, 39.0)}    # on its anchors
MARK = {"sx": 15.6, "dx": 21.0}                       # marker through the two slots (1.45 s, middle.marker_at)
DRILL = {"sx": 24.2, "dx": 27.0}                      # two holes in 2.7 s
ANCH = {"sx": 31.8, "dx": 39.2}                       # anchors in, 0.5 s apart, 0.9 s each
ANCH_TIGHT = {"sx": ((33.4, 34.8), (35.3, 36.7)), "dx": ((40.0, 40.1), (40.0, 40.1))}
SG_IN = {"sx": (44.4, 45.6), "dx": (56.3, 57.3)}
BOLT_TOP = {"sx": ((46.0, 46.8), (46.4, 47.2)), "dx": ((57.3, 57.31), (57.3, 57.31))}
BOLT_LOW = {"sx": ((49.6, 50.6), (50.0, 51.0)), "dx": ((57.3, 57.31), (57.3, 57.31))}
SPIN_ON = {"sx": ((50.6, 51.8), (51.0, 52.2)), "dx": ((57.3, 57.31), (57.3, 57.31))}
SNUG = {"sx": ((52.6, 53.6), (54.0, 55.0)), "dx": ((57.3, 57.31), (57.3, 57.31))}   # light: the grower a third down
RAIL_IN = {"sx": (59.6, 63.4), "dx": (59.9, 63.7)}  # lowered from above, straight down past its plumb line
CLIP_IN = {"sx": ((66.6, 67.5), (67.2, 68.1)), "dx": (74.0, 74.01)}
CSTACK_IN = {"sx": ((70.6, 71.4), (71.0, 71.8)), "dx": (74.5, 74.51)}
CSPIN = {"sx": ((71.6, 72.8), (72.0, 73.2)), "dx": (74.6, 74.61)}
ALIGN = {"sx": ((76.2, 78.6), (78.8, 79.8)), "dx": ((84.0, 84.5), (84.5, 84.8))}       # out from the wall, then aside
TIGHT = {"sx": ((88.6, 90.4), (90.8, 92.6)), "dx": ((97.0, 97.1), (97.0, 97.1))}       # SG nuts, from below
CTIGHT = {"sx": ((93.2, 94.8), (95.2, 96.8)), "dx": ((97.0, 97.1), (97.0, 97.1))}      # clip nuts, from behind


def su(h, t, hero):
    """The SU: held to the wall and marked, away while the holes are drilled, back on its anchors."""
    side = h["side"]
    away = Matrix.Translation(h["home"] + Vector((-SIGN[side] * 0.06, -0.32, -0.1)))
    home = Matrix.Translation(h["home"])
    a, b = SU_IN[side]
    c, d = SU_OUT[side]
    e, f = SU_BACK[side]
    if hero or t >= f:
        m, on = home, True
    elif t >= e:
        m, on = blend(away, home, seg(t, e, f)), True
    elif t >= d or t < a:
        m, on = away, False
    elif t < b:
        m, on = blend(away, home, seg(t, a, b)), True
    elif t < c:
        m, on = home @ jitter(t, 1 if side == "sx" else 2), True
    else:
        m, on = blend(home, away, seg(t, c, d)), True
    show(h["rig"], on)
    h["rig"].matrix_basis = m
    return on


def anchors(h, t, hero):
    side = h["side"]
    for j, an in enumerate(h["anchors"]):
        t0 = ANCH[side] + 0.5 * j
        show(an["grp"], hero or t >= t0)
        an["grp"].location = an["home"] + Vector((0, -0.11 * (1 - (1.0 if hero else seg(t, t0, t0 + 0.9))), 0))
        spin = DEG(120) if hero else stroke(t, *ANCH_TIGHT[side][j], DEG(120))[1]
        for kind, ob, base in an["parts"]:
            if kind == "nut":
                ob.matrix_basis = Matrix.Translation(base.translation) @ Matrix.Rotation(spin, 4, "Y") @ base.to_3x3().to_4x4()


def slide(side, t, hero):
    """The SG's offset from its aligned place: SLIDE0 (mirrored on DX) until it is set to the line."""
    if hero:
        return Vector()
    (a, b), (c, d) = ALIGN[side]
    s0 = Vector((SLIDE0.x * SIGN[side], SLIDE0.y, 0))
    return Vector((s0.x * (1 - seg(t, c, d)), s0.y * (1 - seg(t, a, b)), 0))


def squeeze(stack, kind, nut, c, spin):
    """Grower squeezed by c (0 free … 1 flat) under the nut, which rides on it, turned `spin`."""
    free = 1 - c
    at, ax = stack["home"][kind]
    stack[kind].scale = (1, 1, (GROWER[2] + GROWER[3] * free) / (GROWER[2] + GROWER[3]))
    n_at, n_ax = stack["home"][nut]
    place(stack[nut], n_at + n_ax * (GROWER[3] * free * MM), n_ax, spin)


def sg(h, t, hero):
    side = h["side"]
    a, b = SG_IN[side]
    on = hero or t >= a
    show(h["sg"], on)
    if not on:
        return
    lift = Vector((0, -0.02, 0.12)) * (1 - (1.0 if hero else seg(t, a, b)))
    h["sg"].location = h["sg_home"] + slide(side, t, hero) + lift
    for j, st in enumerate(h["bolts"]):
        (t0, t1), (l0, l1), (s0, s1), (n0, n1) = BOLT_TOP[side][j], BOLT_LOW[side][j], SPIN_ON[side][j], SNUG[side][j]
        (g0, g1) = TIGHT[side][j]
        top = hero or t >= t0
        for k in ("bigtop", "bolt"):
            show(st[k], top)
            at, ax = st["home"][k]
            place(st[k], at + Vector((0, 0, 0.06)) * (1 - (1.0 if hero else seg(t, t0, t1))), ax)
        low = hero or t >= l0
        for k in ("bigbot", "grower", "nut"):
            show(st[k], low)
        if not low:
            continue
        rise = Vector((0, 0, -0.06)) * (1 - (1.0 if hero else seg(t, l0, l1)))
        for k in ("bigbot", "grower"):
            at, ax = st["home"][k]
            place(st[k], at + rise, ax)
        on_k = 1.0 if hero else seg(t, s0, s1)
        c = 1.0 if hero else 0.35 * seg(t, n0, n1) + 0.65 * stroke(t, g0, g1, 1.0)[1]
        squeeze(st, "grower", "nut", c, DEG(1080) * on_k + DEG(80) * c)
        st["nut"].location = st["nut"].location + rise + st["home"]["nut"][1] * (0.008 * (1 - on_k))


def rail(h, t, hero):
    if "rail" not in h:
        return
    a, b = RAIL_IN[h["side"]]
    on = hero or t >= a
    show(h["rail"], on)
    if on:
        h["rail"].location = h["rail_home"] + Vector((0, 0, 0.6 * (1 - (1.0 if hero else seg(t, a, b)))))


def clips(h, t, hero):
    side = h["side"]
    for j, cl in enumerate(h["clips"]):
        a, b = CLIP_IN[side][j] if side == "sx" else CLIP_IN[side]
        show(cl["ob"], hero or t >= a)
        cl["ob"].location = cl["home"] + cl["out"] * (0.05 * (1 - (1.0 if hero else seg(t, a, b))))
    for j, st in enumerate(h["cstack"]):
        a, b = CSTACK_IN[side][j] if side == "sx" else CSTACK_IN[side]
        s0, s1 = CSPIN[side][j] if side == "sx" else CSPIN[side]
        g0, g1 = CTIGHT[side][j]
        on = hero or t >= a
        for k in ("washer", "grower", "nut"):
            show(st[k], on)
        if not on:
            continue
        back = st["down"] * (0.05 * (1 - (1.0 if hero else seg(t, a, b))))
        for k in ("washer", "grower"):
            at, ax = st["home"][k]
            place(st[k], at + back, ax)
        spun = 1.0 if hero else seg(t, s0, s1)
        c = 1.0 if hero else stroke(t, g0, g1, 1.0)[1]
        squeeze(st, "grower", "nut", c, DEG(900) * spun + DEG(80) * c)
        st["nut"].location = st["nut"].location + back + st["down"] * (0.007 * (1 - spun))


def side_at(h, t, hero=False):
    if not su(h, t, hero):
        return
    anchors(h, t, hero)
    sg(h, t, hero)
    rail(h, t, hero)
    clips(h, t, hero)
