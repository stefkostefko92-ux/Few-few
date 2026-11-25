"""The counterweight-guide film as a function of time: pose(S, t, scene, shot) places every object for second t and
returns the screen points the overlay needs (1920x1080 design space). Steps (owner, 25.11.2026): 1 plumb lines ·
2 SU marked · 3 holes · 4 SU anchored · 5 SG snug (large washers, grower) · 6 rail · 7 N1 clips · 8 rail to its line ·
9 all tight. SX on the left, DX on the right; the camera follows SX, DX keeps a beat behind (steps.py)."""
import math
import bpy
from mathutils import Matrix, Vector
from lib import MM, seg, lerp, look_at
from motion import basis, show, screen
from ratchet import stroke
from middle import marker_at
from timeline import TIMELINE
from build import RAIL_Y0, RAIL_STRETCH, SIGN
import steps as st

DEG = math.radians
SHOTS = {  # eye, target, lens
    "intro": ((-0.16, -0.62, 0.3), (-0.42, -0.1, 0.07), 50),
    "fili": ((0.0, -1.55, 0.2), (0.0, 0.0, -0.05), 28),
    "trac": ((-0.3, -0.45, 0.02), (-0.46, 0.0, 0.03), 32),
    "tracw": ((0.15, -0.95, 0.2), (0.44, -0.02, 0.03), 32),
    "fora": ((-0.86, -0.62, 0.12), (-0.48, -0.02, 0.03), 34),
    "fiss": ((-0.22, -0.72, 0.18), (-0.47, -0.03, 0.03), 40),
    "fissw": ((0.0, -1.45, 0.2), (0.0, 0.0, 0.02), 30),
    "sg": ((-0.62, -0.38, 0.22), (-0.39, -0.09, 0.07), 45),
    "sg2": ((-0.55, -0.36, -0.02), (-0.39, -0.09, 0.055), 50),
    "sgw": ((0.22, -1.25, 0.26), (0.26, -0.05, 0.05), 32),
    "rail": ((0.75, -1.2, 0.45), (-0.15, 0.0, 0.05), 28),
    "graffe": ((-0.16, -0.46, 0.2), (-0.36, -0.1, 0.09), 40),
    "graffe2": ((-0.75, -0.35, 0.2), (-0.38, -0.12, 0.09), 40),
    "piombo": ((-0.27, -0.42, 0.15), (-0.305, -0.1, 0.085), 60),
    "piombow": ((0.0, -1.6, 0.42), (0.0, 0.0, 0.05), 30),
    "serr": ((-0.66, -0.5, -0.14), (-0.4, -0.09, 0.06), 36),
    "finale": ((-0.12, -0.5, 0.2), (-0.38, -0.08, 0.06), 35),
}
FOCUS = {
    "intro": ((-0.38, -0.1, 0.08), 8.0), "fili": ((0.0, -0.1, 0.0), 8.0), "trac": ((-0.46, 0.0, 0.03), 5.6),
    "tracw": ((0.46, -0.02, 0.03), 5.6), "fora": ((-0.5, 0.0, 0.03), 2.8), "fiss": ((-0.46, -0.01, 0.03), 4.5),
    "fissw": ((0.0, -0.05, 0.03), 8.0), "sg": ((-0.39, -0.08, 0.07), 5.6), "sg2": ((-0.38, -0.08, 0.05), 6.3), "sgw": ((0.42, -0.1, 0.06), 6.3),
    "rail": ((0.0, -0.1, 0.1), 8.0), "graffe": ((-0.35, -0.1, 0.09), 4.0), "graffe2": ((-0.37, -0.11, 0.09), 5.6),
    "piombo": ((-0.3, -0.1, 0.09), 8.0), "piombow": ((0.0, -0.1, 0.05), 8.0), "serr": ((-0.4, -0.09, 0.06), 4.0),
    "finale": ((-0.38, -0.08, 0.06), 5.6),
}
WIRE_IN = {"sx": (4.6, 7.6), "dx": (5.0, 8.0)}   # the bob lowered from the top, then it swings to rest
PULL = (98.4, 104.6, (0.05, -1.6, 0.2), (0.0, 0.0, 0.7), 22, (0.0, -0.1, 0.5), 8.0)  # the finale's pull-back: to where
BOB_Z = -1.6                                     # m: where the bob hangs, near the pit


