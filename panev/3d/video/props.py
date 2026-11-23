"""The tools and the sill of the mounting video: masonry bit, Poly Haven drill and spanner (CC0), marker, spirit level,
the landing-door sill profile."""
import math
import bmesh
import bpy
from mathutils import Matrix
from lib import link, bm_object, empty, box, cylinder, prism, node
from materials import ASSETS

SILL_H, SILL_D = 0.028, 0.095  # landing-door sill section (generic aluminium profile)


# ---------- tools ----------
def twisted_bit(name, r, length, M, parent):
    bm = bmesh.new()
    prof = []
    for k in range(40):
        a = 2 * math.pi * k / 40
        rr = r * (1 - 0.38 * max(0, math.cos(2 * a)) ** 3)
        prof.append((rr * math.cos(a), rr * math.sin(a)))
    rings, steps = [], 90
    for s in range(steps + 1):
        y = -length * s / steps
        tw = y / 0.022 * 2 * math.pi
        c, si = math.cos(tw), math.sin(tw)
        rings.append([bm.verts.new((x * c - z * si, y, x * si + z * c)) for x, z in prof])
    for a, b in zip(rings, rings[1:]):
        for k in range(len(prof)):
            bm.faces.new((a[k], a[(k + 1) % len(prof)], b[(k + 1) % len(prof)], b[k]))
    bm.faces.new(rings[-1])
    tip = bm.verts.new((0, 0.004, 0))
    for k in range(len(prof)):
        bm.faces.new((rings[0][(k + 1) % len(prof)], rings[0][k], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_object(name, bm, M["steel"], smooth=True, parent=parent)


def scanned_prop(name, blend):
    """Appends a Poly Haven model (CC0) from assets/: its mesh with its own photo-scanned material."""
    with bpy.data.libraries.load(f"{ASSETS}/{blend}", link=False) as (src, dst):
        dst.objects = [name]
    ob = dst.objects[0]
    link(ob)
    return ob


def build_drill(M):
    """Photo-scanned cordless hammer drill (Poly Haven Drill_01), re-coloured in Panev navy, with a 10 mm masonry
    bit; rig origin at the bit tip, drilling along +y, handle down."""
    g = empty("drill")
    bit = twisted_bit("drill-bit", 0.005, 0.14, M, g)
    ob = scanned_prop("Drill_01", "Drill_01/Drill_01_2k.blend")
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.x < -0.1175], context="VERTS")  # its screwdriver bit
    bm.to_mesh(me); bm.free()
    k = 1.15
    me.transform(Matrix.Translation((0, -0.118, 0)) @ Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(k, 4)
                 @ Matrix.Translation((0.1175, -0.0026, -0.1565)))
    ob.matrix_world = Matrix.Identity(4)
    ob.parent = g
    mat = me.materials[0]
    nt = mat.node_tree
    diff = next(n for n in nt.nodes if n.type == "TEX_IMAGE" and "diff" in (n.image.name if n.image else ""))
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    hsv = node(nt, "ShaderNodeHueSaturation", Hue=0.93, Saturation=1.0, Value=0.13)
    nt.links.new(diff.outputs["Color"], hsv.inputs["Color"])
    nt.links.new(hsv.outputs["Color"], bsdf.inputs["Base Color"])
    return g, bit


def build_marker(M):
    """Marker, tip at the origin, pointing +y (into the wall)."""
    g = empty("marker")
    cylinder("marker-tip", 0.0022, 0.012, M["mark"], loc=(0, -0.012, 0), axis="Y", r2=0.0008, parent=g)
    cylinder("marker-cone", 0.0075, 0.014, M["graphite"], loc=(0, -0.026, 0), axis="Y", r2=0.0024, parent=g)
    cylinder("marker-body", 0.0085, 0.11, M["navy"], loc=(0, -0.136, 0), axis="Y", bev=0.0015, parent=g)
    cylinder("marker-end", 0.0088, 0.018, M["graphite"], loc=(0, -0.148, 0), axis="Y", bev=0.002, parent=g)
    return g


