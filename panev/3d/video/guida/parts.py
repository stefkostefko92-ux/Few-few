"""Hardware and props of the counterweight-guide film (owner, 25.11.2026): the large washer on every fastener (SG bolts
above and below, anchors, N1 clips), a split lock washer (grower spezzata) under every nut of the SG bolts and of the
clips, the forged N1 rail clip, the yellow plumb lines with their bobs, the oiled T rail.
- large washer: ISO 7093-1 for M10, 10.5 × 30 × 2.5 mm;
- grower: DIN 127 B for M10, 10.2 × 18.1, section 3.7 × 2.2 mm, its cut ends sprung 2.2 mm apart (flat once tight);
- N1 clip: the trade's forged T-head clip for T45/T50 rails (Donati GF01027: N.1, M10, head 22 × 32 mm, oiled steel,
  nut UNI 5588), its head stepped underneath by the rail foot's 5 mm, so the nose bears on the foot and the heel on the
  bracket: tightening the nut clamps the foot. Head height and the step's place are ours (not in the source).
Every part is built along its local +Z from z = 0 (the face it bears with), so place() can pile them on an axis."""
import math
import bmesh
from mathutils import Matrix
from lib import MM, bm_object, empty, cylinder, material, noise, maprange, node
from motion import basis

BIG = (5.25, 15.0, 2.5)        # large washer: inner, outer radius, thickness (mm)
WASHER_H = 2.0                 # ISO 7089 (exported with the hardware)
GROWER = (5.1, 8.8, 2.2, 2.2)  # inner, outer radius, section height, free spring (mm)
NUT_H = 8.4


