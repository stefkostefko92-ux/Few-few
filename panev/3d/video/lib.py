"""Blender helpers for the mounting video: meshes from arrays, materials, simple solids."""
import math
import os
import sys
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

MM = 0.001
# three.js millimetres (x, y up, z towards the shaft) -> Blender metres (x, -z, y up)
Y_UP = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]], dtype=np.float64) * MM


def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def mesh_from(name, p, idx, n=None, mats=(), smooth=True):
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(p)); me.loops.add(len(idx)); me.polygons.add(len(idx) // 3)
    me.vertices.foreach_set("co", np.asarray(p, np.float32).ravel())
    me.loops.foreach_set("vertex_index", np.asarray(idx, np.int32))
    me.polygons.foreach_set("loop_start", np.arange(0, len(idx), 3, dtype=np.int32))
    me.polygons.foreach_set("loop_total", np.full(len(idx) // 3, 3, dtype=np.int32))
    me.polygons.foreach_set("use_smooth", np.full(len(idx) // 3, smooth, dtype=bool))
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    if n is not None:
        me.normals_split_custom_set_from_vertices([tuple(x) for x in n])
    for m in mats:
        me.materials.append(m)
    return me


def bm_object(name, bm, mat=None, smooth=False, parent=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = link(bpy.data.objects.new(name, me))
    if mat:
        me.materials.append(mat)
    if parent:
        ob.parent = parent
    return ob


def empty(name, parent=None, loc=(0, 0, 0)):
    ob = link(bpy.data.objects.new(name, None))
    ob.empty_display_size = 0.02
    ob.location = loc
    if parent:
        ob.parent = parent
    return ob


def bevel(ob, width, segments=3, limit=30):
    m = ob.modifiers.new("bevel", "BEVEL")
    m.width, m.segments, m.limit_method = width, segments, "ANGLE"
    m.angle_limit = math.radians(limit)
    m.harden_normals = False
    return m


def box(name, size, mat, loc=(0, 0, 0), bev=0.0, parent=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    ob = bm_object(name, bm, mat, parent=parent)
    ob.location = loc
    if bev:
        bevel(ob, bev)
    return ob


def cylinder(name, r, h, mat, segs=48, loc=(0, 0, 0), axis="Z", bev=0.0, parent=None, r2=None):
    """Cylinder (or cone with r2) from z=0 to z=h along `axis`."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, h / 2))
    rot = {"Z": Matrix.Identity(3), "X": Matrix.Rotation(math.pi / 2, 3, "Y"), "Y": Matrix.Rotation(-math.pi / 2, 3, "X")}[axis]
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=rot)
    ob = bm_object(name, bm, mat, smooth=True, parent=parent)
    ob.location = loc
    if bev:
        bevel(ob, bev, 2, 60)
    ob.data.shade_auto_smooth(angle=math.radians(40)) if hasattr(ob.data, "shade_auto_smooth") else None
    return ob


def prism(name, outline, depth, mat, holes=(), parent=None, bev=0.0):
    """Extrude a 2-D outline (x, y metres, CCW) along +z by depth; holes are CW loops."""
    bm = bmesh.new()
    loops = [outline, *holes]
    edges = []
    for loop in loops:
        vs = [bm.verts.new((x, y, 0)) for x, y in loop]
        edges += [bm.edges.new((vs[i], vs[(i + 1) % len(vs)])) for i in range(len(vs))]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges)
    faces = list(bm.faces)
    ext = bmesh.ops.extrude_face_region(bm, geom=faces)
    top = [g for g in ext["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=top, vec=(0, 0, depth))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1), verts=bm.verts, edges=bm.edges, delimit={"NORMAL"})
    ob = bm_object(name, bm, mat, parent=parent)
    if bev:
        bevel(ob, bev, 2, 40)
    return ob


def rounded_rect(w, h, r, segs=6, cx=0.0, cy=0.0):
    pts = []
    for qx, qy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oy = cx + qx * (w / 2 - r), cy + qy * (h / 2 - r)
        for k in range(segs + 1):
            a = math.radians(a0 + 90 * k / segs)
            pts.append((ox + r * math.cos(a), oy + r * math.sin(a)))
    return pts


def circle_pts(r, n=32, cx=0.0, cy=0.0, cw=False):
    pts = [(cx + r * math.cos(2 * math.pi * k / n), cy + r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return pts[::-1] if cw else pts


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def material(name, base, rough, metal=0.0, build=None, **extra):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*base, 1)
    b.inputs["Metallic"].default_value = metal
    b.inputs["Roughness"].default_value = rough
    for k, v in extra.items():
        b.inputs[k].default_value = v
    if build:
        build(nt, b)
    return m


def noise(nt, scale, detail=6.0, rough=0.55, stretch=(1, 1, 1), coord="Object"):
    co = nt.nodes.new("ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping", Scale=stretch)
    nt.links.new(co.outputs[coord], mp.inputs["Vector"])
    n = node(nt, "ShaderNodeTexNoise", Scale=scale, Detail=detail, Roughness=rough)
    nt.links.new(mp.outputs["Vector"], n.inputs["Vector"])
    return n


def maprange(nt, src, lo, hi, a=0.25, b=0.75, out="Fac"):
    r = node(nt, "ShaderNodeMapRange", **{"From Min": a, "From Max": b, "To Min": lo, "To Max": hi})
    nt.links.new(src.outputs[out], r.inputs["Value"])
    return r


def math_op(nt, op, a, b=None, val=None):
    m = nt.nodes.new("ShaderNodeMath")
    m.operation = op
    nt.links.new(a, m.inputs[0])
    if b is not None:
        nt.links.new(b, m.inputs[1])
    elif val is not None:
        m.inputs[1].default_value = val
    return m


def look_at(ob, eye, target, roll=0.0):
    ob.location = Vector(eye)
    d = Vector(target) - Vector(eye)
    q = d.to_track_quat("-Z", "Y")
    if roll:
        q = q @ Matrix.Rotation(roll, 4, "Z").to_quaternion()
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = q


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def ease_io(t):
    t = min(1.0, max(0.0, t))
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def seg(t, a, b, fn=ease_io):
    """Progress 0..1 of time t over [a, b], eased."""
    if b <= a:
        return 1.0 if t >= b else 0.0
    return fn((t - a) / (b - a))


def lerp(a, b, k):
    return tuple(x + (y - x) * k for x, y in zip(a, b)) if isinstance(a, (tuple, list, Vector)) else a + (b - a) * k


def annulus(name, r_out, r_in, t, mat, n=48, n_in=None, parent=None):
    """Flat ring in the xy plane from z = 0 to z = t (inner loop may have fewer sides, e.g. 12)."""
    n_in = n_in or n
    bm = bmesh.new()
    def loop(r, k, z):
        return [bm.verts.new((r * math.cos(2 * math.pi * i / k), r * math.sin(2 * math.pi * i / k), z)) for i in range(k)]
    def at(lp, i, k):
        return lp[int(round(i * len(lp) / k)) % len(lp)]
    lo_o, hi_o = loop(r_out, n, 0), loop(r_out, n, t)
    lo_i, hi_i = loop(r_in, n_in, 0), loop(r_in, n_in, t)
    for i in range(n):  # outer wall
        bm.faces.new((lo_o[i], lo_o[(i + 1) % n], hi_o[(i + 1) % n], hi_o[i]))
    for i in range(n_in):  # inner wall
        bm.faces.new((lo_i[(i + 1) % n_in], lo_i[i], hi_i[i], hi_i[(i + 1) % n_in]))
    for o, inn, flip in ((hi_o, hi_i, False), (lo_o, lo_i, True)):  # caps: bridge with triangles
        for i in range(n):
            a, b = o[i], o[(i + 1) % n]
            c = at(inn, (i + 1) * n_in / n, n_in) if False else inn[int(((i + 1) * n_in) // n) % n_in]
            d = inn[int((i * n_in) // n) % n_in]
            f = (a, b, c, d) if c is not d else (a, b, c)
            try:
                bm.faces.new(f[::-1] if flip else f)
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_object(name, bm, mat, parent=parent)


def script_args():
    """The script's own arguments: after "--" under `blender -b -P script.py -- …`, else after the script (bpy module)."""
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]


def use_device(scene):
    """VIDEO_DEVICE=OPTIX (NVIDIA RTX), CUDA, HIP or METAL renders on every GPU of that kind; unset or CPU on the CPU."""
    kind = os.environ.get("VIDEO_DEVICE", "CPU").upper()
    if kind == "CPU":
        scene.cycles.device = "CPU"
        return "CPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = kind
    prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type == kind]
    if not gpus:
        raise SystemExit(f"no {kind} device: install the NVIDIA Studio driver or set VIDEO_DEVICE=CUDA")
    for d in prefs.devices:
        d.use = d.type == kind
    scene.cycles.device = "GPU"
    return ", ".join(d.name for d in gpus)
