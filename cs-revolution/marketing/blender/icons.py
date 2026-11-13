"""icons.py — 13-те икони на услугите на carbonstealth.eu, фотореалистично.

Всяка икона е малък физически предмет, сниман в продуктово студио: плочка от черен анодиран алуминий
с диамантена фаска, в нея — карбон под лак, върху него — символът от шлайфан и полиран метал, стъкло
и един светещ циан елемент („един сигнал на уред“). Прозрачен фон, с мека сянка в алфа канала.

Пускане:  blender -b -P icons.py -- --out DIR [--only web,seo] [--res 640] [--samples 256]
"""
import argparse
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (bpy преди bmesh/mathutils)
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cslib as L  # noqa: E402

TILE, R_OUT, H = 4.0, 0.62, 0.40  # 40 mm плочка
INSET, DEPTH = 0.20, 0.05
Z = H - DEPTH  # нивото на карбона = основата на символа
PHI = math.radians(-22)  # камерата е леко вляво — три четвърти изглед
ELEV = math.radians(43)
ROT = Matrix.Rotation(PHI, 4, "Z")


def R(x, y, z):
    """Точка в координатите на камерата (камерата гледа по +Y) → световни."""
    return tuple(ROT @ Vector((x, y, z)))


def tile(M):
    body = L.rbox("Tile", TILE, TILE, H, R_OUT, seg=48)
    L.assign(body, M["ano"], M["edge"])  # фаската е сатенена: по заобления ъгъл дава мек блясък, не точки
    side = TILE - 2 * INSET
    pocket = L.rbox("Pocket", side, side, 1.0, R_OUT - INSET, z0=Z, seg=48)
    L.cut(body, pocket)
    L.finish(body, width=0.008, seg=2, chamfer=0.05, chamfer_mat=1)
    # карбонът: формата на джоба, но обектът е завъртян към камерата — тогава едната посока нишки блести
    inv = Matrix.Rotation(-PHI, 4, "Z")
    bm = bmesh.new()
    pts = [inv @ Vector((x, y, Z + 0.0015)) for x, y in L.rounded_rect(side + 0.01, side + 0.01, R_OUT - INSET, 24)]
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    bm.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    inlay = L.from_bmesh("Carbon", bm)
    inlay.rotation_euler = (0, 0, PHI)
    L.assign(inlay, M["carbon"])
    return body


def solid(M, name, mat, ob, width=0.012, chamfer=0.0, seg=2):
    """Материал + довършване: тялото е в `mat`, фаската (ако има) — полирана."""
    L.assign(ob, M[mat], M["polish"])
    return L.finish(ob, width=width, seg=seg, chamfer=chamfer, chamfer_mat=1 if chamfer else -1)


def lit(M, ob, key="glow"):
    L.assign(ob, M[key])
    for poly in ob.data.polygons:
        poly.use_smooth = False
    return ob


# ── символите ──────────────────────────────────────────────────────────────────────────────────
# Правило на системата: символът заема поне 70% от плочката и има ТОЧНО един светещ циан елемент
# (5–10% от площта), винаги върху смисловия акцент. На 110–130 px се четат формата и акцентът.
def web(M):  # прозорец на браузър: рамка, черно стъкло, съдържание от шлайфан метал, един светещ блок
    solid(M, "Frame", "ano", L.rbox("Frame", 3.25, 2.45, 0.18, 0.18, z0=Z), chamfer=0.04)
    L.assign(L.rbox("Glass", 3.05, 2.25, 0.012, 0.10, z0=Z + 0.18), M["screen"])
    z = Z + 0.193
    for k, x in enumerate((-1.26, -1.05, -0.84)):
        solid(M, f"Dot{k}", "alu", L.cyl(f"Dot{k}", 0.065, 0.03, (x, 0.90, z + 0.012), verts=32), width=0.008)
    solid(M, "Bar", "alu", L.rbox("Bar", 1.75, 0.13, 0.03, 0.05, z0=z, loc=(0.48, 0.90, 0)), width=0.006)
    solid(M, "Hero", "alu", L.rbox("Hero", 2.72, 0.66, 0.045, 0.06, z0=z, loc=(0, 0.33, 0)), chamfer=0.012, width=0.004)
    solid(M, "ColA", "alu", L.rbox("ColA", 1.28, 0.90, 0.045, 0.06, z0=z, loc=(-0.72, -0.58, 0)), chamfer=0.012, width=0.004)
    lit(M, L.rbox("ColB", 1.28, 0.30, 0.04, 0.06, z0=z, loc=(0.72, -0.28, 0)))
    solid(M, "ColC", "alu", L.rbox("ColC", 1.28, 0.46, 0.045, 0.06, z0=z, loc=(0.72, -0.80, 0)), chamfer=0.012, width=0.004)


