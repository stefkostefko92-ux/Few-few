"""Step 10, the middle bracket (owner, 24.11.2026), as a function of second t: it goes up as A DX + B DX, is marked
through B's slots and drilled; the first hole stops on a rebar (the bit stops dead, a spark, steel at the bottom of
the hole). Away from the wall its B DX is unbolted and a B SX goes on the other face of A DX's web: they are
interchangeable, and the fixing face moves 65 mm aside, clear of the bar. Then marks, two holes, anchors, the ratchet
on the nut and the sill bolts. Times here, the rebar in rebar.py, the B SX mesh in build.py."""
import math
from mathutils import Matrix, Vector
from lib import MM, seg, lerp
from motion import basis, show, bump, blend, jitter
from hands import face_x, WEB, REBAR_COVER
from ratchet import stroke

DEG = math.radians
X2 = 0.31                     # PAIR_X[2] (build.py)
ANCHORS = (225.0, 52.0)       # build.ANCHORS
IN = (84.4, 86.2)             # up to the wall, A DX + B DX
MARK1 = 88.3                  # marker through the DX slots (1.45 s)
AWAY1 = (89.8, 90.3)
DRILL1 = {"come": (90.2, 90.7), "into": (90.75, 91.45), "out": (91.65, 92.1), "leave": (92.1, 92.6)}
HIT = DRILL1["into"][1]       # the bit meets the bar
UNBOLT, B_OUT, B_IN, REBOLT = (94.8, 95.6), (95.6, 96.6), (96.4, 97.4), (97.5, 98.3)
HOME2 = (98.5, 100.6)
MARK2 = 101.3                 # marker through the SX slots
AWAY2 = (102.7, 103.2)
DRILL2 = 103.1                # two holes, as in step 4, 2.7 s
HOLE2 = (DRILL2 + 0.65, DRILL2 + 1.75)
HOME3 = (105.9, 106.7)
ANCH = 106.8                  # anchors in at ANCH + 0.4 j, 0.8 s each
RATCHET = (108.0, 108.4, 109.6, 110.2)  # socket on, strokes from … to, socket off
SILLBOLTS = 110.2             # the sill bolts come up from below (1.4 s)


def face(j, swapped):
    return Vector((X2 + face_x(2, swapped) * MM, 0, ANCHORS[j] * MM))


def rig2(t):
    """matrix_basis of the middle pair's rig (wall-local), or None before step 10."""
    home = Matrix.Translation((X2, 0, 0))
    away = Matrix.Translation((X2, -0.3, -0.16))
    if t < 84.0:
        return None
    if t < IN[1]:
        return blend(Matrix.Translation((X2, -0.32, -0.22)), home, seg(t, *IN))
    for (a, b), (m0, m1) in ((AWAY1, (home, away)), (HOME2, (away, home)), (AWAY2, (home, away)), (HOME3, (away, home))):
        if t < a:
            return m0 @ jitter(t, 2) if m0 is home else m0
        if t < b:
            return blend(m0, m1, seg(t, a, b))
    return home


def swap(p, t):
    """B DX leaves, B SX comes in on the other face of A's web; the joint and lock bolts out and back, 5 mm over."""
    kout, kin = seg(t, *B_OUT), seg(t, *B_IN)
    p["B"].location = Vector((-0.10, -0.02, -0.16)) * kout
    show(p["B"], t < B_OUT[1])
    p["Bs"].location = Vector((0.10, -0.02, -0.12)) * (1 - kin)
    show(p["Bs"], t >= B_IN[0])
    shift = Vector((WEB * MM, 0, 0)) if t >= REBOLT[0] else Vector()
    k = seg(t, *REBOLT) if t >= REBOLT[0] else 1 - seg(t, *UNBOLT)
    for tag in ("joint", "lock"):
        for kind, ob, base in p["hw"][tag]:
            side = 1 if base.x > 0 else -1
            show(ob, t < UNBOLT[1] or t >= REBOLT[0])
            ob.location = base + shift + Vector((side * 0.06 * (1 - k), 0, 0))
            ob.rotation_euler = (DEG(360) * (1 - k) if kind == "nut" else 0.0, 0, 0)


