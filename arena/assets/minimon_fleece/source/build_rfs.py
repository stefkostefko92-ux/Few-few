"""Minimon fleece (RFS-01) — процедурен Blender модел на дрехата от техническия лист.

Пускане:  python build_rfs.py --out DIR [--renders front,back,...|all|none] [--samples N] [--scale PCT]
Среда:    RFS_FONT=<Pacifico-Regular.ttf> (надписът на гърба), RFS_COLORWAY=rose|black|violet,
          RFS_LOD=game (нискополигонален модел за играта, без гънки и аксесоари)

Геометрията идва от същите данни като скиците в листа (1 единица = 2 mm,
X = (x-200)*U, Z = (880-y)*U, Y от страничния изглед, отпред = -Y). Дясно на носещия = -X.
Логото на референтната марка НЕ е моделирано: кристалните контури бележат само слотовете.
"""
import argparse
import math
import os
import sys
import time

import bpy  # noqa: I001  (must load before addon_utils)
import addon_utils
import bmesh
from mathutils import Matrix, Vector, noise
from mathutils.bvhtree import BVHTree

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--renders", default="all")
ap.add_argument("--samples", type=int, default=128)
ap.add_argument("--scale", type=int, default=100)
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
OUT = os.path.abspath(args.out)
os.makedirs(OUT, exist_ok=True)

U = 0.002
SIDE_C = 204.0


def Zs(y):
    return (880.0 - y) * U


def Xs(x):
    return (x - 200.0) * U


def Ys(xs):
    return (xs - SIDE_C) * U


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


def cr(table, x):
    """Catmull-Rom интерполация на сортирана таблица [(x, v...)]; връща кортеж от стойности."""
    xs = [r[0] for r in table]
    if x <= xs[0]:
        return table[0][1:]
    if x >= xs[-1]:
        return table[-1][1:]
    i = max(j for j in range(len(xs) - 1) if xs[j] <= x)
    p0 = table[max(i - 1, 0)]
    p1, p2 = table[i], table[i + 1]
    p3 = table[min(i + 2, len(table) - 1)]
    t = (x - p1[0]) / (p2[0] - p1[0])
    out = []
    for k in range(1, len(p1)):
        a, b, c, d = p0[k], p1[k], p2[k], p3[k]
        out.append(0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t ** 3))
    return tuple(out)


def se(v, p):
    return math.copysign(abs(v) ** (2.0 / p), v)


def ridge(p, freq, aniso=(1, 1, 1), seed=0.0, sharp=3.0):
    """Поле на гънките: остри ръбове, широки долини, средно ~0."""
    a = 1.0 - abs(nz(p, freq, aniso, seed))
    b = 1.0 - abs(nz(p, freq * 2.1, aniso, seed + 17.0))
    return (a ** sharp - 0.25) + 0.45 * (b ** sharp - 0.25)


def nz(p, freq, aniso=(1, 1, 1), seed=0.0):
    q = Vector((p[0] * freq * aniso[0] + seed, p[1] * freq * aniso[1] + seed * 0.7, p[2] * freq * aniso[2] - seed))
    return noise.noise(q)


