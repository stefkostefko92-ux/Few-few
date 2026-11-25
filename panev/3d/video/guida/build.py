"""Builds the counterweight-guide scene: the concrete wall of the shaft, two plumb lines, and on three levels the SU 220 160
+ SG 80 150 brackets with their T rails from the site's 3-D engine (guida/export_mesh.mjs): SX on the left, DX on the
right, the rail heads 600 mm apart and facing each other, the SG pushed 25 mm further out than mid-travel, each plumb
line 5 mm in front of its rail's head (owner, 25.11.2026). The film mounts level 0; the others are on the wall too.
Hardware per the owner: two M10 wedge anchors per SU, M10 x 30 bolts above and below the SG, the forged N1 clips; a
large washer on every one, a grower under every nut of the SG and of the clips. Returns handles for pose.py."""
import math
import os
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise as mnoise
from lib import MM, Y_UP, link, mesh_from, empty, box, cylinder
from materials import make_materials
from stage import load_meshes, object_from, studio
from props import build_drill, build_marker, build_level
from ratchet import build_ratchet
from hands import mirrored
from parts import film_materials, big_washer, grower, n1_clip, place, plumb, BIG, WASHER_H, GROWER

HERE = os.path.dirname(os.path.abspath(__file__)).replace("\\", "/")
GAP = 0.600               # m between the rail heads (owner)
WIRE = 0.005              # m from the front of the rail's head to its plumb line, in front of it (owner)
LINE_R = 0.00075          # m: the plumb line's radius
SG_PUSH = 0.025           # m: the SG (and its rail) further out along the arm than mid-travel (owner: 2–3 cm)
BOLT_AT = (35.0, 55.0)    # mm along the SG from its wall end: the stations that stand in the arm's outer slot, pushed
TIP = 270.0               # mm: three.js x of the SX rail head (SG flange face 220 + T50 rail 50)
SIDE_X = {"sx": -(GAP / 2 + TIP * MM), "dx": GAP / 2 + TIP * MM}
SIGN = {"sx": 1.0, "dx": -1.0}  # the DX meshes are mirrored about their x = 0
LEVELS = (0.0, 1.5, -1.5)       # Blender z of each bracket level; the film mounts 0
ANCHOR_X = (47.0, 144.0)        # mm along the SU flange: the middle of its two slots, 32.5 up
SLIDE0 = Vector((-0.002, 0.008, 0.0))  # m: the SG before it is set to the line, 2 mm aside and 8 mm nearer the wall (SX)
RAIL_Y0 = -2300.0               # mm: the rail's foot under its level
RAIL_STRETCH = 1.4              # the 5 m rail drawn 7 m long: its top stays out of the upward shots
R3 = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64)  # three.js direction -> Blender
GUIDE_LIGHTS = (("key", (-1.15, -1.7, 1.25), (-0.3, 0, 0.0), 0.45, 0.3, 55.0, (1.0, 0.96, 0.9)),
                ("fill", (1.5, -1.5, 0.35), (0.2, 0, 0.0), 1.0, 1.4, 0.55, (0.88, 0.93, 1.0)),
                ("top", (0.0, -0.7, 2.6), (0.0, 0, 0.0), 1.8, 1.2, 0.5, (1, 1, 1)))


def bl(v_mm):
    return Vector(Y_UP @ np.asarray(v_mm, np.float64))


def bdir(v):
    return Vector(R3 @ np.asarray(v, np.float64)).normalized()


def part(name, rec, M, origin_mm, parent, at_mm):
    """A mesh with its origin at origin_mm (three.js mm), located at at_mm in its parent (same units)."""
    ob = object_from(name, rec, M, origin_mm, parent)
    ob.location = bl(at_mm)
    return ob


def bolt_stack(tag, sg, spare, M, nut_mm, axis, sgref):
    """An SG bolt: large washer + M10 x 30 bolt above the SG, large washer + grower + nut under the SU plate."""
    down = bdir(axis)
    base = bl(np.asarray(nut_mm) - np.asarray(axis) * WASHER_H - sgref)  # the SU plate's underside
    top = base - down * (9.0 * MM)                                       # the SG plate's top
    big = BIG[2] * MM
    h = {"down": down, "base": base, "top": top}
    h["bigtop"] = big_washer(f"bigtop-{tag}", M, sg)
    h["bolt"] = object_from(f"bolt-{tag}", spare["bolt30"], M, (0, 0, 0), sg)
    h["bigbot"] = big_washer(f"bigbot-{tag}", M, sg)
    h["grower"] = grower(f"grower-{tag}", M, sg)
    h["nut"] = object_from(f"nut-{tag}", spare["nut"], M, (0, 0, 0), sg)
    h["home"] = {"bigtop": (top, -down), "bolt": (top - down * (big - 0.030), -down), "bigbot": (base, down),
                 "grower": (base + down * big, down), "nut": (base + down * (big + GROWER[2] * MM), down)}
    for k, (at, ax) in h["home"].items():
        place(h[k], at, ax)
    return h