def shot_at(t):
    for name, a, b in TIMELINE:
        if a <= t < b:
            return name
    return TIMELINE[-1][0]


def wires(S, t, hero):
    for side, (pv, line, bob) in S["wires"].items():
        a, b = WIRE_IN[side]
        on = (not hero) and t >= a
        show(pv, on)
        if not on:
            continue
        L = pv.location.z - BOB_Z
        length = 0.25 + (L - 0.25) * seg(t, a, b)
        line.location.z, line.scale.z = -length, length
        bob.location.z = -length
        u = max(0.0, t - b)
        damp = math.exp(-u / 1.6) if t < b + 9 else 0.0
        T = 2 * math.pi * math.sqrt(L / 9.81)
        ph = 0.0 if side == "sx" else 1.3
        pv.rotation_euler = (0.006 * damp * math.sin(2 * math.pi * u / T + ph) + (0.01 * (1 - seg(t, a, b)) if t < b else 0.0),
                             0.008 * damp * math.sin(2 * math.pi * u / T + 0.7 + ph), 0)


def level_at(S, t, sx):
    """The spirit level: on the SU plate (in bolla, steps 2 and 4), then up against the rail's blade (step 8)."""
    lv = S["level"]
    rig = sx["rig"].matrix_world
    if 13.4 <= t < 15.4 or 37.2 <= t < 39.6:
        a, b = (13.4, 15.4) if t < 20 else (37.2, 39.6)
        k = seg(t, a, a + 0.5) - seg(t, b - 0.5, b)
        show(lv, True)
        lv.matrix_world = rig @ Matrix.Translation((0.11, -0.016 - 0.2 * (1 - k), 0.065 + 0.12 * (1 - k)))
        S["bub1"].location.x, S["bub2"].location.z = 0.0, 0.026
        return lv.matrix_world @ Vector((0, -0.013, 0.05))
    if 82.6 <= t < 85.2:
        k = seg(t, 82.6, 83.2) - seg(t, 84.7, 85.2)
        rail = sx["rail"].matrix_world
        face = rail @ Vector((0.0225, -0.0025, (90.0 - RAIL_Y0) * MM / RAIL_STRETCH))  # the blade's front face, level with the SG
        show(lv, True)
        lv.matrix_world = Matrix.Translation(face + Vector((0, -0.15 * (1 - k), 0))) @ basis((0, -1, 0), (0, 0, 1))
        S["bub1"].location.x, S["bub2"].location.z = 0.012, 0.026
        return lv.matrix_world @ Vector((0, -0.013, 0.05))
    return None