# ---------------------------------------------------------------- сцена
bpy.ops.wm.read_factory_settings(use_empty=True)
addon_utils.enable("cycles", default_set=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.denoiser = "OPENIMAGEDENOISE"
scene.cycles.max_bounces = 8
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = 0.0
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

COLL = {}
for name in ("garment", "trims", "mannequin", "studio"):
    c = bpy.data.collections.new(name)
    scene.collection.children.link(c)
    COLL[name] = c


def link(obj, coll):
    COLL[coll].objects.link(obj)
    return obj


# ---------------------------------------------------------------- материали
def node_mat(name):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return m, nt, bsdf


# цветове — един меш, по една буква текстура във FiveM (a розово, b черно, c виолетово)
PALETTES = {
    "rose": {"fab": "#DDA3A5", "rib": "#E0A6A9", "teeth": "#C98C90", "cord": "#E8B2B4", "sheen": "#F6E4E4"},
    "black": {"fab": "#232125", "rib": "#29272B", "teeth": "#18171A", "cord": "#2D2B2F", "sheen": "#6F6B73"},
    "violet": {"fab": "#714FA0", "rib": "#7654A5", "teeth": "#5E418A", "cord": "#8062AD", "sheen": "#D8CBEA"},
}
CW = os.environ.get("RFS_COLORWAY", "rose")
PAL = PALETTES[CW]
GAME = os.environ.get("RFS_LOD") == "game"  # модел за играта: без гънки, модификатори и аксесоари


def fleece_mat(name, color, seam_u=None, rib_freq=None, seam_w=0.004, sheen=None):
    m, nt, b = node_mat(name)
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = 0.88
    b.inputs["Sheen Weight"].default_value = 0.55
    b.inputs["Sheen Roughness"].default_value = 0.45
    b.inputs["Sheen Tint"].default_value = lin(sheen or PAL["sheen"])
    b.inputs["Specular IOR Level"].default_value = 0.25
    L = nt.links
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nzt = nt.nodes.new("ShaderNodeTexNoise")
    nzt.inputs["Scale"].default_value = 900.0
    nzt.inputs["Detail"].default_value = 4.0
    L.new(tc.outputs["Object"], nzt.inputs["Vector"])
    height = nzt.outputs["Fac"]
    mul0 = nt.nodes.new("ShaderNodeMath")
    mul0.operation = "MULTIPLY"
    mul0.inputs[1].default_value = 0.25
    L.new(height, mul0.inputs[0])
    height = mul0.outputs[0]
    uv = nt.nodes.new("ShaderNodeUVMap")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    L.new(uv.outputs["UV"], sep.inputs["Vector"])
    if rib_freq:
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = rib_freq * 2 * math.pi
        L.new(sep.outputs["X"], mul.inputs[0])
        sn = nt.nodes.new("ShaderNodeMath")
        sn.operation = "SINE"
        L.new(mul.outputs[0], sn.inputs[0])
        add = nt.nodes.new("ShaderNodeMath")
        add.operation = "ADD"
        L.new(height, add.inputs[0])
        L.new(sn.outputs[0], add.inputs[1])
        height = add.outputs[0]
    if seam_u is not None:
        # улей на шева: -exp(-(d/w)^2), d = кръгово разстояние по U
        sub = nt.nodes.new("ShaderNodeMath")
        sub.operation = "SUBTRACT"
        sub.inputs[1].default_value = seam_u
        L.new(sep.outputs["X"], sub.inputs[0])
        fr = nt.nodes.new("ShaderNodeMath")
        fr.operation = "PINGPONG"
        fr.inputs[1].default_value = 0.5
        L.new(sub.outputs[0], fr.inputs[0])
        dv = nt.nodes.new("ShaderNodeMath")
        dv.operation = "DIVIDE"
        dv.inputs[1].default_value = seam_w
        L.new(fr.outputs[0], dv.inputs[0])
        sq = nt.nodes.new("ShaderNodeMath")
        sq.operation = "MULTIPLY"
        L.new(dv.outputs[0], sq.inputs[0])
        L.new(dv.outputs[0], sq.inputs[1])
        ng = nt.nodes.new("ShaderNodeMath")
        ng.operation = "MULTIPLY"
        ng.inputs[1].default_value = -1.0
        L.new(sq.outputs[0], ng.inputs[0])
        ex = nt.nodes.new("ShaderNodeMath")
        ex.operation = "EXPONENT"
        L.new(ng.outputs[0], ex.inputs[0])
        sc = nt.nodes.new("ShaderNodeMath")
        sc.operation = "MULTIPLY"
        sc.inputs[1].default_value = -3.0
        L.new(ex.outputs[0], sc.inputs[0])
        add2 = nt.nodes.new("ShaderNodeMath")
        add2.operation = "ADD"
        L.new(height, add2.inputs[0])
        L.new(sc.outputs[0], add2.inputs[1])
        height = add2.outputs[0]
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.45 if rib_freq else 0.35
    bump.inputs["Distance"].default_value = 0.0015
    L.new(height, bump.inputs["Height"])
    L.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def simple_mat(name, color, rough=0.5, metal=0.0, coat=0.0):
    m, nt, b = node_mat(name)
    b.inputs["Base Color"].default_value = lin(color)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    b.inputs["Coat Weight"].default_value = coat
    return m


FAB = PAL["fab"]
M_FLEECE = fleece_mat("Fleece", FAB)
M_SLEEVE = fleece_mat("Fleece sleeve (top seam)", FAB, seam_u=15 / 360)
M_HOOD = fleece_mat("Fleece hood (centre seam)", FAB, seam_u=0.25)
M_LEG = fleece_mat("Fleece leg (side seam)", FAB, seam_u=0.0)
M_RIB = fleece_mat("Rib knit", PAL["rib"], rib_freq=1.0)  # честотата на рипса идва от мащаба на UV на всеки обект
M_RIB_CUFF = fleece_mat("Rib knit cuff", PAL["rib"], rib_freq=1.0)
M_TEETH = simple_mat("Zip coil", PAL["teeth"], rough=0.45)
M_METAL = simple_mat("Polished silver", "#E2D8D3", rough=0.16, metal=1.0)
M_STONE = simple_mat("Crystal", "#ECE8E2", rough=0.04, metal=0.85)
M_CORD = fleece_mat("Drawcord", PAL["cord"])
M_CLAY = simple_mat("Mannequin clay", "#B9B2B6", rough=0.7)


# ---------------------------------------------------------------- помощни за меша
def game_resample(rings, name):
    """Гладки пръстени -> плътност за играта: ~2,2 cm между пръстените, 24-40 сегмента в обиколка."""
    N = len(rings[0])
    low = name.lower()
    tgt = 40 if ("waist" in low or "band" in low) else (32 if ("body" in low or "leg" in low) else 26)
    ng = min(N, tgt)
    js = [round(i * N / ng) % N for i in range(ng)]
    cents = [sum(r, Vector()) / N for r in rings]
    keep, acc = [0], 0.0
    for i in range(1, len(rings)):
        acc += (cents[i] - cents[i - 1]).length
        if acc >= 0.022 or i == len(rings) - 1:
            keep.append(i)
            acc = 0.0
    return [[rings[i][j] for j in js] for i in keep]


def rings_to_obj(name, rings, mat, coll="garment", thick=0.004, subsurf=2, u_scale=1.0, flip_check=None):
    """rings: списък от списъци Vector; тръба с UV на всеки ъгъл: u = j/N * u_scale, v = натрупана дължина."""
    if GAME:
        rings = game_resample(rings, name)
        thick, subsurf = 0, 0
    N = len(rings[0])
    M = len(rings)
    verts = [tuple(v) for r in rings for v in r]
    faces = []
    for i in range(M - 1):
        for j in range(N):
            faces.append((i * N + j, i * N + (j + 1) % N, (i + 1) * N + (j + 1) % N, (i + 1) * N + j))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    vacc = [0.0]
    for i in range(1, M):
        c0 = sum(rings[i - 1], Vector()) / N
        c1 = sum(rings[i], Vector()) / N
        vacc.append(vacc[-1] + (c1 - c0).length)
    uvl = me.uv_layers.new(name="UVMap")
    k = 0
    for i in range(M - 1):
        for j in range(N):
            for (ii, jj) in ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j)):
                uvl.data[k].uv = (jj / N * u_scale, vacc[ii])
                k += 1
    # нормалите навън: сравнява нормалата на лице с посоката от центъра на пръстена
    me.update()
    c0 = sum(rings[M // 2], Vector()) / N
    f = me.polygons[(M // 2) * N] if (M // 2) < M - 1 else me.polygons[0]
    outward = (f.center - (flip_check if flip_check is not None else c0))
    if f.normal.dot(outward) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    ob["ring_n"], ob["ring_m"] = N, M
    if thick:
        so = ob.modifiers.new("Thickness", "SOLIDIFY")
        so.thickness = thick
        so.offset = -1.0
        so.use_even_offset = True
    if subsurf:
        ss = ob.modifiers.new("Smooth", "SUBSURF")
        ss.levels = 1
        ss.render_levels = subsurf
    return ob


def ellipse_ring(N, c, ax_l, ax_f, a, b_f, b_b=None, p_out=2.0, p_in=2.0, mod=None):
    """phi=0 по ax_l (външна страна), +90 по ax_f (отпред). b_b: дълбочина на задната половина."""
    b_b = b_f if b_b is None else b_b
    pts = []
    for j in range(N):
        ph = 2 * math.pi * j / N
        cc, ss = math.cos(ph), math.sin(ph)
        pc = p_out if cc >= 0 else p_in
        x = se(cc, pc) * a
        y = se(ss, pc) * (b_f if ss >= 0 else b_b)
        m = mod(ph) if (mod and not GAME) else 1.0
        pts.append(c + (ax_l * x + ax_f * y) * m)
    return pts


def pleat(ph, amp, k, ph0=0.0):
    return 1.0 + amp * math.sin(k * ph + ph0)


FRONT = Vector((0, -1, 0))
XA = Vector((1, 0, 0))
ZA = Vector((0, 0, 1))

# ---------------------------------------------------------------- тяло на суитшърта
TORSO = [  # y, W, Df, Db  (единици от скиците)
    (173, 30, 21, 17), (176, 34, 22, 18), (179, 42, 24, 20), (183, 56, 27, 24), (188, 74, 32, 28),
    (193, 90, 36, 32), (198, 98, 40, 36), (205, 100, 44, 40), (220, 99, 50, 46), (240, 98, 54, 50),
    (262, 97, 56, 52), (280, 96, 57, 53), (300, 95, 57, 52), (316, 94, 55, 50), (324, 92, 53, 48),
    (329, 88, 50, 45), (334, 80, 44, 40),
]


LETTER_TEXT = "Minimon"
LETTER_W = 0.205   # ширина на думата, m
LETTER_ZC = 1.152  # височина на центъра на гърба, между върха на качулката и рибената лента


def torso_rings():
    rings = []
    ys = [173 + i * (334 - 173) / 70 for i in range(71)]
    for y in ys:
        W, Df, Db = cr(TORSO, y)
        z = Zs(y)
        gather = max(0.0, (y - 318) / 16)

        def mod(ph, y=y, z=z, W=W, gather=gather):
            p = (W * U * math.cos(ph), W * U * math.sin(ph), z)
            # кристалният надпис втвърдява средата на гърба (ред. B): по-малко гънки под него
            dph = (ph - 1.5 * math.pi + math.pi) % (2 * math.pi) - math.pi
            stiff = 1.0 - 0.8 * math.exp(-(dph / 0.62) ** 2) * math.exp(-((z - LETTER_ZC) / 0.045) ** 4)
            low = min(1.0, max(0.0, (y - 225) / 95))
            f = 0.022 * nz(p, 7.0, (1, 1, 2.2), 3.1) + 0.008 * nz(p, 22.0, (1, 1, 1.5), 8.0)
            f += 0.022 * low * math.sin(9 * ph + 0.6 + 1.4 * nz(p, 4.0)) * (0.55 + 0.45 * math.sin(3 * ph + 1.0))
            near = min(1.0, max(0.0, (y - 296) / 30))
            f += 0.05 * near * ridge(p, 9.0, (1.2, 1.2, 4.0), 31.0)
            f += 0.018 * ridge(p, 6.0, (1, 1, 1.6), 41.0)
            m = 1.0 + f * stiff
            if gather > 0:
                m *= pleat(ph, 0.05 * gather, 28)
            return m

        rings.append(ellipse_ring(72, Vector((0, 0, z)), XA, FRONT, W * U, Df * U, Db * U, p_out=2.3, p_in=2.3, mod=mod))
    return rings


body = rings_to_obj("Hoodie body", torso_rings(), M_FLEECE)
band = rings_to_obj(
    "Hoodie hem band",
    [ellipse_ring(96, Vector((0, 0, Zs(y))), XA, FRONT, (85 + (y - 331) / 29 * 2) * U, 48 * U, 44 * U, 2.3, 2.3)
     for y in [331 + i * 29 / 8 for i in range(9)]],
    M_RIB, thick=0.006, u_scale=260.0)

# яка / фуния (долната част на качулката) около врата
collar_rings = []
for i in range(9):
    z = 1.402 + i * 0.0085
    s = i / 8
    collar_rings.append(ellipse_ring(64, Vector((0, 0.004, z)), XA, FRONT, 0.066 + 0.01 * s, 0.062 + 0.008 * s, 0.06 + 0.01 * s,
                                     mod=lambda ph, z=z: 1.0 + 0.02 * nz((math.cos(ph) * 0.07, math.sin(ph) * 0.07, z), 30.0)))
collar = rings_to_obj("Hood front edges (funnel)", collar_rings, M_FLEECE, thick=0.005)


# ---------------------------------------------------------------- ръкави
T = [0, .08, .18, .30, .45, .60, .75, .88, .96, 1]
YT = [200, 220, 248, 282, 325, 370, 410, 440, 456, 462]
SF = {"x": [100, 92, 84, 76, 68, 62, 58, 57, 58, 59], "hw": [2, 14, 24, 30, 34, 36, 35, 30, 22, 15]}
SS = {"x": [203, 203, 203, 203, 203, 202, 201, 200, 199, 199], "hw": [26, 33, 36, 37, 38, 39, 38, 33, 24, 15]}
SPT = [(T[i], SF["x"][i], SF["hw"][i], SS["x"][i], SS["hw"][i], YT[i]) for i in range(len(T))]


def sleeve_frame(t, side):
    """side=-1 дясно на носещия (-X), +1 ляво. Връща център, външна ос, предна ос, a, b, допирателна."""
    def cen(tt):
        fx, fhw, sx, shw, y = cr(SPT, tt)
        return Vector((side * abs(Xs(fx)), Ys(sx) + 0.002, Zs(y))), fhw * U, shw * U

    c, a, b = cen(t)
    c2, _, _ = cen(min(1.0, t + 0.01))
    c1, _, _ = cen(max(0.0, t - 0.01))
    tan = (c2 - c1).normalized()
    f = (FRONT - tan * FRONT.dot(tan)).normalized()
    lat = f.cross(tan).normalized() * side
    if lat.x * side < 0:
        lat = -lat
    return c, lat, f, a, b, tan


SEAM_TH = math.radians(15)


def sleeve_rings(side):
    rings = []
    ts = [i / 80 for i in range(81)]
    for t in ts:
        c, lat, f, a, b, tan = sleeve_frame(t, side)
        if t < 0.06:  # капачката на ръкава влиза в смъкнатото рамо
            k = t / 0.06
            c = c + Vector((-side * 0.016 * (1 - k), 0, -0.004 * (1 - k)))
            a = max(a, 0.012)
        gather = max(0.0, (t - 0.8) / 0.2)

        def mod(ph, t=t, c=c, gather=gather, side=side):
            sd = 11.0 + 7.0 * (side > 0)
            p = (c.x + math.cos(ph) * 0.04, math.sin(ph) * 0.04, c.z)
            m = 1.0 + 0.045 * nz(p, 6.0, (1.0, 1.0, 3.0), sd) + 0.014 * nz(p, 20.0, (1, 1, 2), sd + 3)
            elbow = math.exp(-((t - 0.55) / 0.16) ** 2) + 0.8 * math.exp(-((t - 0.86) / 0.07) ** 2)
            m += 0.11 * elbow * ridge(p, 7.0, (1.0, 1.0, 3.4), sd + 50.0)
            m += 0.035 * ridge(p, 5.0, (1, 1, 2.0), sd + 60.0)
            m += 0.022 * math.sin(5 * ph + 1.7 * t + sd) * (0.3 + 0.7 * t)
            if math.cos(ph) < 0:  # вътрешната страна виси по-плоско до тялото
                m *= 1.0 - 0.07 * (-math.cos(ph)) ** 2 * min(1.0, t * 3)
            if gather > 0:
                m *= pleat(ph, 0.11 * gather, 15, 0.7 + sd)
            return m

        rings.append(ellipse_ring(80, c, lat, f, a, b, b, mod=mod))
    return rings


sleeve_r = rings_to_obj("Sleeve wearer right", sleeve_rings(-1), M_SLEEVE)
sleeve_l = rings_to_obj("Sleeve wearer left", sleeve_rings(+1), M_SLEEVE)


def cuff_rings(side):
    c, lat, f, a, b, tan = sleeve_frame(1.0, side)
    rings = []
    for i in range(9):
        s = i / 8
        cc = c + tan * (-0.004 + 0.08 * s)
        rings.append(ellipse_ring(80, cc, lat, f, 0.0305 - 0.0015 * s, 0.032 - 0.0015 * s))
    return rings, c + tan * 0.076, tan, lat, f


cr_r, wrist_r, tan_r, lat_r, f_r = cuff_rings(-1)
cr_l, wrist_l, tan_l, lat_l, f_l = cuff_rings(+1)
cuff_r = rings_to_obj("Cuff wearer right", cr_r, M_RIB_CUFF, thick=0.006, u_scale=95.0)
cuff_l = rings_to_obj("Cuff wearer left", cr_l, M_RIB_CUFF, thick=0.006, u_scale=95.0)

# ---------------------------------------------------------------- качулка (свалена, виси на гърба)
HOOD = [  # z, център Y, половин ширина, половин дебелина
    (1.488, 0.046, 0.086, 0.040), (1.458, 0.076, 0.112, 0.050), (1.418, 0.100, 0.121, 0.045),
    (1.372, 0.112, 0.120, 0.034), (1.322, 0.114, 0.110, 0.025), (1.274, 0.112, 0.088, 0.019),
    (1.234, 0.108, 0.058, 0.013), (1.200, 0.103, 0.020, 0.006),
]


def hood_rings():
    rings = []
    zs = [HOOD[0][0] - i * (HOOD[0][0] - HOOD[-1][0]) / 30 for i in range(31)]
    tab = [(-r[0],) + r[1:] for r in HOOD]
    for z in zs:
        yc, hw, ht = cr(tab, -z)
        yc2, _, _ = cr(tab, -(z - 0.01))
        tan = Vector((0, yc2 - yc, -0.01)).normalized()
        out = XA.cross(tan).normalized()
        if out.y < 0:
            out = -out
        c = Vector((0, yc, z))

        def mod(ph, z=z):
            return 1.0 + 0.06 * nz((math.cos(ph) * 0.1, 0, z), 9.0, (1, 1, 2), 5.0)

        # phi=0 -> ръбът към +X, +90 -> външната страна (откъм гърба навън)
        rings.append(ellipse_ring(72, c, XA, out, hw, ht, ht, p_out=2.0, p_in=2.0, mod=mod))
    return rings


hood = rings_to_obj("Hood", hood_rings(), M_HOOD, thick=0.004, flip_check=Vector((0, 0.10, 1.36)))

# ---------------------------------------------------------------- панталон
OUTER = [(378, 118), (410, 113), (450, 110.5), (500, 111), (580, 112.5), (660, 116), (730, 120), (775, 123),
         (800, 123.6), (816, 122), (830, 125), (838, 132), (842, 140)]
INNER = [(378, 200), (440, 200), (470, 199.6), (480, 198), (560, 194.5), (650, 190.5), (730, 188), (780, 188.2),
         (806, 190.5), (818, 194), (830, 193), (838, 189), (842, 184)]
SFRONT = [(378, 158), (410, 153.5), (445, 150.5), (480, 150), (560, 151.5), (640, 155), (700, 158), (760, 161),
          (800, 162.5), (816, 160), (830, 163), (840, 168), (844, 174)]
SBACK = [(378, 254), (402, 259), (420, 262), (446, 261), (474, 257), (500, 250), (530, 245), (580, 242.5),
         (640, 240), (720, 238), (780, 234), (806, 232), (822, 229), (834, 222), (844, 212)]


def leg_rings(side):
    rings = []
    ys = [378 + i * (842 - 378) / 150 for i in range(151)]
    for y in ys:
        xo = cr(OUTER, y)[0]
        xi = cr(INNER, y)[0]
        yf = Ys(cr(SFRONT, y)[0])
        yb = Ys(cr(SBACK, y)[0])
        Xo, Xi = abs(Xs(xo)), abs(Xs(xi))
        a = (Xo - Xi) / 2 * (1.0 if y < 470 else 1.06)
        cx = side * (Xo + Xi) / 2
        cy = (yf + yb) / 2
        p_in = 7.0 if y <= 452 else (2.0 if y >= 492 else 7.0 - 5.0 * (y - 452) / 40)
        gather = max(0.0, (y - 806) / 36)

        def mod(ph, y=y, cx=cx, gather=gather):
            sd = 21.0 + 5 * (cx > 0)
            p = (cx + math.cos(ph) * 0.05, math.sin(ph) * 0.05, Zs(y))
            leg = min(1.0, max(0.0, (y - 470) / 60))
            m = 1.0 + leg * (0.035 * nz(p, 6.5, (1, 1, 2.6), sd) + 0.012 * nz(p, 19.0, (1, 1, 2), sd + 2))
            stack = max(0.0, (y - 712) / 130) ** 1.3
            m += 0.14 * stack * ridge(p, 8.0, (1.0, 1.0, 4.2), sd + 70.0)
            knee = math.exp(-((y - 640) / 30) ** 2)
            m += 0.05 * knee * ridge(p, 8.0, (1.0, 1.0, 3.0), sd + 80.0) * max(0.0, math.sin(ph))
            m += 0.03 * leg * ridge(p, 4.5, (1.4, 1.4, 1.0), sd + 90.0)
            m += 0.02 * leg * math.sin(5 * ph + y * 0.012 + sd) * (1 - stack)
            if gather > 0:
                m *= pleat(ph, 0.08 * gather, 13, 0.3)
            return m

        lat = XA * side
        rings.append(ellipse_ring(88, Vector((cx, cy, Zs(y))), lat, FRONT, a, cy - yf, yb - cy, p_out=2.1, p_in=p_in, mod=mod))
    return rings


leg_r = rings_to_obj("Trouser leg wearer right", leg_rings(-1), M_LEG)
leg_l = rings_to_obj("Trouser leg wearer left", leg_rings(+1), M_LEG)
waist = rings_to_obj(
    "Elastic waistband",
    [ellipse_ring(120, Vector((0, 0.004, Zs(y))), XA, FRONT, 0.165, 0.094, 0.098, 2.2, 2.2, mod=lambda ph: pleat(ph, 0.012, 52))
     for y in [356 + i * 23 / 6 for i in range(7)]],
    M_FLEECE, thick=0.006)


def cinch_rings(side):
    rings = []
    for i in range(7):
        s = i / 6
        z = Zs(841 + 13 * s)
        rings.append(ellipse_ring(88, Vector((side * 0.068, -0.024, z)), XA * side, FRONT, 0.041 + 0.004 * s, 0.032 + 0.003 * s,
                                  mod=lambda ph, s=s: pleat(ph, 0.09 + 0.05 * s, 17, 0.3)))
    return rings


cinch_r = rings_to_obj("Ankle channel wearer right", cinch_rings(-1), M_FLEECE, thick=0.005)
cinch_l = rings_to_obj("Ankle channel wearer left", cinch_rings(+1), M_FLEECE, thick=0.005)


def cord(name, pts, radius=0.0015):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1.0)
    sp.use_endpoint_u = True
    sp.order_u = 3
    cu.materials.append(M_CORD)
    return link(bpy.data.objects.new(name, cu), "trims")


for side, nm in ((-1, "right"), (1, "left")):
    x0 = side * (0.068 + 0.044)
    z0 = Zs(848)
    cord(f"Drawcord {nm} A", [(x0, -0.026, z0), (x0 + side * 0.006, -0.03, z0 - 0.03), (x0 + side * 0.004, -0.034, z0 - 0.07)])
    cord(f"Drawcord {nm} B", [(x0, -0.018, z0), (x0 + side * 0.009, -0.016, z0 - 0.035), (x0 + side * 0.012, -0.02, z0 - 0.078)])

# ---------------------------------------------------------------- манекен (само за кадъра, не е дреха)


def ellipsoid(name, loc, scale, rot=None, coll="mannequin", mat=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(mat or M_CLAY)
    ob = link(bpy.data.objects.new(name, me), coll)
    ob.location = loc
    ob.scale = scale
    if rot is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = rot
    return ob


ellipsoid("Head", (0, -0.006, 1.605), (0.074, 0.088, 0.106))
neck = ellipsoid("Neck", (0, 0.004, 1.47), (0.05, 0.052, 0.09))
for wrist, tan, nm in ((wrist_r, tan_r, "right"), (wrist_l, tan_l, "left")):
    q = Vector((0, 0, -1)).rotation_difference(tan)
    ellipsoid(f"Hand {nm}", wrist + tan * 0.062, (0.026, 0.044, 0.078), rot=q)
for side, nm in ((-1, "right"), (1, "left")):
    ellipsoid(f"Foot {nm}", (side * 0.07, -0.045, 0.03), (0.042, 0.112, 0.03))
    ellipsoid(f"Ankle {nm}", (side * 0.068, -0.012, 0.09), (0.03, 0.032, 0.06))

# ---------------------------------------------------------------- изчислена геометрия
dg = bpy.context.evaluated_depsgraph_get()


def bvh(ob):
    d = bpy.context.evaluated_depsgraph_get()
    d.update()
    return BVHTree.FromObject(ob, d)


# ---------------------------------------------------------------- задни джобове


def pocket(side):
    """side -1: дясно на носещия. Вътрешен ръб 0,028 от средата, ширина 0,12, страни 0,142, връх 0,165."""
    nu, nv = (6, 8) if GAME else (18, 24)
    w, hs, ht = 0.12, 0.142, 0.165
    top = Zs(388)
    legs = [leg_r if side < 0 else leg_l]
    trees = [bvh(o) for o in legs]
    verts, faces = [], []
    for j in range(nv + 1):
        v = j / nv
        for i in range(nu + 1):
            u = i / nu
            h = hs + (ht - hs) * (1 - abs(2 * u - 1))
            x = side * (0.028 + u * w)
            z = top - v * h
            best = None
            for tr in trees:
                hit = tr.ray_cast(Vector((x, 0.5, z)), Vector((0, -1, 0)))
                if hit[0] is not None and (best is None or hit[3] < best[3]):
                    best = hit
            loc, nrm = best[0], best[1]
            off = 0.0022 + (0.0014 if v * h < 0.022 else 0.0)
            verts.append(tuple(loc + nrm * off))
    for j in range(nv):
        for i in range(nu):
            a = j * (nu + 1) + i
            faces.append((a, a + 1, a + nu + 2, a + nu + 1))
    me = bpy.data.meshes.new(f"Back pocket {'right' if side < 0 else 'left'}")
    me.from_pydata(verts, [], faces)
    me.update()
    if me.polygons[0].normal.y < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        bm.to_mesh(me)
        bm.free()
    me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
    me.materials.append(M_FLEECE)
    ob = link(bpy.data.objects.new(me.name, me), "garment")
    ob["grid"] = (nu + 1, nv + 1)
    if GAME:
        return ob, (w, hs, ht, top)
    so = ob.modifiers.new("Thickness", "SOLIDIFY")
    so.thickness = 0.0022
    so.offset = 1.0
    bv = ob.modifiers.new("Turned edge", "BEVEL")
    bv.width = 0.0012
    bv.segments = 2
    ss = ob.modifiers.new("Smooth", "SUBSURF")
    ss.levels = 1
    ss.render_levels = 1
    return ob, (w, hs, ht, top)


pocket_r, PK = pocket(-1)
pocket_l, _ = pocket(+1)

if GAME:
    for ob in list(COLL["mannequin"].objects) + list(COLL["trims"].objects):
        bpy.data.objects.remove(ob)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "fleece_game_lowpoly.blend"))
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in COLL["garment"].objects)
    print(f"GAME saved, {len(COLL['garment'].objects)} pieces, {tris} tris (single-sided)", flush=True)
    sys.exit(0)

# ---------------------------------------------------------------- кристални слотове (логото НЕ е моделирано)
RS = [[0.12, 60, -12], [0.28, 115, 18], [0.42, 35, -25], [0.55, 145, 8], [0.7, 80, 22], [0.84, 20, -10], [0.3, -70, 10],
      [0.46, -130, -18], [0.6, -35, 25], [0.76, -100, -8], [0.9, -150, 15]]
LS = [[0.16, 25, 15], [0.33, 100, -20], [0.48, 160, 10], [0.62, 55, -14], [0.8, 120, 20], [0.92, 70, -6], [0.24, -95, -12],
      [0.4, -30, 18], [0.54, -125, -22], [0.7, -60, 12], [0.86, -15, -16]]
BP = [[0.45, 0.28, -18], [0.85, 0.42, 4], [0.68, 0.72, -10]]

bm_ico = bmesh.new()
bmesh.ops.create_icosphere(bm_ico, subdivisions=1, radius=1.0)
ICO_V = [v.co.copy() for v in bm_ico.verts]
ICO_F = [[v.index for v in f.verts] for f in bm_ico.faces]
bm_ico.free()


def outline_pts(w=0.023, h=0.027, r=0.0068, step=0.0026):
    pts = []
    segs = [((-w / 2 + r, -h / 2), (w / 2 - r, -h / 2)), ((w / 2, -h / 2 + r), (w / 2, h / 2 - r)),
            ((w / 2 - r, h / 2), (-w / 2 + r, h / 2)), ((-w / 2, h / 2 - r), (-w / 2, -h / 2 + r))]
    arcs = [((w / 2 - r, -h / 2 + r), -90), ((w / 2 - r, h / 2 - r), 0), ((-w / 2 + r, h / 2 - r), 90), ((-w / 2 + r, -h / 2 + r), 180)]
    for (p0, p1), (ac, a0) in zip(segs, arcs):
        L = math.dist(p0, p1)
        n = max(1, round(L / step))
        for i in range(n):
            pts.append((p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n))
        na = max(2, round((math.pi / 2 * r) / step))
        for i in range(na):
            a = math.radians(a0 + 90 * i / na)
            pts.append((ac[0] + r * math.cos(a), ac[1] + r * math.sin(a)))
    return pts


STONES_V, STONES_F = [], []


def add_stone(loc, nrm, rad=0.00115, V=None, F=None):
    V = STONES_V if V is None else V
    F = STONES_F if F is None else F
    q = Vector((0, 0, 1)).rotation_difference(nrm)
    mat = Matrix.Translation(loc + nrm * rad * 0.35) @ q.to_matrix().to_4x4() @ Matrix.Diagonal((rad, rad, rad * 0.55, 1))
    base = len(V)
    V.extend([tuple(mat @ v) for v in ICO_V])
    F.extend([[base + i for i in f] for f in ICO_F])


def place_slot(tree, centre, nrm, ax_u, ax_v, tilt_deg):
    tr = math.radians(tilt_deg)
    for (px, py) in outline_pts():
        rx = px * math.cos(tr) - py * math.sin(tr)
        ry = px * math.sin(tr) + py * math.cos(tr)
        q = centre + ax_u * rx + ax_v * ry + nrm * 0.01
        hit = tree.ray_cast(q, -nrm, 0.05)
        if hit[0] is None:
            loc, n2, _, _ = tree.find_nearest(q)
        else:
            loc, n2 = hit[0], hit[1]
        if n2.dot(nrm) < 0:
            n2 = -n2
        add_stone(loc, n2)


for data, side, ob in ((RS, -1, sleeve_r), (LS, +1, sleeve_l)):
    tree = bvh(ob)
    for t, th, tilt in data:
        c, lat, f, a, b, tan = sleeve_frame(t, side)
        ph = math.radians(th)
        p = c + lat * math.cos(ph) * a + f * math.sin(ph) * b
        n = (lat * (math.cos(ph) / a) + f * (math.sin(ph) / b)).normalized()
        hit = tree.ray_cast(p + n * 0.06, -n, 0.2)
        centre = hit[0] if hit[0] is not None else p
        nrm = hit[1] if hit[0] is not None else n
        if nrm.dot(n) < 0:
            nrm = -nrm
        ax_v = (tan - nrm * tan.dot(nrm)).normalized()
        ax_u = nrm.cross(ax_v).normalized()
        place_slot(tree, centre, nrm, ax_u, -ax_v, tilt)

ptree = bvh(pocket_r)
w, hs, ht, top = PK
for u, v, tilt in BP:
    h = hs + (ht - hs) * (1 - abs(2 * u - 1))
    q = Vector((-(0.028 + u * w), 0.5, top - v * h))
    hit = ptree.ray_cast(q, Vector((0, -1, 0)))
    nrm = hit[1] if hit[1].y > 0 else -hit[1]
    ax_u = Vector((1, 0, 0)) - nrm * nrm.x
    ax_u.normalize()
    ax_v = nrm.cross(ax_u).normalized()
    if ax_v.z < 0:
        ax_v = -ax_v
    place_slot(ptree, hit[0], nrm, ax_u, ax_v, -tilt)

# ---------------------------------------------------------------- надпис на гърба (ред. B, по искане на собственика)
from mathutils.kdtree import KDTree  # noqa: E402

RED_V, RED_F = [], []
LETTER_STONE = 0.0012
LETTER_STEP = 0.0027


def text_shape():
    cu = bpy.data.curves.new("tmp lettering", "FONT")
    cu.body = LETTER_TEXT
    cu.font = bpy.data.fonts.load(os.environ["RFS_FONT"])
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.size = 1.0
    cu.fill_mode = "BOTH"
    cu.resolution_u = 24
    ob = bpy.data.objects.new("tmp lettering", cu)
    scene.collection.objects.link(ob)
    d = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(d)
    me_ = ev.to_mesh()
    verts = [Vector((v.co.x, v.co.y, 0.0)) for v in me_.vertices]
    polys = [list(p_.vertices) for p_ in me_.polygons]
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return verts, polys


def boundary_segments(verts, polys):
    cnt = {}
    for poly in polys:
        for i in range(len(poly)):
            e = tuple(sorted((poly[i], poly[(i + 1) % len(poly)])))
            cnt[e] = cnt.get(e, 0) + 1
    return [(verts[a], verts[b]) for (a, b), c in cnt.items() if c == 1]


def stone_layout(inside, segs, step, bbox):
    pts = []
    for a, b in segs:
        n = max(1, int((b - a).length / step))
        for i in range(n):
            pts.append(a.lerp(b, i / n))
    kd = KDTree(len(pts))
    keep = []
    for p_ in pts:
        if all((p_ - q).length > step * 0.85 for q in keep[-40:]):
            keep.append(p_)
    kd = KDTree(len(keep))
    for i, p_ in enumerate(keep):
        kd.insert(p_, i)
    kd.balance()
    (x0, y0), (x1, y1) = bbox
    sp = step * 1.02
    row = 0
    y = y0 + sp * 0.5
    out = list(keep)
    while y < y1:
        x = x0 + (sp * 0.5 if row % 2 else 0.0)
        while x < x1:
            q = Vector((x, y, 0.0))
            if inside(q) and kd.find(q)[2] > step * 0.82:
                out.append(q)
            x += sp
        y += sp * 0.866
        row += 1
    return out


def heart_poly(h):
    pts = []
    for i in range(96):
        t = 2 * math.pi * i / 96
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append(Vector((x, y, 0.0)) * (h / 29.0))
    return pts


def in_poly(poly, q):
    c = False
    for i in range(len(poly)):
        a, b = poly[i], poly[i - 1]
        if (a.y > q.y) != (b.y > q.y) and q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x:
            c = not c
    return c


tv, tp = text_shape()
xs_ = [v.x for v in tv]
ys_ = [v.y for v in tv]
sc_ = LETTER_W / (max(xs_) - min(xs_))
tcx, tcy = (max(xs_) + min(xs_)) / 2, (max(ys_) + min(ys_)) / 2
tv = [Vector(((v.x - tcx) * sc_, (v.y - tcy) * sc_, 0.0)) for v in tv]
TEXT_H = (max(ys_) - min(ys_)) * sc_
HEART_H = TEXT_H * 0.74
gap = 0.0045
total = LETTER_W + gap + HEART_H * 1.1
shift = -total / 2 + LETTER_W / 2
tv = [v + Vector((shift, 0, 0)) for v in tv]
hp = [v + Vector((shift + LETTER_W / 2 + gap + HEART_H * 0.55, TEXT_H * 0.06, 0)) for v in heart_poly(HEART_H)]
ttree = BVHTree.FromPolygons([tuple(v) for v in tv], tp)


def in_text(q):
    return ttree.ray_cast(Vector((q.x, q.y, 1.0)), Vector((0, 0, -1)))[0] is not None


txs = [v.x for v in tv]
tys = [v.y for v in tv]
text_pts = stone_layout(in_text, boundary_segments(tv, tp), LETTER_STEP, ((min(txs), min(tys)), (max(txs), max(tys))))
hxs = [v.x for v in hp]
hys = [v.y for v in hp]
heart_pts = stone_layout(lambda q: in_poly(hp, q), [(hp[i - 1], hp[i]) for i in range(len(hp))], LETTER_STEP,
                         ((min(hxs), min(hys)), (max(hxs), max(hys))))
btree = bvh(body)
for pts_, V_, F_ in ((text_pts, STONES_V, STONES_F), (heart_pts, RED_V, RED_F)):
    for q in pts_:
        X = -q.x  # погледнат отзад, текстът се чете отляво надясно към -X
        hit = btree.ray_cast(Vector((X, 0.6, LETTER_ZC + q.y)), Vector((0, -1, 0)))
        if hit[0] is None:
            continue
        n_ = hit[1] if hit[1].y > 0 else -hit[1]
        add_stone(hit[0], n_, LETTER_STONE, V_, F_)
print(f"LETTERING {len(text_pts)} silver + {len(heart_pts)} red stones, text {LETTER_W*100:.1f} x {TEXT_H*100:.1f} cm, heart {HEART_H*100:.1f} cm", flush=True)
M_RUBY = simple_mat("Crystal red", "#C2142F", rough=0.05, metal=0.7)
me = bpy.data.meshes.new("Heart crystals")
me.from_pydata(RED_V, [], RED_F)
me.materials.append(M_RUBY)
link(bpy.data.objects.new("Back lettering heart (red crystals)", me), "trims")

me = bpy.data.meshes.new("Crystal slots")
me.from_pydata(STONES_V, [], STONES_F)
me.materials.append(M_STONE)
link(bpy.data.objects.new("Crystals: sleeve + pocket slots, back lettering", me), "trims")

# ---------------------------------------------------------------- цип
zip_targets = [body, band, collar]
trees = [bvh(o) for o in zip_targets]
zpath = []
z = Zs(359.5)
while z <= 1.468:
    best = None
    for tr in trees:
        hit = tr.ray_cast(Vector((0, -0.5, z)), Vector((0, 1, 0)))
        if hit[0] is not None and (best is None or hit[3] < best[3]):
            best = hit
    if best:
        zpath.append((best[0], best[1] if best[1].y < 0 else -best[1]))
    z += 0.0024

tape_v, tape_f, teeth_v, teeth_f = [], [], [], []
for i, (p, n) in enumerate(zpath):
    q = p + n * 0.0012
    tape_v += [tuple(q + XA * -0.0045), tuple(q + XA * 0.0045)]
    if i:
        k = 2 * i
        tape_f.append((k - 2, k - 1, k + 1, k))
    # зъб на спиралата: малко блокче, редуват се страните
    cx = 0.0011 * (1 if i % 2 else -1)
    c = q + n * 0.0008 + XA * cx
    up = ZA - n * n.z
    up.normalize()
    sx, sy, sz = 0.0022, 0.0009, 0.0008
    base = len(teeth_v)
    for dx in (-sx, sx):
        for dy in (-sy, sy):
            for dz in (-sz, sz):
                teeth_v.append(tuple(c + XA * dx + up * dy + n * dz))
    teeth_f += [[base + a for a in f] for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3))]
