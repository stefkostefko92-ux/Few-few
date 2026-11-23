"""The mounting video, as Panev installs it (owner, 23.11.2026), as a function of time: pose(S, t, scene, shot)
places every object for second t and returns the screen points the overlay needs (1920x1080 design space).
1 A+B assembled · 2 two technicians hold the brackets · 3 measure from the car sill · 4 mark, drill, anchors, each B
plumb · 5 tighten the anchors · 6 sill on · 7 sill bolts snug · 8 sill level · 9 A level, tighten all · 10 third
bracket in the middle."""
import math
import bpy
from mathutils import Matrix, Vector
from lib import MM, seg, lerp, look_at
from build import LEAN, PAIR_X, ANCHORS, FACE_X
from props import SILL_H, SILL_D
from motion import basis, show, bump, rig_pose, plumb_tilt, screen, hw_local, hardware
from timeline import TIMELINE

DEG = math.radians
SHOTS = {  # eye, target, lens; the film cuts (short dissolve) between them
    "intro": ((0.5, -0.96, 0.06), (-0.12, -0.07, -0.175), 50),
    "asm": ((0.46, -1.12, 0.02), (-0.04, -0.3, -0.17), 38),
    "pos": ((0.31, -1.42, 0.08), (0.31, -0.12, -0.2), 34),
    "top3": ((1.24, -0.42, 0.2), (0.56, -0.2, -0.04), 34),
    "drill": ((-0.5, -0.62, -0.08), (-0.1, -0.06, -0.25), 34),
    "work2": ((0.31, -1.3, -0.04), (0.31, -0.05, -0.2), 36),
    "front": ((0.22, -0.8, -0.06), (-0.06, -0.02, -0.205), 44),
    "wide6": ((0.98, -1.32, 0.22), (0.3, -0.08, -0.12), 36),
    "under": ((0.28, -0.56, -0.22), (0.0, -0.12, -0.06), 46),
    "wide8": ((0.31, -1.25, 0.3), (0.31, -0.1, -0.06), 36),
    "side": ((1.18, -0.52, 0.05), (0.6, -0.1, -0.1), 44),
    "wide10": ((0.75, -1.28, 0.05), (0.31, -0.08, -0.15), 36),
    "hero": ((-0.44, -1.08, 0.1), (0.3, -0.07, -0.14), 36),
}
FOCUS = {
    "intro": ((-0.03, -0.03, -0.2), 8.0), "asm": ((-0.03, -0.3, -0.19), 4.5), "pos": ((0.31, -0.06, -0.2), 5.6),
    "top3": ((0.74, -0.2, -0.01), 4.5), "drill": ((-0.03, -0.005, -0.215), 2.8), "work2": ((0.31, -0.02, -0.2), 5.6),
    "front": ((-0.03, -0.01, -0.2), 4.5), "wide6": ((0.3, -0.1, -0.05), 6.3), "under": ((0.0, -0.12, -0.04), 4.5),
    "wide8": ((0.31, -0.12, 0.0), 6.3), "side": ((0.62, -0.1, -0.06), 4.5), "wide10": ((0.31, -0.08, -0.1), 6.3),
    "hero": ((0.3, -0.08, -0.05), 6.3),
}
SILL_BACK = 80.0  # mm from the wall to the sill's back edge: the car-sill measure sets it
GAP = 0.03        # car sill to landing sill: 30 mm, inside the 25–32 mm the overlay shows


def shot_at(t):
    for name, a, b in TIMELINE:
        if a <= t < b:
            return name
    return TIMELINE[-1][0]