def rail_steel(nt, b):
    """Cold-drawn T rail: oiled dark steel, patchy sheen, fine drawing lines along the length (local z)."""
    nt.links.new(maprange(nt, noise(nt, 18.0, 4.0, 0.55), 0.3, 0.52).outputs["Result"], b.inputs["Roughness"])
    bp = node(nt, "ShaderNodeBump", Strength=0.05, Distance=0.0002)
    nt.links.new(noise(nt, 300.0, 3.0, 0.6, (60, 60, 1)).outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def line_fibre(nt, b):
    """Braided nylon line: a fine twist along its length (local z)."""
    bp = node(nt, "ShaderNodeBump", Strength=0.35, Distance=0.0002)
    nt.links.new(noise(nt, 2600.0, 2.0, 0.5, (1, 1, 0.08)).outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def forged_black(nt, b):
    """Black oiled forging: hammered pits, a satin sheen that varies."""
    nt.links.new(maprange(nt, noise(nt, 60.0, 4.0, 0.6), 0.32, 0.55).outputs["Result"], b.inputs["Roughness"])
    bp = node(nt, "ShaderNodeBump", Strength=0.25, Distance=0.0004)
    nt.links.new(noise(nt, 900.0, 5.0, 0.65).outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def film_materials(M):
    M["oiled"] = material("oiled", (0.05, 0.05, 0.055), 0.42, 0.75, forged_black)
    M["rail"] = material("rail", (0.33, 0.335, 0.34), 0.45, 0.85, rail_steel)
    M["line"] = material("line", (0.86, 0.78, 0.02), 0.6, 0.0, line_fibre)
    M["brass"] = material("brass", (0.78, 0.6, 0.3), 0.3, 1.0)
    return M


def lathe_z(name, prof, mat, parent, segs=72, closed=False):
    """Solid of revolution about local Z: prof = [(z, r), …]; `closed` joins the last ring back to the first (a ring)."""
    bm = bmesh.new()
    rings = [[bm.verts.new((r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z)) for k in range(segs)]
             for z, r in prof]
    pairs = list(zip(rings, rings[1:])) + ([(rings[-1], rings[0])] if closed else [])
    for a, b in pairs:
        for k in range(segs):
            bm.faces.new((a[k], b[k], b[(k + 1) % segs], a[(k + 1) % segs]))
    if not closed:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_object(name, bm, mat, smooth=True, parent=parent)


def big_washer(name, M, parent=None):
    """ISO 7093 washer, z = 0 … 2.5 mm, outer edges broken."""
    ri, ro, h = (v * MM for v in BIG)
    e = 0.3 * MM
    return lathe_z(name, [(0, ri), (0, ro - e), (e, ro), (h - e, ro), (h, ro - e), (h, ri)], M["hw"], parent, closed=True)


def grower(name, M, parent=None, segs=120):
    """Split lock washer: a rectangular section (corners rounded) swept round a helix, the cut ends sprung apart."""
    ri, ro, s, spring = (v * MM for v in GROWER)
    gap = math.radians(9.0)
    bm = bmesh.new()
    c = 0.45 * MM
    sec = [(ri + c, 0), (ro - c, 0), (ro, c), (ro, s - c), (ro - c, s), (ri + c, s), (ri, s - c), (ri, c)]
    rings = []
    for k in range(segs + 1):
        u = k / segs
        a = gap / 2 + (2 * math.pi - gap) * u
        ca, sa = math.cos(a), math.sin(a)
        rings.append([bm.verts.new((r * ca, r * sa, z + spring * u)) for r, z in sec])
    n = len(sec)
    for a, b in zip(rings, rings[1:]):
        for k in range(n):
            bm.faces.new((a[k], a[(k + 1) % n], b[(k + 1) % n], b[k]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_object(name, bm, M["hw"], smooth=True, parent=parent)


def place(ob, at, axis, spin=0.0, hint=(0.3, 0.7, 0.2)):
    """matrix_basis: local +Z along `axis` from the point `at` (parent space), turned `spin` about it."""
    m = Matrix.Translation(at) @ basis(axis, hint) @ Matrix.Rotation(spin, 4, "Z")
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob.matrix_basis = m
    return m


def plumb(name, M, top):
    """A plumb line hung from `top` (world): a pivot empty there, the line down its −Z (1 m long, scaled to the length),
    the bob's empty at the end with a 250 g brass bob (Ø 24 mm) under it. Returns the pivot, the line and the bob."""
    pv = empty(f"{name}-pivot", None, top)
    line = cylinder(f"{name}-line", 0.00075, 1.0, M["line"], segs=10, loc=(0, 0, -1.0), parent=pv)
    bob = empty(f"{name}-bob", pv)
    lathe_z(f"{name}-bobbody", [(0.0, 0.0012), (-0.004, 0.005), (-0.008, 0.011), (-0.012, 0.012), (-0.048, 0.012),
                                (-0.074, 0.0005)], M["brass"], bob, segs=48)
    return pv, line, bob


N1 = {"nose": 16.0, "heel": 16.0, "wide": 22.0, "narrow": 16.0, "top": 12.0, "step": -7.0, "foot": 5.0, "shank": 25.0}


def n1_clip(name, M, spare, parent=None):
    """The forged N1 clip in its own frame (mm values from N1): origin on the shank axis at the bracket face, +x away
    from the rail (the heel), +y along the rail, +z out of the bracket. The head tapers from 22 mm at the nose to 18 at
    the heel; underneath it is stepped: x < step stands on the rail foot (z = 5), the rest on the bracket (z = 0). A sunk
    panel on top carries a raised N1. The M10 shank (25 mm) runs down -z, its nut (UNI 5588, black) comes with it."""
    import bpy
    from mathutils import Vector
    from stage import object_from
    g = empty(name, parent)
    n = {k: v * MM for k, v in N1.items()}
    prof = [(-n["nose"], n["foot"]), (n["step"], n["foot"]), (n["step"], 0.0), (n["heel"], 0.0), (n["heel"], n["top"]),
            (-n["nose"], n["top"])]
    half = lambda x: (n["wide"] + (n["narrow"] - n["wide"]) * (x + n["nose"]) / (n["nose"] + n["heel"])) / 2
    bm = bmesh.new()
    sides = [[bm.verts.new((x, s * half(x), z)) for x, z in prof] for s in (-1, 1)]
    k = len(prof)
    for i in range(k):
        bm.faces.new((sides[0][i], sides[0][(i + 1) % k], sides[1][(i + 1) % k], sides[1][i]))
    bm.faces.new(sides[0][::-1])
    bm.faces.new(sides[1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    top = next(f for f in bm.faces if f.normal.z > 0.9 and min(v.co.z for v in f.verts) > n["top"] - 1e-6)
    bmesh.ops.inset_region(bm, faces=[top], thickness=0.0026, depth=-0.0012)  # the forged rim round a sunk panel
    head = bm_object(f"{name}-head", bm, M["oiled"], parent=g)
    bv = head.modifiers.new("bevel", "BEVEL")
    bv.width, bv.segments, bv.limit_method, bv.angle_limit = 0.0011, 3, "ANGLE", math.radians(30)
    shank = object_from(f"{name}-shank", spare["shank"], M, (0, 0, 0), g)
    shank.data.materials[0] = M["oiled"]
    place(shank, Vector((0, 0, -n["shank"])), Vector((0, 0, 1)))
    shank.scale.z = N1["shank"] / 29.6
    txt = bpy.data.curves.new(f"{name}-mark", "FONT")
    txt.body, txt.size, txt.extrude, txt.align_x, txt.align_y = "N1", 0.0075, 0.00045, "CENTER", "CENTER"
    mark = bpy.data.objects.new(f"{name}-mark", txt)
    bpy.context.scene.collection.objects.link(mark)
    mark.parent = g
    mark.data.materials.append(M["oiled"])
    mark.location = (0.001, 0.0, n["top"] - 0.0012)
    mark.rotation_euler = (0, 0, math.radians(90))
    return g