me = bpy.data.meshes.new("Zip tape")
me.from_pydata(tape_v, [], tape_f)
me.materials.append(M_FLEECE)
link(bpy.data.objects.new("Zip tape", me), "trims")
me = bpy.data.meshes.new("Zip coil")
me.from_pydata(teeth_v, [], teeth_f)
me.materials.append(M_TEETH)
link(bpy.data.objects.new("Zip coil", me), "trims")


def rounded_box(name, loc, dims, rot_q=None, bevel=0.0015, mat=M_METAL):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(dims), verts=bm.verts)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = link(bpy.data.objects.new(name, me), "trims")
    ob.location = loc
    if rot_q is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = rot_q
    bv = ob.modifiers.new("Round", "BEVEL")
    bv.width = bevel
    bv.segments = 4
    bv.affect = "EDGES"
    ob.modifiers.new("Smooth", "SUBSURF").levels = 1
    return ob


# плъзгач при горния край на ципа, дръжка + халка + празна висулка
pt, nt_ = zpath[-6]
qn = Vector((0, -1, 0)).rotation_difference(nt_)
rounded_box("Zip slider", pt + nt_ * 0.0035, (0.010, 0.006, 0.016), qn)
rounded_box("Zip bottom stop", zpath[1][0] + zpath[1][1] * 0.003, (0.011, 0.005, 0.007), bevel=0.001)
ring_c = pt + nt_ * 0.006 - ZA * 0.014
bpy.ops.mesh.primitive_torus_add(major_radius=0.0042, minor_radius=0.0009, location=ring_c, rotation=(math.pi / 2, 0, 0))
ring = bpy.context.active_object
ring.name = "Puller ring"
for c in ring.users_collection:
    c.objects.unlink(ring)
