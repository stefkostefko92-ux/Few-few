"""Builds the mounting-video scene: the out-of-plumb concrete wall under the landing, three bracket pairs
(A 45 175 2 + B 45 320) from the site's 3-D engine, M10 wedge anchors in 10 mm holes, the tools (hammer drill,
marker, ratchet, spirit level, angle grinder), the landing-door sill and, behind the middle bracket, a rebar in the
concrete. Owner, 24.11.2026: on the left A SX + B SX, on the right A DX + B DX; the middle one starts DX, its drill
hits the rebar and its B DX is swapped for a B SX on the other face of A DX's web (they are interchangeable), which
moves the fixing holes 65 mm aside. SX parts are the DX meshes mirrored (the bolts are not: their threads stay
right-handed, and the joint stack keeps its place). Returns handles for pose.py."""
import math
import os
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise as mnoise
from lib import MM, Y_UP, link, mesh_from, empty, box, cylinder
from materials import make_materials
from grinder import build_grinder
from ratchet import build_ratchet
from cut import build_cut
from props import SILL_H, build_drill, build_marker, build_level, build_sill
from rebar import build_rebar
from stage import load_meshes, object_from, centre_of, studio
from hands import HAND, FACE_X, WEB, face_x, mx, mirrored

HERE = os.path.dirname(os.path.abspath(__file__)).replace("\\", "/")
LEAN = math.radians(5.0)      # the wall is out of plumb: its top leans 5° into the shaft
PAIR_X = (0.0, 0.62, 0.31)    # left, right and (step 10) the middle bracket
ANCHORS = (225.0, 52.0)       # anchor heights on B (mm): middle of the closed slot, the open slot


# ---------- the bracket pair ----------
def build_pair(k, wall, M, meta, recs, x):
    rig = empty(f"pair{k}", wall, (x, 0, 0))
    pivot_mm = np.asarray(meta["pivot"])
    h = {"rig": rig, "hw": {}, "hand": HAND[k]}
    rb, ra = (next(r for r in recs if r["tag"] == t) for t in ("B", "A"))
    if HAND[k] == "sx":
        rb, ra = mirrored(rb, 0.0), mirrored(ra, 0.0)
    h["B"] = object_from(f"B{k}", rb, M, (0, 0, 0), rig)
    if k == 2:  # the B SX that replaces the middle B DX, on the other face of A's web
        h["Bs"] = object_from(f"Bs{k}", mirrored(rb, WEB / 2), M, (0, 0, 0), rig)
        h["Bs"].hide_render = True
    h["pivot"] = empty(f"pivot{k}", rig, tuple(Y_UP @ pivot_mm))
    h["A"] = object_from(f"A{k}", ra, M, pivot_mm, h["pivot"])
    h["A"].location = (0, 0, 0)
    for tag in ("joint", "lock"):
        parent = rig if tag == "joint" else h["pivot"]
        base = (0, 0, 0) if tag == "joint" else pivot_mm
        for r in (r for r in recs if r["tag"] == tag):
            c = centre_of(r)
            ob = object_from(f"{tag}-{r['kind']}{k}-{len(h['hw'])}", r, M, c, parent)
            ob.location = Vector(Y_UP @ (c - np.asarray(base)))
            h["hw"].setdefault(tag, []).append((r["kind"], ob, ob.location.copy()))
    # wedge anchors: stud + washer + nut on the wall normal (wall-local -Y = out of the wall)
    spare = {r["kind"]: r for r in recs if r["tag"] == "spare"}
    h["anchors"] = []
    for j, y in enumerate(ANCHORS):
        grp = empty(f"anchor{k}{j}", rig, tuple(Y_UP @ np.array([face_x(k, k == 2), y, 0.0])))
        rot = Matrix.Rotation(math.radians(90), 4, "X")  # three.js +y (Blender +Z after Y_UP) -> wall-local -Y
        parts = []
        for kind, off in (("stud", -75.0), ("washer", 5.0), ("nut", 7.0)):
            ob = object_from(f"anchor-{kind}{k}{j}", spare[kind], M, (0, 0, 0), grp)
            ob.matrix_parent_inverse = Matrix.Identity(4)
            ob.matrix_basis = Matrix.Translation((0, -off * MM, 0)) @ rot
            parts.append((kind, ob, ob.matrix_basis.copy()))
        h["anchors"].append({"grp": grp, "parts": parts, "home": grp.location.copy()})
    # sill bolts from below through A's slots (18): M8 shown as the M10 bolt at 0.8 scale
    h["sillbolts"] = []
    for j, zmm in enumerate((100.0, 140.0)):  # one in each slot (18) of A, inside the sill; 10 mm of travel back
        ob = object_from(f"sillbolt{k}{j}", spare["bolt30"], M, (0, 0, 0), h["pivot"], 0.8)
        ob.matrix_parent_inverse = Matrix.Identity(4)
        at = Y_UP @ (np.array([mx(k, -25.0), 352.0, zmm]) - pivot_mm)
        ob.matrix_basis = Matrix.Translation(at)
        h["sillbolts"].append((ob, Vector(at)))
    # callout points
    h["pts"] = {  # the bolt heads (13, 14) stay where they are: the joint stack is the same on SX
        "17": empty(f"p17-{k}", rig, tuple(Y_UP @ np.array([face_x(k), 255.0, 5.0]))),
        "11": empty(f"p11-{k}", rig, tuple(Y_UP @ np.array([mx(k, -52.0), 120.0, 5.0]))),
        "12": empty(f"p12-{k}", h["pivot"], tuple(Y_UP @ (np.array([mx(k, -40.0), 333.0, 150.0]) - pivot_mm))),
        "13": empty(f"p13-{k}", rig, tuple(Y_UP @ np.array([13.0, 302.0, 23.5]))),
        "14": empty(f"p14-{k}", h["pivot"], tuple(Y_UP @ (np.array([13.0, 208.0, 23.5]) - pivot_mm))),
        "21": empty(f"p21-{k}", rig, tuple(Y_UP @ np.array([mx(k, -2.5), 207.0, 38.0]))),
        "18": empty(f"p18-{k}", h["pivot"], tuple(Y_UP @ (np.array([mx(k, -25.0), 333.0, 128.0]) - pivot_mm))),
    }
    for j, y in enumerate(ANCHORS):
        h["pts"][f"M{j}"] = empty(f"pM{k}{j}", rig, tuple(Y_UP @ np.array([face_x(k), y, 0.0])))
    return h