def ecommerce(M):  # платежна карта от шлайфан метал: полиран чип, релефен номер, светеща лента
    low = solid(M, "CardLow", "ano", L.rbox("CardLow", 3.05, 1.92, 0.05, 0.18, z0=Z), chamfer=0.014, width=0.004)
    low.rotation_euler = (0, 0, math.radians(10))
    low.location = (0.10, 0.20, 0)
    top = solid(M, "Card", "alu", L.rbox("Card", 3.05, 1.92, 0.055, 0.18, z0=Z + 0.055), chamfer=0.016, width=0.004)
    top.rotation_euler = (0, 0, math.radians(-8))
    top.location = (-0.06, -0.16, 0)
    z = Z + 0.111
    kids = [solid(M, "Chip", "polish", L.rbox("Chip", 0.74, 0.58, 0.03, 0.09, z0=z, loc=(-0.86, 0.10, 0)), width=0.008)]
    for k in (-1, 1):
        kids.append(L.assign(L.box(f"ChipCut{k}", (0.02, 0.58, 0.004), (-0.86 + 0.17 * k, 0.10, z + 0.031)), M["ink"]))
    kids.append(L.assign(L.box("ChipCutH", (0.74, 0.02, 0.004), (-0.86, 0.10, z + 0.031)), M["ink"]))
    kids.append(lit(M, L.rbox("Stripe", 2.62, 0.11, 0.014, 0.04, z0=z, loc=(0, 0.66, 0))))
    for g in range(4):  # релефният номер: четири групи
        kids.append(solid(M, f"Num{g}", "ano", L.rbox(f"Num{g}", 0.50, 0.13, 0.02, 0.05, z0=z, loc=(-0.99 + g * 0.66, -0.55, 0)), width=0.006))
    for kid in kids:
        kid.parent = top


def software(M):  # </> — два плътни ъгъла от шлайфан алуминий с полирана фаска и светеща наклонена черта
    w, h, tx = 1.02, 2.12, 0.50
    left = [(w / 2 - tx, h / 2), (-w / 2, 0), (w / 2 - tx, -h / 2), (w / 2, -h / 2), (-w / 2 + tx, 0), (w / 2, h / 2)]
    solid(M, "Lt", "alu", L.prism("Lt", left, 0.17, z0=Z, loc=(-1.18, 0, 0)), chamfer=0.035)
    solid(M, "Gt", "alu", L.prism("Gt", [(-x, y) for x, y in reversed(left)], 0.17, z0=Z, loc=(1.18, 0, 0)), chamfer=0.035)
    sl, tk = 0.46, 0.34  # наклонът е по-голям от „истинския“: изгледът три четвърти го изправя
    lit(M, L.prism("Slash", [(-sl - tk / 2, -h / 2), (-sl + tk / 2, -h / 2), (sl + tk / 2, h / 2), (sl - tk / 2, h / 2)], 0.14, z0=Z))


def erp(M):  # четири модула в една система, свързани помежду си; единият свети
    side, gap, hgt = 1.42, 0.30, 0.26
    c = (side + gap) / 2
    for k, (x, y) in enumerate(((-c, c), (c, c), (-c, -c), (c, -c))):
        if k == 1:
            lit(M, L.rbox("ModLit", side - 0.06, side - 0.06, hgt - 0.03, 0.24, z0=Z, loc=(x, y, 0)))
        else:
            solid(M, f"Mod{k}", "alu", L.rbox(f"Mod{k}", side, side, hgt, 0.26, z0=Z, loc=(x, y, 0)), chamfer=0.04)
    for k, (x, y, a) in enumerate(((0, c, 0), (0, -c, 0), (-c, 0, 90), (c, 0, 90))):
        solid(M, f"Link{k}", "polish", L.rbox(f"Link{k}", gap + 0.16, 0.34, 0.11, 0.05, z0=Z + 0.05, loc=(x, y, 0),
                                              rot=(0, 0, math.radians(a))), width=0.012)