def build_spanner(M):
    """Photo-scanned combination spanner (Poly Haven combination_wrench) sized for M10 nuts (16 mm): ring centre at
    the origin, ring axis +z, handle along +x."""
    g = empty("spanner")
    ob = scanned_prop("combination_wrench", "combination_wrench/combination_wrench_2k.blend")
    ob.data.transform(Matrix.Rotation(math.radians(-90), 4, "Z") @ Matrix.Scale(0.82, 4) @ Matrix.Translation((0.0, 0.1393, -0.0049)))
    ob.matrix_world = Matrix.Identity(4)
    ob.parent = g
    return g


def build_level(M):
    """Spirit level, 300 mm along local x, measuring face at z = 0, front face towards local -y."""
    g = empty("level")
    box("level-body", (0.30, 0.024, 0.05), M["alu"], (0, 0, 0.025), 0.0025, g)
    for sx in (-1, 1):
        box(f"level-cap{sx}", (0.022, 0.0262, 0.0522), M["navy"], (sx * 0.141, 0, 0.025), 0.004, g)
    box("level-win", (0.064, 0.0262, 0.024), M["window"], (0, 0, 0.026), 0.003, g)
    box("level-win2", (0.03, 0.0262, 0.03), M["window"], (0.095, 0, 0.026), 0.003, g)
    v1 = cylinder("level-vial", 0.0058, 0.05, M["liquid"], loc=(-0.025, -0.0132, 0.026), axis="X", parent=g)
    b1 = link(bpy.data.objects.new("level-bubble", bpy.data.meshes.new("bub")))
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.0042)
    for v in bm.verts:
        v.co.x *= 1.9
    bm.to_mesh(b1.data); bm.free(); b1.data.materials.append(M["bubble"]); b1.parent = g
    for p in b1.data.polygons:
        p.use_smooth = True
    b1.location = (0, -0.0172, 0.026)
    v2 = cylinder("level-vial2", 0.0058, 0.024, M["liquid"], loc=(0.095, -0.0132, 0.014), axis="Z", parent=g)
    b2 = b1.copy(); b2.data = b1.data.copy(); link(b2); b2.parent = g
    b2.scale = (1 / 1.9, 1, 1.9 / 1.0 * 0.55)
    b2.location = (0.095, -0.0172, 0.026)
    for m in (box("level-mark", (0.0008, 0.0002, 0.016), M["mark"], (sx * 0.006, -0.0192, 0.026), 0, g) for sx in (-1, 1)):
        pass
    for m in (box("level-mark2", (0.016, 0.0002, 0.0008), M["mark"], (0.095, -0.0192, 0.026 + sz * 0.006), 0, g) for sz in (-1, 1)):
        pass
    return g, b1, b2


def sill_profile():
    """Landing-door sill section in (y towards the shaft, z up): back at y = 0, top at z = SILL_H."""
    D, H = SILL_D, SILL_H
    top = [(0.0, H)]
    for gy in (0.028, 0.06):  # two door-shoe grooves
        top += [(gy - 0.0055, H), (gy - 0.0055, H - 0.015), (gy + 0.0055, H - 0.015), (gy + 0.0055, H)]
    top += [(D, H)]
    ridge = [(D, H - 0.004), (D - 0.003, H - 0.01), (D - 0.003, 0.003), (D - 0.006, 0.0)]
    bottom = [(0.004, 0.0), (0.0, 0.004)]
    pts = top + ridge + bottom
    return pts[::-1] if _area(pts) < 0 else pts


def _area(pts):
    return sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2


def build_sill(M, length, mat_name="alu", name="sill"):
    prof = sill_profile()
    ob = prism(name, [(y, z) for y, z in prof], length, M[mat_name], (), None, 0.0006 if mat_name == "alu" else 0)
    # prism extrudes along +z: lay it along +x with the profile in (y towards the shaft = -Y, z up)
    ob.data.transform(Matrix(((0, 0, 1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1))))
    return ob