link(ring, "trims")
ring.data.materials.append(M_METAL)
# празна висулка: заоблена капка, 2,5 cm (само слот за лицензиран арт)
cu = bpy.data.curves.new("Charm (blank slot)", "CURVE")
cu.dimensions = "2D"
cu.extrude = 0.0012
cu.fill_mode = "BOTH"
cu.bevel_depth = 0.0006
spl = cu.splines.new("BEZIER")
shape = [(0, 0.0), (0.0105, -0.007), (0.010, -0.017), (0.0, -0.025), (-0.010, -0.017), (-0.0105, -0.007)]
spl.bezier_points.add(len(shape) - 1)
for bp_, (x, y) in zip(spl.bezier_points, shape):
    bp_.co = (x, y, 0)
    bp_.handle_left_type = bp_.handle_right_type = "AUTO"
spl.use_cyclic_u = True
cu.materials.append(M_METAL)
charm = link(bpy.data.objects.new("Charm (blank slot)", cu), "trims")
charm.location = ring_c - ZA * 0.004 + nt_ * 0.002
charm.rotation_euler = (math.pi / 2, 0, 0)

# ---------------------------------------------------------------- студио
floor_me = bpy.data.meshes.new("Floor")
floor_me.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
floor = link(bpy.data.objects.new("Floor (shadow catcher)", floor_me), "studio")
floor.is_shadow_catcher = True