def ratchet_at(S, t, sx):
    """The 17 mm deep socket on: the SU anchor nuts (step 4), the SG nuts from below (5 snug, 9 tight), the clip nuts
    from behind the flange (9)."""
    def on_nut(nut_ob, ax, a, b, total, hint, n=3):
        c = nut_ob.matrix_world @ Vector((0, 0, 4.2 * MM))
        swing, _ = stroke(t, a, b, total, n)
        k = seg(t, a - 0.4, a) - seg(t, b, b + 0.5)
        return Matrix.Translation(c + ax * (0.12 * (1 - k))) @ Matrix.Rotation(swing, 4, ax) @ basis(ax, hint)
    for j, (a, b) in enumerate(st.ANCH_TIGHT["sx"]):
        if a - 0.4 <= t < b + 0.5:
            c = sx["anchors"][j]["grp"].matrix_world @ Vector((0, -0.0112, 0))
            swing, _ = stroke(t, a, b, DEG(120))
            k = seg(t, a - 0.4, a) - seg(t, b, b + 0.5)
            return Matrix.Translation(c + Vector((0, -0.12, 0)) * (1 - k)) @ Matrix.Rotation(swing, 4, "Y") @ basis((0, -1, 0), (0.95, 0, -0.3))
    for table, total, n in ((st.SNUG, DEG(60), 2), (st.TIGHT, DEG(150), 3)):
        for j, (a, b) in enumerate(table["sx"]):
            if a - 0.4 <= t < b + 0.5:
                bolt = sx["bolts"][j]
                ax = (sx["sg"].matrix_world.to_3x3() @ bolt["down"]).normalized()
                return on_nut(bolt["nut"], ax, a, b, total, (0.95, -0.3, 0), n)
    for j, (a, b) in enumerate(st.CTIGHT["sx"]):
        if a - 0.4 <= t < b + 0.5:
            cs = sx["cstack"][j]
            ax = (sx["sg"].matrix_world.to_3x3() @ cs["down"]).normalized()
            return on_nut(cs["nut"], ax, a, b, DEG(150), (0, -0.4, -0.9))
    return None


def tools(S, t, sx):
    for k in ("drill", "marker", "ratchet", "level"):
        show(S[k], False)
    h0, h1 = (an["wall"] for an in sx["anchors"])
    m = marker_at(t, st.MARK["sx"], h0, h1)
    if m is not None:
        show(S["marker"], True)
        S["marker"].matrix_world = Matrix.Translation(Vector(m) + Vector((0, -0.0006, 0))) @ Matrix.Rotation(DEG(-18), 4, "X") @ Matrix.Rotation(DEG(12), 4, "Z")
    t0 = st.DRILL["sx"]
    if t0 <= t < t0 + 2.7:
        off, deep = Vector((0, -0.06, 0)), Vector((0, 0.045, 0))
        far = h0 + Vector((-0.1, -0.45, 0.12))
        if t < t0 + 0.4:
            q = lerp(far, h0 + off, seg(t, t0, t0 + 0.4))
        elif t < t0 + 1.2:
            q = h0 + (off.lerp(deep, seg(t, t0 + 0.4, t0 + 0.85)) if t < t0 + 0.85 else deep.lerp(off, seg(t, t0 + 0.85, t0 + 1.2)))
        elif t < t0 + 1.5:
            q = lerp(h0 + off, h1 + off, seg(t, t0 + 1.2, t0 + 1.5))
        elif t < t0 + 2.3:
            q = h1 + (off.lerp(deep, seg(t, t0 + 1.5, t0 + 1.95)) if t < t0 + 1.95 else deep.lerp(off, seg(t, t0 + 1.95, t0 + 2.3)))
        else:
            q = lerp(h1 + off, far, seg(t, t0 + 2.3, t0 + 2.7))
        show(S["drill"], True)
        S["drill"].matrix_world = Matrix.Translation(Vector(q))
        S["bit"].rotation_euler = (0, t * 55.0 if (t0 + 0.35 < t < t0 + 1.15 or t0 + 1.45 < t < t0 + 2.25) else 0.0, 0)
    lv = level_at(S, t, sx)
    sp = ratchet_at(S, t, sx)
    if sp is not None:
        show(S["ratchet"], True)
        S["ratchet"].matrix_world = sp
    return lv


def holes_marks(S, t, hero):
    for side, j, hole, dust in S["holes"]:
        t0 = st.DRILL[side] + (0.65, 1.75)[j]
        on = (not hero) and t >= t0
        show(hole, on); show(dust, on)
    for side, j, mk in S["marks"]:
        t0 = st.MARK[side] + (0.45, 1.0)[j]
        for ob in mk:
            show(ob, (not hero) and t0 <= t < st.DRILL[side] + (0.65, 1.75)[j])