def pose(S, t, scene, shot=None):
    wall, pairs, cam = S["wall"], S["pairs"], S["cam"]
    shot = shot or shot_at(t)
    intro = shot == "intro"
    scene.world = S["worlds"]["intro" if intro else "shaft"]
    wall.rotation_euler = (0 if intro else LEAN, 0, 0)
    for ob in (S["face"], S["floor"], S["body"], *S["sides"]):
        show(ob, not intro)
    for ob in ("drill", "marker", "spanner", "level", "sill", "ghost_sill", "car_sill"):
        show(S[ob], False)
    W = wall.matrix_world

    # --- the bracket pairs ---------------------------------------------------------------------
    a_angle = -LEAN * seg(t, 76.0, 79.0)  # step 9: both A set level together
    for k, p in enumerate(pairs):
        rig = p["rig"]
        m = Matrix.Translation((PAIR_X[k], 0, 0)) if intro else rig_pose(k, t)
        on = m is not None and (not intro or k == 0)
        show(rig, on)
        if not on:
            continue
        tilt = plumb_tilt(k, t)
        piv = Vector((FACE_X * MM, 0, ANCHORS[0] * MM))
        rig.matrix_basis = m @ Matrix.Translation(piv) @ Matrix.Rotation(tilt, 4, "Y") @ Matrix.Translation(-piv)
        p["pivot"].rotation_euler = (0.0 if intro or (k == 0 and t < 13.0) else (-LEAN if k == 2 else a_angle), 0, 0)
        # step 1: A joins B, then the joint and lock bolts (loose)
        if k == 0 and 4.0 <= t < 13.0 and not intro:
            kk = seg(t, 4.8, 6.6)
            p["A"].location = Vector((0, -0.18 * (1 - kk), 0.12 * (1 - kk)))
            show(p["A"], t >= 4.8)
            hardware(p, "joint", t, 6.8, 7.8)
            hardware(p, "lock", t, 8.4, 9.4)
        else:
            p["A"].location = Vector()
            hardware(p, "joint", 99, 0, 1)
            hardware(p, "lock", 99, 0, 1)
        # anchors through B's slots
        for j, an in enumerate(p["anchors"]):
            t0 = (38.4 + 0.4 * j + 0.8 * k) if k < 2 else 87.2 + 0.4 * j
            vis = (not intro) and t >= t0
            show(an["grp"], vis)
            an["grp"].location = an["home"] + Vector((0, -0.11 * (1 - seg(t, t0, t0 + 1.0)), 0))
            spin = 0.0
            if k == 0:
                spin = DEG(120) * seg(t, *((48.9, 50.1) if j == 0 else (50.5, 51.7)))
            elif k == 2 and j == 0:
                spin = DEG(120) * seg(t, 89.2, 90.4)
            for kind, ob, base in an["parts"]:
                if kind == "nut":
                    ob.matrix_basis = Matrix.Translation(base.translation) @ Matrix.Rotation(spin, 4, "Y") @ base.to_3x3().to_4x4()
        # sill bolts from below through A's slot (18)
        tb = 61.4 if k < 2 else 90.8
        for ob, at in p["sillbolts"]:
            show(ob, (not intro) and t >= tb)
            ob.matrix_basis = Matrix.Translation(at + Vector((0, 0, -0.03 * (1 - seg(t, tb, tb + 1.4))))) @ Matrix.Rotation(math.pi, 4, "X")
    bpy.context.view_layer.update()

    # --- holes and marks --------------------------------------------------------------------------
    hole_t = {(0, 0): 33.9, (0, 1): 35.5, (1, 0): 36.5, (1, 1): 36.5}
    mark_t = {(0, 0): 30.9, (0, 1): 31.6, (1, 0): 32.0, (1, 1): 32.0}
    for k, j, hole, dust in S["holes"]:
        on = (not intro) and k < 2 and t >= hole_t[(k, j)]
        show(hole, on); show(dust, on)
    for k, j, mk in S["marks"]:
        for mm in mk:
            show(mm, (not intro) and k < 2 and mark_t[(k, j)] <= t < hole_t[(k, j)])

    face_pt = lambda j, k=0: Vector((PAIR_X[k] + FACE_X * MM, 0, ANCHORS[j] * MM))
    p0, p1, p2 = pairs
    pw = W @ (Vector((PAIR_X[0], 0, 0)) + p0["pivot"].location)  # pivot of pair 0 at home (world)
    sill_local = Matrix.Translation((-0.12, -(SILL_BACK - 23.5) * MM, 0.031))
    sill_level = Matrix.Translation(pw) @ sill_local

    # --- tools -----------------------------------------------------------------------------------------
    if 30.4 <= t < 32.0:  # marker through the slots of the left B
        show(S["marker"], True)
        a = face_pt(0) + Vector((0, -0.12, 0.05)); b0 = face_pt(0); b1 = face_pt(1)
        if t < 30.8:
            q = lerp(a, b0 + Vector((0, -0.01, 0)), seg(t, 30.4, 30.8))
        elif t < 31.1:
            q = lerp(b0 + Vector((0, -0.01, 0)), b0, bump(t, 30.8, 31.1))
        elif t < 31.4:
            q = lerp(b0 + Vector((0, -0.012, 0)), b1 + Vector((0, -0.01, 0)), seg(t, 31.1, 31.4))
        elif t < 31.7:
            q = lerp(b1 + Vector((0, -0.01, 0)), b1, bump(t, 31.4, 31.7))
        else:
            q = lerp(b1 + Vector((0, -0.01, 0)), a, seg(t, 31.7, 32.0))
        S["marker"].matrix_world = W @ Matrix.Translation(Vector(q) + Vector((0, -0.0006, 0))) @ Matrix.Rotation(DEG(-18), 4, "X") @ Matrix.Rotation(DEG(12), 4, "Z")
    if 32.8 <= t < 36.6:  # drill, the two holes of the left bracket
        show(S["drill"], True)
        off, deep = Vector((0, -0.06, 0)), Vector((0, 0.045, 0))
        far = face_pt(0) + Vector((0.1, -0.45, 0.12))
        h0, h1 = face_pt(0), face_pt(1)
        if t < 33.4:
            q = lerp(far, h0 + off, seg(t, 32.8, 33.4))
        elif t < 34.6:
            q = h0 + off.lerp(deep, seg(t, 33.4, 34.2)) if t < 34.2 else h0 + deep.lerp(off, seg(t, 34.2, 34.6))
        elif t < 35.0:
            q = lerp(h0 + off, h1 + off, seg(t, 34.6, 35.0))
        elif t < 36.2:
            q = h1 + off.lerp(deep, seg(t, 35.0, 35.8)) if t < 35.8 else h1 + deep.lerp(off, seg(t, 35.8, 36.2))
        else:
            q = lerp(h1 + off, far, seg(t, 36.2, 36.6))
        S["drill"].matrix_world = W @ Matrix.Translation(Vector(q))
        S["bit"].rotation_euler = (0, t * 55.0 if (33.3 < t < 34.4 or 34.9 < t < 36.0) else 0.0, 0)
    for k, (a, b) in ((0, (40.8, 43.0)), (1, (43.0, 46.2))):  # level beside each B (plumb in the wall plane)
        if a <= t < b:
            show(S["level"], True)
            edge = Vector((PAIR_X[k] - 0.0605, -0.0125, 0.165))
            kin = seg(t, a, a + 0.6) - seg(t, b - 0.6, b)
            S["level"].matrix_world = W @ Matrix.Translation(edge + Vector((-0.05, -0.2, 0.0)) * (1 - kin)) @ basis((-1, 0, 0), (0, 0, 1))
            S["bub2"].location.z = 0.026 + max(-0.009, min(0.009, -plumb_tilt(k, t) / DEG(1) * 0.012))
            S["bub1"].location.x = 0.012
    # the sill: down onto the A plates, then it follows pair 0's A (both A turn together)
    if t >= 55.6 and not intro:
        show(S["sill"], True)
        drop = Vector((0, 0, 0.25 * (1 - seg(t, 55.6, 58.2))))
        roll = DEG(0.25) * (1 - seg(t, 69.0, 71.0)) if t < 71.0 else 0.0
        S["sill"].matrix_world = Matrix.Translation(drop) @ p0["pivot"].matrix_world @ sill_local @ Matrix.Translation((0.43, 0, 0)) @ Matrix.Rotation(roll, 4, "Y") @ Matrix.Translation((-0.43, 0, 0))
    bpy.context.view_layer.update()
    sill_m = S["sill"].matrix_world
    if 67.6 <= t < 72.6:  # level along the sill
        show(S["level"], True)
        kin = seg(t, 67.6, 68.4) - seg(t, 72.0, 72.6)
        R = sill_m.to_3x3().to_4x4() @ basis((0, 0, 1), (1, 0, 0))
        top = sill_m @ Vector((0.43, -SILL_D * 0.62, SILL_H))
        S["level"].matrix_world = Matrix.Translation(top + Vector((0, 0, 0.16 * (1 - kin)))) @ R
        lx = R.to_3x3() @ Vector((1, 0, 0))
        S["bub1"].location.x = max(-0.016, min(0.016, math.asin(max(-1, min(1, lx.z))) / DEG(1) * 0.0032 + 0.0))
        S["bub2"].location.z = 0.026
    if 74.6 <= t < 82.6:  # level across the sill at the right bracket (front to back)
        show(S["level"], True)
        kin = seg(t, 74.6, 75.4) - seg(t, 82.0, 82.6)
        R = sill_m.to_3x3().to_4x4() @ basis((0, 0, 1), (0, 1, 0))
        top = sill_m @ Vector((0.74, -SILL_D * 0.5, SILL_H))
        S["level"].matrix_world = Matrix.Translation(top + Vector((0, 0, 0.16 * (1 - kin)))) @ R
        lx = R.to_3x3() @ Vector((1, 0, 0))
        S["bub1"].location.x = max(-0.016, min(0.016, math.asin(max(-1, min(1, lx.z))) / DEG(1) * 0.0032))
        S["bub2"].location.z = 0.026
    # spanner
    sp = None
    if 48.5 <= t < 52.3:  # step 5: the left bracket's anchor nuts
        j = 0 if t < 50.3 else 1
        nut = face_pt(j) + Vector((0, -0.0112, 0))
        rot = DEG(120) * seg(t, *((48.9, 50.1) if j == 0 else (50.5, 51.7)))
        k_in = seg(t, 48.5, 48.9) if j == 0 else 1.0
        k_out = seg(t, 51.7, 52.3)
        if 50.1 <= t < 50.5:
            k_in = 1 - bump(t, 50.1, 50.5)
        sp = W @ Matrix.Translation(nut + Vector((0, -0.12, 0)) * (1 - k_in + k_out)) @ Matrix.Rotation(rot, 4, "Y") @ basis((0, -1, 0), (-0.95, 0, -0.3))
    elif 88.8 <= t < 91.0:  # step 10: the middle bracket's anchor nut
        nut = face_pt(0, 2) + Vector((0, -0.0112, 0))
        rot = DEG(120) * seg(t, 89.2, 90.4)
        k = seg(t, 88.8, 89.2) - seg(t, 90.4, 91.0)
        sp = W @ Matrix.Translation(nut + Vector((0, -0.12, 0)) * (1 - k)) @ Matrix.Rotation(rot, 4, "Y") @ basis((0, -1, 0), (-0.95, 0, -0.3))
    elif 63.0 <= t < 65.6:  # step 7: snug a sill bolt from below
        pv = p0["pivot"].matrix_world
        up = (pv.to_3x3() @ Vector((0, 0, 1))).normalized()
        head = pv @ Vector((-0.025, -(115.0 - 23.5) * MM, 0.0235))
        rot = DEG(45) * seg(t, 63.6, 64.8)
        k = seg(t, 63.0, 63.4) - seg(t, 65.0, 65.6)
        sp = Matrix.Translation(head - up * 0.1 * (1 - k)) @ Matrix.Rotation(rot, 4, up) @ basis(-up, (-1, 0, 0))
    elif 79.4 <= t < 81.8:  # step 9: the right bracket's lock bolt
        pv = p1["pivot"].matrix_world
        head = pv @ (Vector((0.0103, 0, 0)) + hw_local(p1, "lock", "bolt"))
        ax = (pv.to_3x3() @ Vector((1, 0, 0))).normalized()
        rot = DEG(150) * seg(t, 79.8, 81.2)
        k = seg(t, 79.4, 79.8) - seg(t, 81.2, 81.8)
        sp = Matrix.Translation(head + ax * 0.09 * (1 - k)) @ Matrix.Rotation(rot, 4, ax) @ basis(ax, (0, -0.45, -0.89))
        for kind, ob, base in p1["hw"]["lock"]:
            if kind == "bolt":
                ob.rotation_euler = (rot, 0, 0)
    if sp is not None:
        show(S["spanner"], True)
        S["spanner"].matrix_world = sp
    # step 3: where the landing sill goes, and the car sill
    if shot == "top3" and 21.6 <= t < 30.2:
        show(S["car_sill"], True)
        S["car_sill"].matrix_world = Matrix.Translation((PAIR_X[2] - 0.45, pw.y - (SILL_BACK - 23.5) * MM - SILL_D - GAP, -SILL_H))
        if t >= 22.6:
            show(S["ghost_sill"], True)
            S["ghost_sill"].matrix_world = sill_level
    bpy.context.view_layer.update()

    # --- camera ------------------------------------------------------------------------------------------
    eye, target, lens = SHOTS[shot]
    look_at(cam, eye, target)
    cam.data.lens = lens
    fp, fstop = FOCUS[shot]
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (Vector(fp) - Vector(eye)).length
    cam.data.dof.aperture_fstop = fstop
    cam.data.dof.aperture_blades = 7
    bpy.context.view_layer.update()

    # --- screen points (overlay) -----------------------------------------------------------------------
    pts = {}
    for k, p in enumerate(pairs):
        for name, e in p["pts"].items():
            pts[f"{name}_{k}"] = e.matrix_world.translation.copy()
        pv = p["pivot"].matrix_world
        pts[f"A_{k}"] = pv @ Vector((0.006, -0.11, 0.027))
        pts[f"B_{k}"] = p["rig"].matrix_world @ Vector((-0.03, -0.005, 0.12))
        pts[f"18u_{k}"] = pv @ Vector((-0.025, -(135.0 - 23.5) * MM, 0.026))
    for j in range(2):
        pts[f"M{j}"] = W @ face_pt(j)
    front_y = pw.y - (SILL_BACK - 23.5) * MM - SILL_D
    pts["dim_a"] = Vector((0.74, front_y, 0.003))
    pts["dim_b"] = Vector((0.74, front_y - GAP, 0.003))
    pts["cab"] = Vector((0.66, front_y - GAP - SILL_D * 0.5, -0.004))
    pts["piano"] = Vector((0.6, front_y + SILL_D * 0.5, 0.004))
    pts["S"] = sill_m @ Vector((0.6, -SILL_D, SILL_H * 0.4))
    pts["level"] = S["level"].matrix_world @ Vector((0, -0.013, 0.05))
    return {k: screen(scene, cam, v) for k, v in pts.items()}