world = bpy.data.worlds.new("Studio")
scene.world = world
if world.node_tree is None:
    world.use_nodes = True
bg = world.node_tree.nodes.get("Background")
bg.inputs["Color"].default_value = lin("#F1E8E6")
bg.inputs["Strength"].default_value = 0.4 * float(os.environ.get("RFS_LIGHT", "0.2"))

rig = link(bpy.data.objects.new("Light + camera rig", None), "studio")
LIGHT_SCALE = float(os.environ.get("RFS_LIGHT", "0.2"))


def area(name, loc, size, energy, color="#FFF6F2"):
    ld = bpy.data.lights.new(name, "AREA")
    ld.shape = "DISK"
    ld.size = size
    ld.energy = energy * LIGHT_SCALE
    ld.color = lin(color)[:3]
    ob = link(bpy.data.objects.new(name, ld), "studio")
    ob.location = loc
    d = Vector((0, 0, 0.95)) - Vector(loc)
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    ob.parent = rig
    return ob


area("Key", (-2.3, -2.9, 2.7), 2.4, 650)
area("Fill", (2.6, -2.2, 1.3), 3.0, 260, "#F4F2FF")
area("Rim", (0.4, 3.0, 2.6), 2.0, 420)
area("Top", (0, -0.4, 4.0), 3.0, 150)