def mobile(M):  # телефон: полирана рамка, черно стъкло, един светещ ред на екрана
    solid(M, "Phone", "polish", L.rbox("Phone", 1.78, 3.30, 0.16, 0.34, z0=Z), width=0.03, seg=4)
    L.assign(L.rbox("Glass", 1.68, 3.20, 0.012, 0.30, z0=Z + 0.16), M["screen"])
    z = Z + 0.173
    L.assign(L.rbox("Island", 0.42, 0.10, 0.004, 0.045, z0=z, loc=(0, 1.36, 0)), M["ink"])
    lit(M, L.rbox("Row0", 1.30, 0.62, 0.006, 0.09, z0=z, loc=(0, 0.66, 0)))
    for k, y in enumerate((-0.04, -0.54, -1.04)):
        L.assign(L.rbox(f"Row{k + 1}", 1.30, 0.34, 0.006, 0.07, z0=z, loc=(0, y, 0)), M["ui"])


def gamedev(M):  # контролер: сатенено тяло (сливане + изглаждане), полирани кръст, бутони и лостчета, светеща лента
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, matrix=Matrix.Translation((0, 0.22, 0.25)) @ Matrix.Diagonal((2.9, 1.30, 0.50, 1)))
    for sx in (-1, 1):
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.76,
                                  matrix=Matrix.Translation((sx * 1.18, -0.26, 0.26)) @ Matrix.Diagonal((0.92, 1.30, 0.36, 1)))
        bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=0.72,
                                  matrix=Matrix.Translation((sx * 1.14, 0.30, 0.26)) @ Matrix.Diagonal((1.0, 0.95, 0.38, 1)))
    body = L.from_bmesh("Pad", bm)
    body.location = (0, 0, Z)
    rm = body.modifiers.new("Remesh", "REMESH")
    rm.mode, rm.voxel_size, rm.use_smooth_shade = "VOXEL", 0.03, True
    sm = body.modifiers.new("Smooth", "SMOOTH")
    sm.factor, sm.iterations = 0.9, 26
    L.assign(body, M["satin"])
    z = Z + 0.495
    for a in (0, 90):
        solid(M, f"Dpad{a}", "polish", L.rbox(f"Dpad{a}", 0.62, 0.21, 0.06, 0.04, z0=z, loc=(-1.14, 0.30, 0),
                                              rot=(0, 0, math.radians(a))), width=0.012)
    for k, (x, y) in enumerate(((1.14, 0.58), (1.42, 0.30), (1.14, 0.02), (0.86, 0.30))):
        solid(M, f"Btn{k}", "polish", L.cyl(f"Btn{k}", 0.115, 0.07, (x, y, z + 0.03), verts=48), width=0.018)
    for k, x in enumerate((-0.50, 0.50)):
        solid(M, f"Stick{k}", "polish", L.cyl(f"Stick{k}", 0.23, 0.11, (x, -0.24, z + 0.04), verts=64), width=0.035, seg=3)
        L.assign(L.cyl(f"StickTop{k}", 0.15, 0.012, (x, -0.24, z + 0.10), verts=48), M["ink"])
    lit(M, L.rbox("LightBar", 0.92, 0.15, 0.03, 0.07, z0=z + 0.005, loc=(0, 0.52, 0)))


def seo(M):  # лупа: истинска двойноизпъкнала леща (пречупва плетката отдолу), полиран обков, дръжка
    c = Vector((-0.48, 0.48, Z + 0.22))
    L.assign(L.torus("Rim", 1.02, 0.12, c, seg=128, mseg=32), M["polish"])
    lens = L.sphere("Lens", 0.95, c, seg=96, rings=48)
    lens.scale = (1, 1, 0.16)
    L.assign(lens, M["lens"])
    ring = L.torus("Light", 0.94, 0.035, (c.x, c.y, c.z + 0.10), seg=128, mseg=12)
    lit(M, ring)
    for poly in ring.data.polygons:
        poly.use_smooth = True
    ang = math.radians(-45)
    ax = Vector((math.cos(ang), math.sin(ang), 0))
    rot = (0, math.radians(90), ang)
    solid(M, "Neck", "polish", L.cyl("Neck", 0.12, 0.36, c + ax * 1.26, rot=rot, verts=48), width=0.012)
    solid(M, "Handle", "ano", L.cyl("Handle", 0.18, 1.36, c + ax * 2.10, rot=rot, verts=64), width=0.03, seg=3)
    solid(M, "Cap", "polish", L.cyl("Cap", 0.185, 0.09, c + ax * 2.80, rot=rot, verts=64), width=0.015)