def anchors(p, t):
    for j, an in enumerate(p["anchors"]):
        t0 = ANCH + 0.4 * j
        show(an["grp"], t >= t0)
        an["grp"].location = an["home"] + Vector((0, -0.11 * (1 - seg(t, t0, t0 + 0.8)), 0))
        spin = stroke(t, RATCHET[1], RATCHET[2], DEG(120))[1] if j == 0 else 0.0
        for kind, ob, base in an["parts"]:
            if kind == "nut":
                ob.matrix_basis = Matrix.Translation(base.translation) @ Matrix.Rotation(spin, 4, "Y") @ base.to_3x3().to_4x4()


def marks_holes(S, t):
    for k, j, hole, dust in S["holes"]:
        if k == 2:
            show(hole, t >= HOLE2[j])
            show(dust, t >= HOLE2[j])
    for k, j, mk in S["marks"]:
        if k == 2:
            for ob in mk:
                show(ob, MARK2 + (0.45, 1.0)[j] <= t < HOLE2[j])
    R = S["rebar"]
    opened = t >= DRILL1["into"][0] + 0.05
    R["mask"].outputs[0].default_value = 1.0 if opened else 0.0
    for ob in R["bar"]:
        show(ob, opened)
    show(R["bore"], opened)
    R["bore"]["geo"] = int(opened)  # the wall's hole opens with it (a material state, inside the bore's region)
    show(R["dust"], opened)
    show(R["scar"], t >= HIT)
    flash = HIT <= t < HIT + 0.09
    show(R["spark"], flash)
    R["light"].hide_render = not flash
    R["light"].data.energy = 0.08 if flash else 0.0
    for ob in R["marks"][0]:
        show(ob, MARK1 + 0.45 <= t < DRILL1["into"][0] + 0.05)
    for ob in R["marks"][1]:
        show(ob, t >= MARK1 + 1.0)


def marker_at(t, t0, h0, h1):
    """The marker through two slots (step 4's path, 1.45 s from t0); None outside."""
    if not t0 <= t < t0 + 1.45:
        return None
    a = h0 + Vector((0, -0.12, 0.05))
    if t < t0 + 0.3:
        return lerp(a, h0 + Vector((0, -0.01, 0)), seg(t, t0, t0 + 0.3))
    if t < t0 + 0.6:
        return lerp(h0 + Vector((0, -0.01, 0)), h0, bump(t, t0 + 0.3, t0 + 0.6))
    if t < t0 + 0.85:
        return lerp(h0 + Vector((0, -0.012, 0)), h1 + Vector((0, -0.01, 0)), seg(t, t0 + 0.6, t0 + 0.85))
    if t < t0 + 1.15:
        return lerp(h1 + Vector((0, -0.01, 0)), h1, bump(t, t0 + 0.85, t0 + 1.15))
    return lerp(h1 + Vector((0, -0.01, 0)), a, seg(t, t0 + 1.15, t0 + 1.45))


def drill_at(t, at_y):
    """Drill tip (wall-local) and bit spin, or None: the rebar hole (stops on the bar), then the two SX holes."""
    off = Vector((0, -0.06, 0))
    h0, h1 = face(0, False), face(0, True)
    far = h0 + Vector((0.1, -0.45, 0.12))
    D = DRILL1
    if D["come"][0] <= t < D["leave"][1]:
        hit = Vector((h0.x, at_y + REBAR_COVER, h0.z))
        if t < D["come"][1]:
            q = lerp(far, h0 + off, seg(t, *D["come"]))
        elif t < D["into"][1]:
            q = lerp(h0 + off, hit, seg(t, *D["into"], lambda x: x))
        elif t < D["out"][0]:
            q = hit + Vector((0, -0.002 * bump(t, HIT, HIT + 0.2), 0))
        elif t < D["out"][1]:
            q = lerp(hit, h0 + off, seg(t, *D["out"]))
        else:
            q = lerp(h0 + off, far, seg(t, *D["leave"]))
        return Vector(q), (t - 90.6) * 55.0 if 90.6 < t < HIT else HIT * 55.0, DEG(9) * bump(t, HIT, HIT + 0.35)
    t0 = DRILL2
    if t0 <= t < t0 + 2.7:
        a0, a1 = h1, face(1, True)
        deep = Vector((0, 0.045, 0))
        far2 = a0 + Vector((0.1, -0.45, 0.12))
        if t < t0 + 0.4:
            q = lerp(far2, a0 + off, seg(t, t0, t0 + 0.4))
        elif t < t0 + 1.2:
            q = a0 + (off.lerp(deep, seg(t, t0 + 0.4, t0 + 0.85)) if t < t0 + 0.85 else deep.lerp(off, seg(t, t0 + 0.85, t0 + 1.2)))
        elif t < t0 + 1.5:
            q = lerp(a0 + off, a1 + off, seg(t, t0 + 1.2, t0 + 1.5))
        elif t < t0 + 2.3:
            q = a1 + (off.lerp(deep, seg(t, t0 + 1.5, t0 + 1.95)) if t < t0 + 1.95 else deep.lerp(off, seg(t, t0 + 1.95, t0 + 2.3)))
        else:
            q = lerp(a1 + off, far2, seg(t, t0 + 2.3, t0 + 2.7))
        spin = t * 55.0 if (t0 + 0.35 < t < t0 + 1.15 or t0 + 1.45 < t < t0 + 2.25) else 0.0
        return Vector(q), spin, 0.0
    return None