camd = bpy.data.cameras.new("Camera")
camd.lens = 70
camd.sensor_fit = "AUTO"
cam = link(bpy.data.objects.new("Camera", camd), "studio")
scene.camera = cam


def aim(ob, loc, target):
    ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()


VIEWS = {
    "front": 0, "back": 180, "left": 90, "right": -90,
}


def render(name, res, cam_loc, target, lens, rig_deg):
    rig.rotation_euler = (0, 0, math.radians(rig_deg))
    a = math.radians(rig_deg)
    rl = Vector((cam_loc[0] * math.cos(a) - cam_loc[1] * math.sin(a), cam_loc[0] * math.sin(a) + cam_loc[1] * math.cos(a), cam_loc[2]))
    camd.lens = lens
    aim(cam, rl, target)
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = args.scale
    scene.render.filepath = os.path.join(OUT, f"{name}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"RENDERED {name} {time.time() - t0:.1f}s", flush=True)


def surf(ob, origin, direction):
    tr = bvh(ob)
    hit = tr.ray_cast(Vector(origin), Vector(direction).normalized())
    return hit[0]


wanted = None if args.renders == "all" else set(args.renders.split(","))


def want(n):
    return args.renders != "none" and (wanted is None or n in wanted)


bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "rose_fleece_set.blend" if CW == "rose" else f"fleece_set_{CW}.blend"))
print("SAVED blend", flush=True)