def aeo(M):  # балон на отговор със светеща четирилъчна искра
    w, h, r = 3.15, 2.15, 0.52
    pts = L.rounded_rect(w, h, r, 16)
    n = 17 * 3  # след долната лява дъга: опашката на балона
    pts[n:n] = [(-0.90, -h / 2), (-1.16, -h / 2 - 0.62), (-0.24, -h / 2)]
    solid(M, "Bubble", "alu", L.prism("Bubble", pts, 0.22, z0=Z, loc=(0.02, 0.26, 0)), chamfer=0.04)
    star = []
    for k in range(8):
        a = k * math.pi / 4 + math.pi / 2
        rr = 0.60 if k % 2 == 0 else 0.13
        star.append((rr * math.cos(a), rr * math.sin(a)))
    lit(M, L.prism("Spark", star, 0.05, z0=Z + 0.22, loc=(0.02, 0.26, 0)))


def analytics(M):  # стълбова диаграма: три стълба от шлайфан алуминий с полирана фаска и един светещ
    solid(M, "Base", "ano", L.rbox("Base", 3.36, 1.02, 0.10, 0.16, z0=Z), chamfer=0.025)
    for k, hgt in enumerate((0.62, 1.04, 0.84, 1.56)):
        x = -1.20 + k * 0.80
        if k == 3:
            lit(M, L.rbox("BarLit", 0.58, 0.58, hgt - 0.05, 0.06, z0=Z + 0.10, loc=(x, 0, 0)))
            solid(M, "BarCap", "polish", L.rbox("BarCap", 0.60, 0.60, 0.05, 0.06, z0=Z + 0.05 + hgt, loc=(x, 0, 0)), width=0.01)
        else:
            solid(M, f"Bar{k}", "alu", L.rbox(f"Bar{k}", 0.60, 0.60, hgt, 0.06, z0=Z + 0.10, loc=(x, 0, 0)), chamfer=0.03)


def hosting(M):  # три сървърни модула с ясни междини; на горния — светеща лента на състоянието
    for k in range(3):
        z0 = Z + k * 0.47
        solid(M, f"Unit{k}", "alu", L.rbox(f"Unit{k}", 3.25, 2.0, 0.38, 0.12, z0=z0), chamfer=0.03)
        if k < 2:
            L.assign(L.rbox(f"Gap{k}", 3.0, 1.75, 0.09, 0.10, z0=z0 + 0.38), M["ink"])
        yf = -1.0 - 0.012
        L.assign(L.box(f"Panel{k}", (2.9, 0.02, 0.28), (0, yf + 0.005, z0 + 0.19)), M["ano"])
        for j in range(7):  # вентилационни прорези
            L.assign(L.box(f"Vent{k}{j}", (0.09, 0.012, 0.18), (-1.22 + j * 0.17, yf - 0.004, z0 + 0.19)), M["ink"])
        if k == 2:
            lit(M, L.box("Status", (0.95, 0.014, 0.10), (0.78, yf - 0.006, z0 + 0.19)))
        else:
            for j in range(3):
                L.assign(L.cyl(f"Led{k}{j}", 0.045, 0.02, (0.52 + j * 0.26, yf - 0.004, z0 + 0.19), rot=(math.radians(90), 0, 0), verts=24), M["ui"])


def _shield_pts(w, top, tip, seg=24):
    pts = [(w / 2, top), (-w / 2, top)]
    for k in range(1, seg):  # лявата страна надолу към върха
        t = k / seg
        pts.append((-w / 2 * math.cos(t * math.pi / 2) ** 0.75, top - 0.25 * w - (tip + top - 0.25 * w) * math.sin(t * math.pi / 2) ** 1.6))
    pts.append((0.0, -tip))
    for k in range(seg - 1, 0, -1):
        t = k / seg
        pts.append((w / 2 * math.cos(t * math.pi / 2) ** 0.75, top - 0.25 * w - (tip + top - 0.25 * w) * math.sin(t * math.pi / 2) ** 1.6))
    return pts


