"""Builds the mounting-video scene: the out-of-plumb concrete wall under the landing, two bracket pairs
(A 45 175 2 + B 45 320, DX) from the site's 3-D engine, M10 wedge anchors in 10 mm holes, the tools
(hammer drill, marker, spanner, spirit level) and the landing-door sill. Returns handles for pose.py."""
import json
import math
import os
import bpy
import numpy as np
from mathutils import Matrix, Vector, noise as mnoise
from lib import MM, Y_UP, link, mesh_from, empty, box, cylinder, node
from materials import ASSETS, make_materials
from grinder import build_grinder
from cut import build_cut
from props import SILL_H, build_drill, build_marker, build_spanner, build_level, build_sill

HERE = os.path.dirname(os.path.abspath(__file__)).replace("\\", "/")
LEAN = math.radians(5.0)      # the wall is out of plumb: its top leans 5° into the shaft
PAIR_X = (0.0, 0.62, 0.31)    # left, right and (step 10) the middle bracket
ANCHORS = (225.0, 52.0)       # anchor heights on B (mm): middle of the closed slot, the open slot
FACE_X = -30.0                # centre of B's fixing face (mm, DX)


# ---------- the bracket pair ----------
def load_pair(M):
    meta = json.load(open(f"{HERE}/mesh/pair.json"))
    raw = open(f"{HERE}/mesh/pair.bin", "rb").read()
    out = []
    for m in meta["meshes"]:
        ps, ns, idx, mats, base = [], [], [], [], 0
        for k, (mat, c) in enumerate(m["chunks"].items()):
            p = np.frombuffer(raw, np.float32, c["verts"] * 3, c["p"]).reshape(-1, 3).astype(np.float64)
            n = np.frombuffer(raw, np.float32, c["verts"] * 3, c["n"]).reshape(-1, 3).astype(np.float64)
            i = np.frombuffer(raw, np.uint32, c["tris"] * 3, c["i"]).astype(np.int64)
            ps.append(p); ns.append(n); idx.append(i + base); mats.append((mat, len(i) // 3)); base += len(p)
        out.append({"tag": m["tag"], "kind": m["kind"], "p": np.concatenate(ps), "n": np.concatenate(ns),
                    "i": np.concatenate(idx), "mats": mats})
    return meta, out


def object_from(name, rec, M, origin_mm, parent, scale=1.0):
    """Mesh in metres (Blender axes) with its origin at origin_mm (three.js mm)."""
    p = (rec["p"] - np.asarray(origin_mm)) @ Y_UP.T * scale
    n = rec["n"] @ (Y_UP.T / MM)
    me = mesh_from(name, p, rec["i"], n, [M[m] for m, _ in rec["mats"]])
    # material index per triangle, in chunk order
    mi = np.concatenate([np.full(cnt, k, np.int32) for k, (_, cnt) in enumerate(rec["mats"])])
    me.polygons.foreach_set("material_index", mi)
    ob = link(bpy.data.objects.new(name, me))
    ob.parent = parent
    ob.location = Vector(Y_UP @ np.asarray(origin_mm))
    return ob


def centre_of(rec):
    return (rec["p"].min(0) + rec["p"].max(0)) / 2


def build_pair(k, wall, M, meta, recs, x):
    rig = empty(f"pair{k}", wall, (x, 0, 0))
    pivot_mm = np.asarray(meta["pivot"])
    h = {"rig": rig, "hw": {}}
    h["B"] = object_from(f"B{k}", next(r for r in recs if r["tag"] == "B"), M, (0, 0, 0), rig)
    h["pivot"] = empty(f"pivot{k}", rig, tuple(Y_UP @ pivot_mm))
    h["A"] = object_from(f"A{k}", next(r for r in recs if r["tag"] == "A"), M, pivot_mm, h["pivot"])
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
        grp = empty(f"anchor{k}{j}", rig, tuple(Y_UP @ np.array([FACE_X, y, 0.0])))
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
    for j, zmm in enumerate((90.0, 135.0)):  # one in each slot (18) of A, both under the sill
        ob = object_from(f"sillbolt{k}{j}", spare["bolt30"], M, (0, 0, 0), h["pivot"], 0.8)
        ob.matrix_parent_inverse = Matrix.Identity(4)
        at = Y_UP @ (np.array([-25.0, 352.0, zmm]) - pivot_mm)
        ob.matrix_basis = Matrix.Translation(at)
        h["sillbolts"].append((ob, Vector(at)))
    # callout points
    h["pts"] = {
        "17": empty(f"p17-{k}", rig, tuple(Y_UP @ np.array([FACE_X, 255.0, 5.0]))),
        "11": empty(f"p11-{k}", rig, tuple(Y_UP @ np.array([-52.0, 120.0, 5.0]))),
        "12": empty(f"p12-{k}", h["pivot"], tuple(Y_UP @ (np.array([-40.0, 333.0, 150.0]) - pivot_mm))),
        "13": empty(f"p13-{k}", rig, tuple(Y_UP @ np.array([13.0, 302.0, 23.5]))),
        "14": empty(f"p14-{k}", h["pivot"], tuple(Y_UP @ (np.array([13.0, 208.0, 23.5]) - pivot_mm))),
        "21": empty(f"p21-{k}", rig, tuple(Y_UP @ np.array([-2.5, 207.0, 38.0]))),
        "18": empty(f"p18-{k}", h["pivot"], tuple(Y_UP @ (np.array([-25.0, 333.0, 128.0]) - pivot_mm))),
    }
    for j, y in enumerate(ANCHORS):
        h["pts"][f"M{j}"] = empty(f"pM{k}{j}", rig, tuple(Y_UP @ np.array([FACE_X, y, 0.0])))
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
    # behind the brackets the wall may only recede (the plate bears on the high spots)
    for px in pairs_x:
        def ramp(a, b, v):
            return np.clip((v - a) / (b - a), 0, 1)
        w = ramp(px - 0.16, px - 0.13, X) * (1 - ramp(px + 0.02, px + 0.05, X)) * ramp(-0.05, -0.02, Z) * (1 - ramp(0.34, 0.37, Z))
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
def studio(scene):
    worlds = {}
    for name, (lo, hi, k) in {"shaft": ((0.010, 0.011, 0.014), (0.30, 0.31, 0.33), 0.55),
                              "intro": ((0.004, 0.008, 0.03), (0.10, 0.16, 0.42), 0.8)}.items():
        w = bpy.data.worlds.new(name)
        w.use_nodes = True
        nt = w.node_tree
        co = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(co.outputs["Generated"], sep.inputs["Vector"])
        cr = nt.nodes.new("ShaderNodeValToRGB")
        cr.color_ramp.elements[0].color = (*lo, 1)
        cr.color_ramp.elements[1].color = (*hi, 1)
        mr = node(nt, "ShaderNodeMapRange", **{"From Min": -1.0, "From Max": 1.0})
        nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
        nt.links.new(mr.outputs["Result"], cr.inputs["Fac"])
        nt.links.new(cr.outputs["Color"], nt.nodes["Background"].inputs["Color"])
        nt.nodes["Background"].inputs["Strength"].default_value = k
        if name == "intro":  # the camera sees the navy backdrop, the metal reflects a bright neutral studio
            lp = nt.nodes.new("ShaderNodeLightPath")
            st = nt.nodes.new("ShaderNodeValToRGB")
            st.color_ramp.elements[0].color = (0.04, 0.04, 0.045, 1)
            st.color_ramp.elements[1].color = (1.6, 1.6, 1.6, 1)
            e = st.color_ramp.elements.new(0.52); e.color = (0.35, 0.36, 0.38, 1)
            nt.links.new(mr.outputs["Result"], st.inputs["Fac"])
            mix = nt.nodes.new("ShaderNodeMixRGB")
            nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
            nt.links.new(st.outputs["Color"], mix.inputs["Color1"])
            nt.links.new(cr.outputs["Color"], mix.inputs["Color2"])
            nt.links.new(mix.outputs["Color"], nt.nodes["Background"].inputs["Color"])
        worlds[name] = w
    w = bpy.data.worlds.new("shaft_hdri")
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(f"{ASSETS}/interior_construction_4k.hdr")
    co = nt.nodes.new("ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping", Rotation=(0, 0, math.radians(140)))
    nt.links.new(co.outputs["Generated"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
    nt.links.new(env.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    nt.nodes["Background"].inputs["Strength"].default_value = 0.9
    worlds["shaft"] = w
    lights = {}

    def area(name, loc, target, w, h, radiance, colour=(1, 1, 1)):
        L = bpy.data.lights.new(name, "AREA")
        L.shape, L.size, L.size_y, L.color = "RECTANGLE", w, h, colour
        L.energy = radiance * math.pi * w * h
        ob = link(bpy.data.objects.new(name, L))
        ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        ob.visible_camera = False
        lights[name] = ob
        return ob

    area("key", (-0.62, -1.4, 0.9), (0.2, 0, -0.25), 0.32, 0.22, 70.0, (1.0, 0.97, 0.93))
    area("fill", (1.6, -1.2, 0.2), (0.3, 0, -0.25), 1.0, 1.4, 0.5, (0.88, 0.93, 1.0))
    area("top", (0.3, -0.5, 1.6), (0.3, 0, -0.2), 1.6, 1.2, 0.6)
    # (no rim light: anything behind the wall face is inside the concrete)
    return worlds, lights


def build(scene):
    M = make_materials()
    meta, recs = load_pair(M)
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
            x, z = PAIR_X[k] + FACE_X * MM, y * MM
            d = wall_depth_at(*grid, x, z)
            hole = cylinder(f"hole{k}{j}", 0.0052, 0.0008, M["hole"], loc=(x, d - 0.0006, z), axis="Y", segs=32, parent=wall)
            dust = cylinder(f"dust{k}{j}", 0.0115, 0.0005, M["dust"], loc=(x, d - 0.0003, z), axis="Y", segs=24, parent=wall)
            dust.scale = (1.0, 1.0, 1.0)
            mk = [box(f"mark{k}{j}{q}", (0.014 if q == 0 else 0.0011, 0.0004, 0.0011 if q == 0 else 0.014), M["mark"],
                      (x, d - 0.0002, z), 0, wall) for q in range(2)]
            holes.append((k, j, hole, dust))
            marks.append((k, j, mk))
    drill, bit = build_drill(M)
    marker = build_marker(M)
    spanner = build_spanner(M)
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
            "holes": holes, "marks": marks, "drill": drill, "bit": bit, "marker": marker, "spanner": spanner,
            "level": level, "bub1": bub1, "bub2": bub2, "sill": sill, "ghost_sill": ghost_sill, "car_sill": car_sill,
            "grinder": grinder, "cuts": cuts,
            "worlds": worlds, "lights": lights, "cam": cam,
            "floor": bpy.data.objects["floor"], "body": bpy.data.objects["wallbody"], "sides": [bpy.data.objects["side-left"], bpy.data.objects["side-right"]], "sill_y": sill_y}