for nm, deg in VIEWS.items():
    if want(nm):
        render(nm, (1000, 1600), (0, -4.1, 0.9), (0, 0, 0.88), 70, deg)

if want("hero"):
    render("hero", (1200, 1600), (0, -3.6, 1.05), (0, 0, 0.9), 70, -32)
if want("lettering"):
    render("lettering", (1500, 1000), (0.0, -0.74, 1.17), (0, 0.1, 1.15), 85, 180)
if want("zip"):
    render("zip", (1100, 1100), (0.05, -0.62, 1.38), (0, -0.07, 1.39), 85, 0)
if want("sleeve"):
    c, lat, f, a, b, tan = sleeve_frame(0.5, -1)
    dirn = (lat * 0.55 + f).normalized()
    render("sleeve", (1100, 1100), tuple(c + dirn * 0.75 + ZA * 0.03), tuple(c), 85, 0)
if want("cuff"):
    c = wrist_l - tan_l * 0.05
    render("cuff", (1100, 1100), tuple(c + Vector((0.18, -0.55, 0.06))), tuple(c), 85, 0)
if want("ankle"):
    c = Vector((-0.07, -0.02, 0.09))
    render("ankle", (1100, 1100), tuple(c + Vector((-0.28, -0.52, 0.08))), tuple(c), 85, 0)
if want("pocket"):
    tgt = Vector((-0.09, 0.12, Zs(425)))
    render("pocket", (1100, 1100), (0.08, -0.72, Zs(420)), tuple(tgt), 85, 180)
print("DONE", flush=True)
