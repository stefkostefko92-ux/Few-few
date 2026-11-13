"""header.py — лентата зад заглавието на статичните страници: „измервателната маса“, фотореалистично.

Макро кадър от метрологична лаборатория: фрезован алуминиев детайл върху лакирана карбонова плоча,
сапфирената сфера на координатно-измервателна сонда докосва челото му, лазерна линия на скенера минава
през плочата и се изкачва по детайла, отпред — стоманена линийка извън фокус. Обектив 85 mm, плитка
дълбочина на рязкост. Лявата третина остава тъмна и спокойна — там стои заглавието.

Пускане:  blender -b -P header.py -- --out DIR [--w 3200 --h 800 --samples 512]
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (bpy преди bmesh/mathutils — като модул те идват с него)
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cslib as L  # noqa: E402

PART_AT = Vector((4.6, 0.6, 0.0))
PART_ROT = math.radians(24)
PX, PY, PZ = 5.4, 3.8, 1.7  # размери на детайла
SWEEPS = 5  # брой положения на подвижната светлина


def part_point(x, y, z):
    """Точка в координатите на детайла → световни."""
    return PART_AT + Matrix.Rotation(PART_ROT, 4, "Z") @ Vector((x, y, z))


def build_part(M):
    """Фрезован блок: челно фрезован връх, шлайфани стени, полирана фаска, отвор с анодирана втулка,
    четири болта с вътрешен шестостен в зенкери."""
    ob = L.box("Part", (PX, PY, PZ), (0, 0, PZ / 2))
    L.assign(ob, M["side"], M["top"], M["polish"], M["bore"])
    for poly in ob.data.polygons:
        poly.material_index = 1 if poly.normal.z > 0.9 else 0
    bore = L.cyl("BoreCut", 1.12, 1.9, (0.55, 0.0, PZ - 0.45))
    L.assign(bore, M["bore"])
    L.cut(ob, bore, transfer=True)
    holes = [(-2.15, -1.35), (-2.15, 1.35), (2.25, -1.45), (2.25, 1.45)]
    for k, (x, y) in enumerate(holes):
        cb = L.cyl(f"CbCut{k}", 0.36, 0.8, (x, y, PZ - 0.02))
        L.assign(cb, M["bore"])
        L.cut(ob, cb, transfer=True)
    # прорез по дължината — още един обработен елемент, който хваща светлината
    slot = L.rbox("SlotCut", 1.5, 0.42, 0.6, 0.2, z0=PZ - 0.22, loc=(-1.45, 0.0, 0))
    L.assign(slot, M["bore"])
    L.cut(ob, slot, transfer=True)
    L.finish(ob, width=0.012, seg=2, chamfer=0.07, chamfer_mat=2)
    ob.location, ob.rotation_euler = PART_AT, (0, 0, PART_ROT)
    kids = []
    # втулка от анодиран в циан алуминий — цветът на марката като материал, не като неон
    bush = L.cyl("Bushing", 1.105, 0.82, (0.55, 0.0, PZ - 0.47))
    inner = L.cyl("BushCut", 0.80, 1.2, (0.55, 0.0, PZ - 0.4))
    L.assign(bush, M["cyan"], M["polish"])
    L.cut(bush, inner)
    L.finish(bush, width=0.008, seg=2, chamfer=0.04, chamfer_mat=1)
    kids += [bush, inner]
    floor = L.cyl("BoreFloor", 0.82, 0.02, (0.55, 0.0, PZ - 0.88))
    L.assign(floor, M["oxide"])
    kids.append(floor)
    for k, (x, y) in enumerate(holes):
        head = L.cyl(f"Screw{k}", 0.31, 0.32, (x, y, PZ - 0.22), verts=64)
        hexc = L.cyl(f"HexCut{k}", 0.16, 0.3, (x, y, PZ - 0.06), verts=6, rot=(0, 0, 0.4 * k))
        L.assign(head, M["oxide"])
        L.cut(head, hexc)
        L.finish(head, width=0.02, seg=3)
        kids += [head, hexc]
    # лазерно гравиран допуск на челото
    txt = L.text("Etch", "±0.02", size=0.42, extrude=0.0, loc=(-0.9, -PY / 2 - 0.003, 0.55),
                 rot=(math.radians(90), 0, 0), align="LEFT")
    L.assign(txt, M["etch"])
    kids.append(txt)
    for k in kids + [bore, slot] + [bpy.data.objects[f"CbCut{i}"] for i in range(4)]:
        k.parent = ob
    return ob


def build_probe(M, contact):
    """Сонда на КИМ: сапфирена сфера Ø4 mm на карбидно стебло, конусен държач, тяло с пръстен."""
    r = 0.3
    c = contact + Matrix.Rotation(PART_ROT, 4, "Z") @ Vector((0, -r, 0))
    ball = L.sphere("Tip", r, c)
    L.assign(ball, M["sapphire"])
    stem = L.cyl("Stem", 0.085, 3.0, (c.x, c.y, c.z + 1.5 + r * 0.6), verts=48)
    L.assign(stem, M["carbide"])
    for poly in stem.data.polygons:
        poly.use_smooth = abs(poly.normal.z) < 0.5
    cone = L.cyl("Holder", 0.09, 0.6, (c.x, c.y, c.z + 3.3), verts=96, r2=0.26)
    L.assign(cone, M["steel"])
    L.finish(cone, width=0.01, seg=2)
    body = L.cyl("Body", 0.34, 1.6, (c.x, c.y, c.z + 4.4), verts=128)
    L.assign(body, M["ano"])
    L.finish(body, width=0.03, seg=3)
    ring = L.cyl("Ring", 0.345, 0.07, (c.x, c.y, c.z + 3.95), verts=128)
    L.assign(ring, M["cyan"])
    return ball


def build_rule(M):
    """Черна стоманена линийка 150 mm, шлайфана по дължина, с лазерно ецвани светли деления и цифри."""
    ang = math.radians(13)
    length, width, thick = 17.0, 2.5, 0.09
    at = Vector((9.6, -4.5, 0.0))
    rule = L.rbox("Rule", length, width, thick, 0.18)
    L.assign(rule, M["rule"])
    hole = L.cyl("RuleHole", 0.28, 0.5, (length / 2 - 0.7, 0, 0.05), verts=48)
    L.cut(rule, hole)
    hole.parent = rule
    L.finish(rule, width=0.012, seg=2)
    bm = bmesh.new()
    z = thick + 0.0006
    for k in range(151):
        x = -length / 2 + 0.6 + k * 0.1
        ln = 0.62 if k % 10 == 0 else (0.46 if k % 5 == 0 else 0.30)
        w = 0.016 if k % 10 == 0 else 0.011
        y1 = width / 2 - 0.02
        bm.faces.new([bm.verts.new(q) for q in ((x - w / 2, y1 - ln, z), (x + w / 2, y1 - ln, z), (x + w / 2, y1, z), (x - w / 2, y1, z))])
    marks = L.from_bmesh("Marks", bm)
    L.assign(marks, M["ink"])
    marks.parent = rule
    for k in range(1, 15):
        t = L.text(f"N{k}", str(k), size=0.36, extrude=0.0, loc=(-length / 2 + 0.6 + k, width / 2 - 0.98, z), align="CENTER")
        L.assign(t, M["ink"])
        t.parent = rule
    rule.location, rule.rotation_euler = at, (0, 0, ang)
    return rule


def main(a):
    L.reset(samples=a.samples, exposure=a.exposure)
    M = {
        "carbon": L.mat_carbon(),
        "top": L.mat_machined("PartTop", center=(7.5, -5.0), pitch=0.07, metallic=0.94),
        "side": L.mat_metal("PartSide", (0.78, 0.79, 0.81), 0.40, brush=0.8, axis=(0, 0, 1), aniso=0.8, streak=220.0, metallic=0.94),
        "polish": L.mat_polished("Chamfer", (0.90, 0.91, 0.92), 0.045),
        "bore": L.mat_metal("Bore", (0.70, 0.71, 0.73), 0.30, wear=0.4),
        "cyan": L.mat_anodized("AnoCyan", (0.0, 0.50, 0.66), 0.28),
        "ano": L.mat_anodized("AnoBlack"),
        "oxide": L.mat_black_oxide(),
        "etch": L.mat_metal("Etch", (0.92, 0.93, 0.94), 0.62, wear=0.0, metallic=0.6),
        "sapphire": L.mat_sapphire(),
        "carbide": L.mat_metal("Carbide", (0.52, 0.53, 0.55), 0.30, brush=0.5, axis=(0, 0, 1), aniso=0.8, wear=0.3),
        "steel": L.mat_metal("ProbeSteel", (0.62, 0.63, 0.65), 0.2, brush=0.5, axis=(0, 0, 1)),
        "rule": L.mat_metal("RuleBlack", (0.030, 0.031, 0.034), 0.30, brush=1.0, axis=(1, 0, 0), aniso=0.75),
        "ink": L.mat_metal("RuleEtch", (0.80, 0.81, 0.83), 0.50, wear=0.0),
    }
    # плетката е почти по оста на камерата: тогава едната посока нишки блести, другата е тъмна (twill диагоналът)
    plate = L.plane("Plate", 400, 400, (0, 0, 0), rot_z=math.radians(-7))
    L.assign(plate, M["carbon"])
    build_part(M)
    tip = build_probe(M, part_point(-1.55, -PY / 2, 0.95))
    build_rule(M)

    # студио: голям заден-горен софтбокс осветява плетката и горните повърхности; далечен нисък дава
    # едва доловим блясък по лака отдясно; ивица отляво рисува ръбовете; циан контра отзад
    base = [
        L.softbox("Sky", (10, 34, 30), (4, 0, 0), size=(50, 26), strength=4.6, edge=0.7, grad=(0.85, 0)),
        L.softbox("Key", (11, 15, 17), (4.6, 0.6, 1.0), size=(11, 8), strength=13.0, edge=0.6),
        L.softbox("Horizon", (30, 120, 44), (4, 0, 0), size=(80, 16), strength=1.3, edge=0.8, grad=(0.95, 0)),
        L.softbox("StripL", (-17, 2, 7), (4, 0, 0.8), size=(1.6, 15), strength=20.0),
        L.softbox("Front", (-4, -44, 15), (3, 0, 0.5), size=(44, 18), strength=9.5, edge=0.7),
        L.softbox("RimC", (21, 20, 15.0), (5, 0, 1.0), size=(9, 5), strength=11.0, color=L.CYAN, edge=0.8),
    ]
    world = bpy.context.scene.world
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.005, 0.006, 1)
    # лазерен профилен скенер: вертикален лист светлина. Линията върви по плочата, изкачва се отвесно по
    # лявата стена, пресича върха (минава покрай прореза, през зенкера на предния ляв болт и през отвора
    # с втулката — там се „чупи“ и показва дълбочината); от средата към краищата избледнява, с лек спекъл
    q = part_point(-0.4, -0.75, 0.0)
    d = Vector((0.8, 0.6, 0.0))
    src = Vector((q.x - d.x * 40, q.y - d.y * 40, 45.0))
    spot = L.laser_line("Laser", src, (q.x, q.y, 0.0), power=a.laser, width=0.0008, spread=62.0, blend=1.0, speckle=0.35)
    # детайлът стои в дясната третина на кадъра: заглавието на страницата е отляво и не бива да го застъпва
    cam = L.camera((-15.9, -60.7, 23.7), (-3.9, 0.95, 0.8), lens=85, fstop=a.fstop, focus=tip)
    if not a.live:
        L.post(glare=0.14, threshold=1.8, size=7, dispersion=0.008, vignette=0.5)
        L.render(os.path.join(a.out, a.name), (a.w, a.h), a.samples, a.border)
        return
    # ── „жива“ версия: същият кадър, разделен на светлинни слоеве за public/js/cs-live.js ──
    for ob in base:
        L.group(ob, "base")
    L.group(world, "base")
    L.group(spot, "spot")
    # подвижната светлина: пет тесни софтбокса в равнината на „Sky“, от ляво надясно; в браузъра
    # съседните се преливат един в друг и отражението се плъзга по плетката и фаските
    sweeps = {}
    for k in range(SWEEPS):
        x = -34.0 + k * 11.0
        # малко пред „Sky“ и пропускливи: добавят светлина, без да му я отнемат
        L.group(L.softbox(f"Sweep{k}", (x, 33.2, 29.3), (x - 6.0, 0, 0), size=(17, 26), strength=13.0, edge=0.85, through=True), f"sw{k}")
        sweeps[f"sw{k}"] = ([f"sw{k}"], False)
    # „потопът“ на лазера: успоредна светлина по посоката на проектора (в равнината на листа)
    L.group(L.sun("Flood", (Vector((q.x, q.y, 0.0)) - src), strength=a.flood), "flood")
    os.makedirs(a.live, exist_ok=True)
    L.live_passes(a.live, ["base", "spot"], {"base": (["base"], True), "flood": (["flood"], False), **sweeps}, raw=bool(a.border))
    L.render(os.path.join(a.live, "_combined.png"), (a.w, a.h), a.samples, a.border)
    if a.border:
        return
    n = Vector((-d.y, d.x, 0.0))  # нормалата на лазерния лист: по нея се мести линията
    s_min, s_max = L.render_position(a.live, (a.w, a.h), n)
    meta = {"w": a.w, "h": a.h, "sweeps": SWEEPS, "sMin": s_min, "sMax": s_max, "s0": float(n.dot(Vector((q.x, q.y, 0.0))))}
    with open(os.path.join(a.live, "meta.json"), "w", encoding="utf8") as f:
        json.dump(meta, f, indent=1)
    print("live:", meta, flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    ap.add_argument("--name", default="header.png")
    ap.add_argument("--w", type=int, default=3200)
    ap.add_argument("--h", type=int, default=800)
    ap.add_argument("--samples", type=int, default=512)
    ap.add_argument("--fstop", type=float, default=0.13)
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--laser", type=float, default=7.0e7)
    ap.add_argument("--border", type=float, nargs=4, default=None)
    ap.add_argument("--live", default="", help="папка за светлинните слоеве на живата версия")
    ap.add_argument("--flood", type=float, default=28.0)
    # blender -b -P header.py -- --out DIR → аргументите са след „--“; като bpy модул → всички
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else (sys.argv[1:] if sys.argv[0].endswith(".py") else [])
    A = ap.parse_args(argv)
    os.makedirs(A.out, exist_ok=True)
    main(A)