def clip_stack(tag, sg, spare, M, nut_mm, axis, sgref):
    """Behind an N1 clip's flange slot: large washer + grower + the clip's black nut on its shank."""
    ax = bdir(axis)
    base = bl(np.asarray(nut_mm) - np.asarray(axis) * WASHER_H - sgref)  # the SG flange's back face
    h = {"down": ax, "base": base}
    h["washer"] = big_washer(f"cwasher-{tag}", M, sg)
    h["grower"] = grower(f"cgrower-{tag}", M, sg)
    h["nut"] = object_from(f"cnut-{tag}", spare["nut"], M, (0, 0, 0), sg)
    h["nut"].data.materials[0] = M["oiled"]
    h["home"] = {"washer": (base, ax), "grower": (base + ax * BIG[2] * MM, ax),
                 "nut": (base + ax * (BIG[2] + GROWER[2]) * MM, ax)}
    for k, (at, a) in h["home"].items():
        place(h[k], at, a)
    return h


def build_side(side, lv, z, M, recs, meta, spare):
    s = SIGN[side]
    rig = empty(f"rig-{side}{lv}", None, (SIDE_X[side], 0, z))
    h = {"rig": rig, "side": side, "home": rig.location.copy()}
    h["SU"] = part(f"SU-{side}{lv}", recs[f"SU-{side}"], M, (0, 0, 0), rig, (0, 0, 0))
    sgrec = recs[f"SG-{side}"]
    sgref = (sgrec["p"].min(0) + sgrec["p"].max(0)) / 2
    h["sg"] = sg = empty(f"sg-{side}{lv}", rig, tuple(bl(sgref) + Vector((0, -SG_PUSH, 0))))
    h["sg_home"] = sg.location.copy()
    h["SG"] = part(f"SG-{side}{lv}", sgrec, M, sgref, sg, (0, 0, 0))
    if lv == 0:  # one rail per side, through every level: it rides on the mounted level's SG
        rail = spare["rail"] if side == "sx" else mirrored(spare["rail"], 0.0)
        h["rail"] = part(f"rail-{side}", rail, M, (0, 0, 0), sg, np.array([s * meta["flangeX"], RAIL_Y0, meta["reach"]]) - sgref)
        h["rail"].scale.z = RAIL_STRETCH
        h["rail_home"] = h["rail"].location.copy()
    fr = next(f for f in meta["frames"] if f["hand"] == side)
    h["clips"] = []
    for i, c in enumerate(fr["clips"]):
        ob = n1_clip(f"clip-{side}{lv}-{i}", M, spare, sg)
        cy, cz = bdir(c["y"]), bdir(c["z"])
        ob.matrix_basis = Matrix.Translation(bl(np.asarray(c["p"]) - sgref)) @ Matrix((cy.cross(cz), cy, cz)).transposed().to_4x4()
        h["clips"].append({"ob": ob, "home": ob.location.copy(), "out": cz})
    h["bolts"], h["cstack"] = [], []
    sg0 = sgrec["p"][:, 2].min()  # the SG's wall end (three.js z)
    verticals = [n for n in fr["bolts"] if abs(n["y"][1]) > 0.9]
    for i, (n, at) in enumerate(zip(verticals, BOLT_AT)):
        h["bolts"].append(bolt_stack(f"{side}{lv}-{i}", sg, spare, M, [n["p"][0], n["p"][1], sg0 + at], n["y"], sgref))
    for i, n in enumerate(n for n in fr["bolts"] if abs(n["y"][1]) <= 0.9):
        h["cstack"].append(clip_stack(f"{side}{lv}-{i}", sg, spare, M, n["p"], n["y"], sgref))
    h["anchors"] = []
    for j, ax in enumerate(ANCHOR_X):
        grp = empty(f"anchor-{side}{lv}{j}", rig, tuple(bl((s * ax, 32.5, 0.0))))
        rot = Matrix.Rotation(math.radians(90), 4, "X")  # the stud's +Z -> out of the wall (-Y)
        parts = []
        for kind, off in (("stud", -75.0), ("washer", 5.0), ("nut", 5.0 + BIG[2])):
            ob = (big_washer(f"anchor-washer-{side}{lv}{j}", M, grp) if kind == "washer"
                  else object_from(f"anchor-{kind}-{side}{lv}{j}", spare[kind], M, (0, 0, 0), grp))
            ob.matrix_parent_inverse = Matrix.Identity(4)
            ob.matrix_basis = Matrix.Translation((0, -off * MM, 0)) @ rot
            parts.append((kind, ob, ob.matrix_basis.copy()))
        h["anchors"].append({"grp": grp, "parts": parts, "home": grp.location.copy(),
                             "wall": Vector((SIDE_X[side] + s * ax * MM, 0, z + 32.5 * MM))})
    return h