def security(M):  # щит: шлайфан кант с полирана фаска, черно поле, светеща ключалка
    solid(M, "Shield", "alu", L.prism("Shield", _shield_pts(2.70, 1.40, 1.66), 0.22, z0=Z), chamfer=0.045)
    solid(M, "Field", "ano", L.prism("Field", _shield_pts(2.14, 1.12, 1.26), 0.05, z0=Z + 0.22), width=0.008)
    z = Z + 0.27
    lit(M, L.cyl("KeyTop", 0.25, 0.03, (0, 0.22, z + 0.015), verts=64))
    lit(M, L.prism("KeySlot", [(-0.10, 0.12), (-0.17, -0.52), (0.17, -0.52), (0.10, 0.12)], 0.03, z0=z))


def api(M):  # три възела, свързани с дебели пръти; горният свети
    nodes = [(-1.16, -0.66), (0.0, 0.96), (1.16, -0.66)]
    zc = Z + 0.46
    for k, (x, y) in enumerate(nodes):
        solid(M, f"Foot{k}", "ano", L.cyl(f"Foot{k}", 0.52, 0.12, (x, y, Z + 0.06), verts=64), chamfer=0.025)
        L.assign(L.sphere(f"Node{k}", 0.43, (x, y, zc)), M["glow"] if k == 1 else M["polish"])
    for k, (a, b) in enumerate(((0, 1), (1, 2), (0, 2))):
        (x1, y1), (x2, y2) = nodes[a], nodes[b]
        ln = math.hypot(x2 - x1, y2 - y1)
        c = L.cyl(f"Link{k}", 0.115, ln, ((x1 + x2) / 2, (y1 + y2) / 2, zc), rot=(0, math.radians(90), math.atan2(y2 - y1, x2 - x1)), verts=48)
        L.assign(c, M["alu"])
        for poly in c.data.polygons:
            poly.use_smooth = True


def reverse(M):  # фрезовано зъбно колело под лазерната линия на скенера
    teeth, ro, ri = 14, 1.56, 1.22
    pts = []
    for k in range(teeth):
        a0 = k * math.tau / teeth
        for da, rr in ((-0.105, ri), (-0.060, ro), (0.060, ro), (0.105, ri)):
            pts.append((rr * math.cos(a0 + da), rr * math.sin(a0 + da)))
    gear = L.prism("Gear", pts, 0.30, z0=Z)
    L.assign(gear, M["machined"], M["polish"], M["alu"])
    for poly in gear.data.polygons:
        poly.material_index = 0 if poly.normal.z > 0.9 else 2
    L.cut(gear, L.cyl("HubCut", 0.36, 1.0, (0, 0, Z + 0.2), verts=64))
    for k in range(5):
        a = k * math.tau / 5 + 0.3
        L.cut(gear, L.cyl(f"Light{k}", 0.23, 1.0, (0.77 * math.cos(a), 0.77 * math.sin(a), Z + 0.2), verts=48))
    L.finish(gear, width=0.006, seg=2, chamfer=0.026, chamfer_mat=1)
    hub = solid(M, "Hub", "ano", L.cyl("Hub", 0.50, 0.38, (0, 0, Z + 0.19), verts=64), chamfer=0.024)
    L.cut(hub, L.cyl("HubBore", 0.19, 1.0, (0, 0, Z + 0.2), verts=6))
    q = Vector(R(0.0, -0.30, 0.0))
    n = ROT @ Vector((0.0, -1.0, 0.0))
    L.laser_line("Laser", (q.x + n.x * 14, q.y + n.y * 14, 16.0), (q.x, q.y, Z), power=2.4e6, width=0.0022,
                 roll=math.radians(90), spread=10.5, blend=0.5, speckle=0.3)


ICONS = {
    "web": web, "ecommerce": ecommerce, "software": software, "erp": erp, "mobile": mobile,
    "gamedev": gamedev, "seo": seo, "aeo": aeo, "analytics": analytics, "hosting": hosting,
    "security": security, "api": api, "reverse": reverse,
}