def tools(S, t, W):
    """Marker and drill of step 10; True when one of them is on."""
    m = marker_at(t, MARK1, face(0, False), face(1, False)) or marker_at(t, MARK2, face(0, True), face(1, True))
    if m is not None:
        show(S["marker"], True)
        S["marker"].matrix_world = W @ Matrix.Translation(Vector(m) + Vector((0, -0.0006, 0))) @ Matrix.Rotation(DEG(-18), 4, "X") @ Matrix.Rotation(DEG(12), 4, "Z")
    d = drill_at(t, S["rebar"]["at"].y)
    if d is not None:
        q, spin, kick = d
        show(S["drill"], True)
        S["drill"].matrix_world = W @ Matrix.Translation(q) @ Matrix.Rotation(kick, 4, "Y")
        S["bit"].rotation_euler = (0, spin, 0)
    return m is not None or d is not None


def ratchet(t, W):
    """The ratchet on the middle anchor's nut (B SX: handle to the right, clear of its rib); None outside."""
    on, a, b, off = RATCHET
    if not on <= t < off:
        return None
    nut = face(0, True) + Vector((0, -0.0112, 0))
    swing, _ = stroke(t, a, b, DEG(120))
    k = seg(t, on, a) - seg(t, b, off)
    return W @ Matrix.Translation(nut + Vector((0, -0.12, 0)) * (1 - k)) @ Matrix.Rotation(swing, 4, "Y") @ basis((0, -1, 0), (0.95, 0, -0.3))


PUSH_IN = (92.6, 93.6)        # after the drill has gone, the camera closes in on the hole: steel at its bottom


def push_in(S, t, W, eye, target, lens, fp, fstop):
    """The drill10 camera, closing in on the rebar hole (wall face 12 cm away, nearly square on)."""
    k = seg(t, *PUSH_IN)
    if k <= 0:
        return eye, target, lens, fp, fstop
    hole = W @ S["rebar"]["at"]
    near = hole + Vector((-0.012, -0.12, 0.01))
    return lerp(Vector(eye), near, k), lerp(Vector(target), hole, k), lens + (50 - lens) * k, lerp(Vector(fp), hole, k), fstop + (5.6 - fstop) * k


def points(S, p, W):
    """Overlay points of step 10 (world)."""
    pv = p["pivot"].matrix_world
    b = p["Bs"] if not p["Bs"].hide_render else p["B"]
    return {
        "B_2": b.matrix_world @ Vector((0.035 if b is p["Bs"] else -0.03, -0.005, 0.12)),
        "Bdx_2": p["B"].matrix_world @ Vector((-0.03, -0.005, 0.12)),
        "Bsx_2": p["Bs"].matrix_world @ Vector((0.035, -0.005, 0.12)),
        "A_2": pv @ Vector((0.006, -0.11, 0.027)),
        "rebar": W @ (S["rebar"]["at"] + Vector((0, -0.001, 0))),
        "M2n": W @ face(0, True),
    }