def build_wall(M, windows):
    """The shaft wall's face (plane y = 0, wall at +y), a few mm of relief; flat and a hair recessed behind each SU."""
    x0, x1, z0, z1, step = -1.3, 1.3, -2.6, 4.6, 0.008
    xs, zs = np.arange(x0, x1 + 1e-9, step), np.arange(z0, z1 + 1e-9, step)
    X, Z = np.meshgrid(xs, zs)
    d = np.zeros_like(X)
    for i in range(len(zs)):
        for j in range(len(xs)):
            d[i, j] = 0.004 * mnoise.fractal(Vector((X[i, j] * 2.6, Z[i, j] * 2.6, 3.0)), 0.6, 2.2, 5) \
                + 0.001 * mnoise.noise(Vector((X[i, j] * 16, Z[i, j] * 16, 9.0)))
    ramp = lambda a, b, v: np.clip((v - a) / (b - a), 0, 1)
    for (a, b, c, e) in windows:
        w = ramp(a - 0.03, a, X) * (1 - ramp(b, b + 0.03, X)) * ramp(c - 0.03, c, Z) * (1 - ramp(e, e + 0.03, Z))
        w = w * w * (3 - 2 * w)
        d = d * (1 - w) + 0.0006 * w
    P = np.stack([X, d, Z], -1).reshape(-1, 3)
    nx, nz = len(xs), len(zs)
    a = (np.arange(nz - 1)[:, None] * nx + np.arange(nx - 1)[None, :]).ravel()
    faces = np.stack([a, a + 1, a + nx + 1, a, a + nx + 1, a + nx], -1).ravel()
    face = link(bpy.data.objects.new("wall", mesh_from("wall", P, faces, None, [M["concrete"]], smooth=True)))
    top = 9.0  # the shaft goes on up, closed by its top slab: nothing of the outside shows
    box("wall-upper", (x1 - x0, 0.2, top - z1), M["concrete_box"], (0, 0.1 + 0.004, (z1 + top) / 2))
    for name, xc in (("side-left", x0 - 0.1), ("side-right", x1 + 0.1)):
        box(name, (0.2, 1.9, top - z0), M["side"], (xc, -0.95, (z0 + top) / 2))
    box("pit", (x1 - x0 + 0.4, 1.9, 0.2), M["screed"], (0, -0.95, z0 - 0.1))
    box("slab", (x1 - x0 + 0.4, 1.9, 0.2), M["concrete_box"], (0, -0.95, top + 0.1))
    return face


def build(scene):
    M = film_materials(make_materials())
    meta, raw = load_meshes(f"{HERE}/mesh/guida")
    recs = {r["tag"]: r for r in raw if r["tag"] != "spare"}
    spare = {r["kind"]: r for r in raw if r["tag"] == "spare"}
    sides = {(side, lv): build_side(side, lv, z, M, recs, meta, spare) for lv, z in enumerate(LEVELS) for side in ("sx", "dx")}
    windows = []
    for (side, lv), h in sides.items():
        xa, xb = sorted((SIDE_X[side], SIDE_X[side] + SIGN[side] * 0.22))
        windows.append((xa, xb, LEVELS[lv], LEVELS[lv] + 0.065))
    face = build_wall(M, windows)
    holes, marks = [], []
    for side in ("sx", "dx"):
        for j, an in enumerate(sides[(side, 0)]["anchors"]):
            p = an["wall"]
            holes.append((side, j, cylinder(f"hole-{side}{j}", 0.0052, 0.0008, M["hole"], loc=(p.x, -0.0002, p.z), axis="Y", segs=32),
                          cylinder(f"dust-{side}{j}", 0.0115, 0.0005, M["dust"], loc=(p.x, 0.0001, p.z), axis="Y", segs=24)))
            marks.append((side, j, [box(f"mark-{side}{j}{q}", (0.014 if q == 0 else 0.0011, 0.0004, 0.0011 if q == 0 else 0.014),
                                        M["mark"], (p.x, -0.0002, p.z), 0) for q in range(2)]))
    wires = {}
    for side in ("sx", "dx"):
        front = meta["reach"] * MM + SG_PUSH + 0.0025  # the head's front face, from the wall
        wires[side] = plumb(f"wire-{side}", M, (-SIGN[side] * GAP / 2, -(front + WIRE + LINE_R), 4.4))
    drill, bit = build_drill(M)
    level, bub1, bub2 = build_level(M)
    worlds, lights = studio(scene, GUIDE_LIGHTS)
    cam = link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")))
    cam.data.sensor_width = 36.0
    cam.data.clip_start, cam.data.clip_end = 0.01, 40
    scene.camera = cam
    return {"M": M, "meta": meta, "sides": sides, "face": face, "holes": holes, "marks": marks, "wires": wires,
            "drill": drill, "bit": bit, "marker": build_marker(M), "ratchet": build_ratchet(M), "level": level,
            "bub1": bub1, "bub2": bub2, "worlds": worlds, "lights": lights, "cam": cam,
            "room": [face] + [bpy.data.objects[n] for n in ("wall-upper", "side-left", "side-right", "pit", "slab")]}