def pose(S, t, scene, shot=None):
    shot = shot or shot_at(t)
    intro, hero = shot == "intro", shot == "finale"
    scene.world = S["worlds"]["intro" if intro else "shaft"]
    for ob in S["room"]:
        show(ob, not intro)
    sides = S["sides"]
    for (side, lv), h in sides.items():
        if lv == 0 and not intro:
            st.side_at(h, t, hero)
        else:
            on = hero or (intro and side == "sx" and lv == 0)
            show(h["rig"], on)
            if on:
                h["rig"].matrix_basis = Matrix.Translation(h["home"])
                st.side_at(h, t, True)
    bpy.context.view_layer.update()
    wires(S, t, hero or intro)
    holes_marks(S, t, hero or intro)
    sx, dx = sides[("sx", 0)], sides[("dx", 0)]
    lv = None if (intro or hero) else tools(S, t, sx)
    if intro or hero:
        for k in ("drill", "marker", "ratchet", "level"):
            show(S[k], False)
    cam = S["cam"]
    eye, target, lens = SHOTS[shot]
    fp, fstop = FOCUS[shot]
    if hero:
        a, b, e1, g1, l1, f1, s1 = PULL
        k = seg(t, a, b)
        eye, target, lens, fp, fstop = lerp(eye, e1, k), lerp(target, g1, k), lens + (l1 - lens) * k, lerp(fp, f1, k), fstop + (s1 - fstop) * k
    look_at(cam, eye, target)
    cam.data.lens = lens
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (Vector(fp) - Vector(eye)).length
    cam.data.dof.aperture_fstop = fstop
    cam.data.dof.aperture_blades = 7
    bpy.context.view_layer.update()
    return {k: screen(scene, cam, v) for k, v in points(S, sx, dx, lv).items()}


def points(S, sx, dx, lv):
    pts = {}
    for side, h in (("sx", sx), ("dx", dx)):
        s = SIGN[side]
        R = h["rig"].matrix_world
        pv = S["wires"][side][0]
        pts[f"wire_{side}"] = Vector((pv.location.x, pv.location.y, -0.12))
        pts[f"SU_{side}"] = R @ Vector((s * 0.06, -0.006, 0.032))
        rail = h["rail"].matrix_world
        pts[f"rail_{side}"] = rail @ Vector((s * 0.03, -0.0025, (380.0 - RAIL_Y0) * MM / RAIL_STRETCH))
        pts[f"tip_{side}"] = rail @ Vector((s * 0.05, 0.0, (100.0 - RAIL_Y0) * MM / RAIL_STRETCH))
    h0 = sx["anchors"][0]
    pts["mark_sx"] = h0["wall"]
    pts["hole_sx"] = h0["wall"]
    pts["anchor_sx"] = h0["grp"].matrix_world @ Vector((0, -0.0112, 0))
    pts["SG_sx"] = sx["SG"].matrix_world @ Vector((0.0, -0.03, 0.02))
    b = sx["bolts"][0]
    for k in ("bigtop", "bigbot", "grower", "nut"):
        pts[f"{k}_sx"] = b[k].matrix_world @ Vector((0.0, -0.012, 0.001))
    pts["clip_sx"] = sx["clips"][0]["ob"].matrix_world @ Vector((0, 0, 0.012))
    c = sx["cstack"][0]
    pts["cwasher_sx"] = c["washer"].matrix_world @ Vector((0, -0.008, 0.001))
    pts["cgrower_sx"] = c["grower"].matrix_world @ Vector((0, -0.007, 0.001))
    pts["cnut_sx"] = c["nut"].matrix_world @ Vector((0, -0.006, 0.004))
    pts["slide_sx"] = sx["SG"].matrix_world @ Vector((0.0, -0.04, 0.0))
    pts["wtip_sx"] = Vector((S["wires"]["sx"][0].location.x, pts["tip_sx"].y, pts["tip_sx"].z))
    if lv is not None:
        pts["level"] = lv
    return pts