# ---------- wall, floor, holes and marks ----------
def build_wall(M, wall, pairs_x):
    """Front face in wall-local coordinates (plane y = 0, wall at +y); world top at z = 0."""
    o = wall.matrix_world.translation
    z_top = -o.z / math.cos(LEAN)
    x0, x1, z0, step = -1.6, 2.2, -0.95, 0.005
    nx, nz = int((x1 - x0) / step) + 1, int((z_top - z0) / step) + 1
    xs, zs = np.linspace(x0, x1, nx), np.linspace(z0, z_top, nz)
    X, Z = np.meshgrid(xs, zs)
    d = np.zeros_like(X)
    for i in range(nz):
        for j in range(nx):
            v = Vector((X[i, j] * 3.1, Z[i, j] * 3.1, 7.0))
            d[i, j] = 0.005 * mnoise.fractal(v, 0.6, 2.2, 5) + 0.0012 * mnoise.noise(Vector((X[i, j] * 18, Z[i, j] * 18, 3.0)))
    # formwork joints: shallow horizontal steps every 0.30 m
    for zj in np.arange(z_top - 0.18, z0, -0.30):
        d += 0.0
    # behind the brackets the wall may only recede (the plate bears on the high spots): B's side of each pair, both
    # sides behind the middle one (its B changes side)
    for k, px in enumerate(pairs_x):
        def ramp(a, b, v):
            return np.clip((v - a) / (b - a), 0, 1)
        lo, hi = (px - 0.16, px + 0.16) if k == 2 else (px - 0.05, px + 0.16) if HAND[k] == "sx" else (px - 0.16, px + 0.05)
        w = ramp(lo, lo + 0.03, X) * (1 - ramp(hi - 0.03, hi, X)) * ramp(-0.05, -0.02, Z) * (1 - ramp(0.34, 0.37, Z))
        w = w * w * (3 - 2 * w)
        d = d * (1 - w) + (0.0006 + 0.0004 * np.sin(X * 90) * np.sin(Z * 70)) * w
    # top arris: slightly broken
    d += 0.004 * np.clip((Z - (z_top - 0.012)) / 0.012, 0, 1) ** 2 * (0.5 + 0.5 * np.sin(X * 47))
    P = np.stack([X, d, Z], -1).reshape(-1, 3)
    faces = []
    for i in range(nz - 1):
        for j in range(nx - 1):
            a = i * nx + j
            faces += [a, a + 1, a + nx + 1, a, a + nx + 1, a + nx]
    me = mesh_from("wall", P, np.asarray(faces), None, [M["concrete"]], smooth=True)
    face = link(bpy.data.objects.new("wall", me))
    face.parent = wall
    # landing floor: world z = 0 from the arris back
    edge_y = (wall.matrix_world @ Vector((0, 0, z_top))).y
    fl = box("floor", (x1 - x0, 3.0, 0.002), M["screed"], ((x0 + x1) / 2, edge_y + 1.5 + 0.0004, -0.001))
    body = box("wallbody", (x1 - x0, 1.0, 1.0), M["concrete_box"], ((x0 + x1) / 2, edge_y + 0.62, -0.52))
    for name, xc in (("side-left", -0.8), ("side-right", 1.5)):  # the shaft's side walls, up past the landing
        box(name, (0.2, 2.2, 4.0), M["side"], (xc, edge_y - 1.0, 0.8))
    return face, z_top, (P, nx, nz)


