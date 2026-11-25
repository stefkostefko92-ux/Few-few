"""Hardware and props of the counterweight-guide film (owner, 25.11.2026): slightly larger washers above and below the
SG bolts, a split lock washer (grower spezzata) under every nut of the SG bolts and of the N1 clips, the yellow plumb
lines with their bobs, the oiled T rail.
- large washer: ISO 7093-1 for M10, 10.5 × 30 × 2.5 mm (the ISO 7089 washer of the clips is 10.5 × 20 × 2);
- grower: DIN 127 B for M10, 10.2 × 18.1, section 3.7 × 2.2 mm, its cut ends sprung 2.2 mm apart (flat once tight).
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


def film_materials(M):
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