def build(name, a):
    L.reset(samples=a.samples, transparent=True, exposure=a.exposure)
    M = {
        "carbon": L.mat_carbon(tow=0.20, res=1024, wear=0.7, gain=0.62),
        "ano": L.mat_anodized("AnoBlack"),
        "alu": L.mat_metal("Alu", (0.60, 0.61, 0.63), 0.21, brush=1.2, axis=(1, 0, 0), aniso=0.7, streak=200.0),
        "steel": L.mat_metal("Steel", (0.72, 0.73, 0.75), 0.14, wear=0.5),
        "polish": L.mat_polished("Polish", (0.88, 0.89, 0.90), 0.06),
        "machined": L.mat_machined("Machined", center=(2.6, -1.9), pitch=0.05, metallic=0.94),
        "edge": L.mat_metal("Edge", (0.80, 0.81, 0.83), 0.17, wear=0.3),
        # емисията е по-дълбок циан от #00e5ff: AgX избелва силните източници и на екрана излиза цветът на марката
        "glow": L.mat_glow(strength=a.glow, color=(0.0, 0.60, 1.0)),
        "ui": L.mat_glow("UI", strength=0.22, color=(0.55, 0.70, 0.78)),
        "screen": L.mat_screen(),
        "lens": L.mat_glass("Lens", (0.92, 0.99, 1.0), 1.52),
        "satin": L.mat_anodized("Satin", (0.13, 0.135, 0.145), 0.30),
        "ink": L.mat_ink(),
    }
    tile(M)
    ICONS[name](M)
    L.shadow_catcher(z=0.0, size=60)
    # студио (в координатите на камерата): горен-заден софтбокс, чийто долен край се оглежда в лака и
    # избледнява към предната част на плочката; ивица отляво за фаските; циан контра; мек фронт
    L.softbox("Sky", R(1.0, 6.0, 15.0), (0, 0, 0.3), size=(15, 9), strength=10.0, edge=0.8, grad=(0.4, 0))
    # нисък софтбокс точно в огледалната посока: по него металът отгоре става светъл, с преход
    L.softbox("Mirror", R(2.0, 10.4, 9.8), (0, 0, 0.3), size=(13, 6.5), strength=a.mirror, edge=0.9, grad=(0.55, 0.35))
    L.softbox("StripL", R(-9.5, 0.5, 4.0), (0, 0, 0.4), size=(1.6, 12), strength=8.0, edge=0.8)
    # „beauty“ светлина откъм камерата: фаските, обърнати към обектива, светват в непрекъсната ярка линия —
    # тя отделя символа от карбона и чертае силуета на плочката
    L.softbox("Beauty", R(0.8, -13.0, 14.0), (0, 0, 0.3), size=(7, 4), strength=7.5, edge=0.7)
    L.softbox("Front", R(-2.0, -14.0, 6.0), (0, 0, 0.3), size=(16, 8), strength=5.0, edge=0.7)
    L.softbox("RimC", R(8.5, 7.0, 4.0), (0, 0, 0.4), size=(5, 3), strength=13.0, color=L.CYAN, edge=0.8)
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.006, 0.007, 0.008, 1)
    d = 20.5
    L.camera(R(0, -d * math.cos(ELEV), d * math.sin(ELEV) + 0.25), R(0, 0.1, 0.42), lens=135, fstop=0.42,
             focus=R(0, -0.2, 0.5))
    L.post(glare=0.20, threshold=1.6, size=6, alpha=True)
    return L.render(os.path.join(a.out, f"{name}.png"), (a.res, a.res), a.samples)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    ap.add_argument("--only", default="")
    ap.add_argument("--res", type=int, default=640)
    ap.add_argument("--samples", type=int, default=256)
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--glow", type=float, default=3.8)
    ap.add_argument("--mirror", type=float, default=3.4)
    # blender -b -P icons.py -- --out DIR → аргументите са след „--“; като bpy модул → всички
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else (sys.argv[1:] if sys.argv[0].endswith(".py") else [])
    A = ap.parse_args(argv)
    os.makedirs(A.out, exist_ok=True)
    for n in [x for x in A.only.split(",") if x] or list(ICONS):
        print("render", n, build(n, A), flush=True)