def wall_depth_at(P, nx, nz, x, z, x0=-1.6, z0=-0.95, step=0.005):
    j, i = int(round((x - x0) / step)), int(round((z - z0) / step))
    return float(P[i * nx + j, 1])


# ---------- lights, world, camera ----------
def build(scene):
    M = make_materials()
    meta, recs = load_meshes(f"{HERE}/mesh/pair")
    wall = empty("wallrig")
    wall.rotation_euler = (LEAN, 0, 0)
    # B's height: once A is set level its platform top carries the sill bottom at -SILL_H (sill top = floor)
    py, pz = -float(meta["pivot"][2]) * MM, float(meta["pivot"][1]) * MM
    wall.location = (0, 0, -SILL_H - (py * math.sin(LEAN) + pz * math.cos(LEAN) + 0.031))
    bpy.context.view_layer.update()
    face, z_top, grid = build_wall(M, wall, PAIR_X)
    pairs = [build_pair(k, wall, M, meta, recs, x) for k, x in enumerate(PAIR_X)]
    holes, marks = [], []
    for k, h in enumerate(pairs):
        for j, y in enumerate(ANCHORS):
            x, z = PAIR_X[k] + face_x(k, k == 2) * MM, y * MM
            d = wall_depth_at(*grid, x, z)
            hole = cylinder(f"hole{k}{j}", 0.0052, 0.0008, M["hole"], loc=(x, d - 0.0006, z), axis="Y", segs=32, parent=wall)
            dust = cylinder(f"dust{k}{j}", 0.0115, 0.0005, M["dust"], loc=(x, d - 0.0003, z), axis="Y", segs=24, parent=wall)
            dust.scale = (1.0, 1.0, 1.0)
            mk = [box(f"mark{k}{j}{q}", (0.014 if q == 0 else 0.0011, 0.0004, 0.0011 if q == 0 else 0.014), M["mark"],
                      (x, d - 0.0002, z), 0, wall) for q in range(2)]
            holes.append((k, j, hole, dust))
            marks.append((k, j, mk))
    rebar = build_rebar(M, wall, PAIR_X[2] + FACE_X * MM, ANCHORS[0] * MM, lambda x, z: wall_depth_at(*grid, x, z))
    drill, bit = build_drill(M)
    marker = build_marker(M)
    ratchet = build_ratchet(M)
    level, bub1, bub2 = build_level(M)
    sill = build_sill(M, 0.86)
    ghosts = {}
    ghost_sill = build_sill(M, 0.86, "ghost", "ghost-sill")  # where the landing sill goes (blueprint)
    ghost_sill.modifiers.clear()
    wf = ghost_sill.modifiers.new("wire", "WIREFRAME")
    wf.thickness, wf.use_even_offset, wf.use_replace = 0.0011, True, True
    car_sill = build_sill(M, 0.9, "alu", "car-sill")  # the car sill, at the landing, the measuring reference
    grinder = build_grinder(M)
    cuts = build_cut(pairs)
    worlds, lights = studio(scene)
    sill_y = (wall.matrix_world @ Vector((0, 0, z_top))).y - 0.004
    cam = link(bpy.data.objects.new("cam", bpy.data.cameras.new("cam")))
    cam.data.sensor_width = 36.0
    cam.data.clip_start, cam.data.clip_end = 0.01, 30
    scene.camera = cam
    return {"M": M, "meta": meta, "wall": wall, "face": face, "z_top": z_top, "grid": grid, "pairs": pairs,
            "holes": holes, "marks": marks, "drill": drill, "bit": bit, "marker": marker, "ratchet": ratchet,
            "level": level, "bub1": bub1, "bub2": bub2, "sill": sill, "ghost_sill": ghost_sill, "car_sill": car_sill,
            "grinder": grinder, "cuts": cuts, "rebar": rebar,
            "worlds": worlds, "lights": lights, "cam": cam,
            "floor": bpy.data.objects["floor"], "body": bpy.data.objects["wallbody"], "sides": [bpy.data.objects["side-left"], bpy.data.objects["side-right"]], "sill_y": sill_y}
