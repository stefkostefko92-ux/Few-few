"""hero.py — сцената на началната страница: монограмата CS като фрезован детайл.

Емблемата (контурите са от логото — emblem.json) е изправена върху лакирана карбонова плоча и се оглежда в
нея: тела от черен анодиран алуминий с шлайфано чело и диамантена фаска, в челото — карбонова вложка, а
около нея свети циан уплътнение (вътрешната линия на логото). Отпред е полираното острие, отзад —
неонов пръстен; лазерен профилен скенер минава отвесно през лицето на емблемата.

Пускане:   blender -b -P hero.py -- --out DIR [--w 1920 --h 1080 --samples 448] [--portrait]
С --live DIR кадърът излиза разделен на светлинни слоеве за public/js/cs-live.js (виж cslib.live_passes).
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402  (bpy преди bmesh/mathutils)
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

import cslib as L  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(HERE, "emblem.json"), encoding="utf8"))
SWEEPS = 5
T = 0.80          # дебелина на буквите (8 mm)
POCKET = 0.06     # дълбочина на джоба за карбона
PLINTH = 0.60     # височина на постамента
YAW = math.radians(-11)


def face_poly(name, pts, z):
    """Плосък многоъгълник в равнината XY на височина z, нормала +Z (за карбона и уплътнението)."""
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new((x, y, z)) for x, y in pts])
    bm.normal_update()
    if f.normal.z < 0:
        f.normal_flip()
    return L.from_bmesh(name, bm)


def letter(M, name, shape, z0, root):
    """Една буква: тяло с джоб, светещо уплътнение на дъното му и карбонова вложка върху него."""
    body = L.prism(name, shape["outer"], T, z0=z0)
    L.assign(body, M["ano"], M["face"], M["polish"])
    for poly in body.data.polygons:
        poly.material_index = 1 if poly.normal.z > 0.9 else 0
    cutter = L.prism(name + "Pocket", shape["pocket"], 1.0, z0=z0 + T - POCKET)
    L.assign(cutter, M["ano"])
    L.cut(body, cutter, transfer=True)
    L.finish(body, width=0.008, seg=2, chamfer=0.045, chamfer_mat=2)
    glow = face_poly(name + "Gasket", shape["pocket"], z0 + T - POCKET + 0.004)
    L.assign(glow, M["glow"])
    L.group(glow, "glow")
    inlay = face_poly(name + "Carbon", shape["inlay"], z0 + T - POCKET + 0.014)
    L.assign(inlay, M["carbon"])
    for ob in (body, cutter, glow, inlay):
        ob.parent = root
    return body


def build_emblem(M, at):
    """Емблемата се моделира легнала (лицето нагоре), после коренът я изправя и я завърта към камерата."""
    root = bpy.data.objects.new("Emblem", None)
    L.link(root)
    letter(M, "C", E["C"], 0.0, root)
    letter(M, "S", E["S"], 0.26, root)       # „S“ е пред „C“, както в логото
    blade = L.prism("Blade", E["blade"], 0.10, z0=0.26 + T + 0.07)
    L.assign(blade, M["blade"], M["polish"])
    L.finish(blade, width=0.006, seg=2, chamfer=0.022, chamfer_mat=1)
    blade.parent = root
    root.rotation_euler = (math.radians(90), 0, YAW)
    root.location = (at[0], at[1], PLINTH)
    return root


def to_world(root, x, y, z=0.0):
    bpy.context.view_layer.update()
    return root.matrix_world @ Vector((x, y, z))


def build_stand(M, root, at):
    """Постамент от черен анодиран алуминий с гравирано име; „C“ стъпва на два полирани щифта."""
    rz = Matrix.Rotation(YAW, 4, "Z")
    c = Vector((at[0], at[1], 0)) + rz @ Vector((0.0, -0.52, 0.0))
    pl = L.rbox("Plinth", 10.4, 2.3, PLINTH, 0.22, z0=0.0)
    L.assign(pl, M["ano"], M["polish"])
    L.finish(pl, width=0.008, seg=2, chamfer=0.05, chamfer_mat=1)
    pl.location, pl.rotation_euler = c, (0, 0, YAW)
    c_bottom = min(p[1] for p in E["C"]["outer"])
    for x in (-3.5, -1.3):
        p = to_world(root, x, 0.0, T * 0.5)
        pin = L.cyl("Pin", 0.085, c_bottom + 0.02, (p.x, p.y, PLINTH + c_bottom / 2), verts=32)
        L.assign(pin, M["polish"])
    front = c + rz @ Vector((0.0, -1.15 - 0.003, PLINTH * 0.5))
    txt = L.text("Name", "CARBON STEALTH VCC", size=0.21, extrude=0.0, loc=front, rot=(math.radians(90), 0, YAW))
    txt.data.space_character = 1.5
    L.assign(txt, M["etch"])


def main(a):
    L.reset(samples=a.samples, exposure=a.exposure)
    sc = bpy.context.scene
    M = {
        "carbon": L.mat_carbon(tow=0.2, wear=0.8),
        "floor": L.mat_carbon("Floor", tow=0.2, wear=1.0),
        "ano": L.mat_anodized("AnoBlack", (0.016, 0.017, 0.019), 0.36),
        "face": L.mat_metal("Face", (0.66, 0.67, 0.69), 0.30, brush=1.0, axis=(0, 1, 0), aniso=0.8, streak=240.0),
        "polish": L.mat_polished("Chamfer", (0.90, 0.91, 0.92), 0.05),
        "blade": L.mat_metal("BladeSteel", (0.86, 0.87, 0.89), 0.34, brush=0.8, axis=(0, 1, 0), aniso=0.85, streak=300.0, wear=0.3),
        "glow": L.mat_glow(strength=a.glow, color=(0.0, 0.60, 1.0)),
        "neon": L.mat_glow("Neon", strength=a.glow * 1.4, color=(0.0, 0.60, 1.0)),
        "etch": L.mat_metal("Etch", (0.90, 0.91, 0.92), 0.6, wear=0.0, metallic=0.6),
    }
    at = (5.3, 0.0)
    floor = L.plane("Floor", 700, 700, (0, 0, 0), rot_z=math.radians(-3))
    L.assign(floor, M["floor"])
    root = build_emblem(M, at)
    build_stand(M, root, at)
    # неонов пръстен зад емблемата — кръгът от логото
    ctr = to_world(root, -0.2, 2.75, -1.6)
    ring = L.torus("Ring", 4.15, 0.035, ctr, rot=(math.radians(90), 0, YAW), seg=256, mseg=16)
    L.assign(ring, M["neon"])
    L.group(ring, "glow")

    rz = Matrix.Rotation(YAW, 4, "Z")
    fc = to_world(root, 0.6, 2.7, T)  # среда на лицето — натам гледат светлините

    def W(x, y, z):  # координати спрямо емблемата (x надясно по лицето, y назад, z нагоре) → световни
        return tuple(Vector((at[0], at[1], 0)) + rz @ Vector((x, y, z)))

    base = [
        # отпред-горе: голям мек софтбокс — шлайфаните чела го хващат и се четат като метал
        L.softbox("FrontTop", W(-4, -34, 24), fc, size=(34, 16), strength=7.5, edge=0.8),
        # откъм камерата: фаските, обърнати към обектива, светват в непрекъсната ярка линия
        L.softbox("Beauty", W(-6, -44, 9), fc, size=(12, 5), strength=6.0, edge=0.8),
        # заден-горен: осветява плетката на пода и горните ръбове
        # (при изправения кадър за телефон се вижда и близкият под: софтбоксът е по-високо, за да не се
        # огледа в лака като бяло петно)
        (L.softbox("Sky", W(4, 40, 66), W(0, 4, 0), size=(96, 44), strength=9.5, edge=0.75) if a.portrait else
         L.softbox("Sky", W(4, 46, 30), W(0, 6, 0), size=(70, 26), strength=7.0, edge=0.75, grad=(0.7, 0))),
        # нисък далечен: блясък по лака в далечината, зад емблемата
        L.softbox("Horizon", W(20, 150, 20), W(0, 0, 2), size=(120, 12), strength=0.9, edge=0.85, grad=(0.8, 0)),
        # ивица отляво: чертае фаските и стените
        L.softbox("StripL", W(-22, -8, 6), fc, size=(1.8, 16), strength=18.0),
        # циан контра отзад-дясно
        L.softbox("RimC", W(17, 16, 9), fc, size=(8, 5), strength=14.0, color=L.CYAN, edge=0.8),
    ]
    # няколко светлинки в далечината: размити дискове зад емблемата (уреди в тъмната зала). Малко и
    # встрани от мястото на заглавието — да дават дълбочина, без да отвличат
    import random
    rnd = random.Random(11)
    lamp = {c: L.mat_glow(f"Bokeh{c}", strength=st, color=col) for c, st, col in
            ((0, 7.0, (0.0, 0.62, 1.0)), (1, 4.5, (0.85, 0.93, 1.0)), (2, 12.0, (0.0, 0.62, 1.0)))}
    for k in range(13):
        p = W(rnd.uniform(-30, 70), rnd.uniform(130, 240), rnd.uniform(3.0, 26.0))
        b = L.sphere(f"Bokeh{k}", rnd.uniform(0.22, 0.5), p, seg=16, rings=8)
        L.assign(b, lamp[rnd.choice((0, 0, 1, 1, 2))])
        base.append(b)
    world = sc.world
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.003, 0.004, 0.005, 1)

    # лазерен профилен скенер: отвесен лист, който се мести по ширината на емблемата (s = локалната ѝ ос X)
    n = rz @ Vector((1.0, 0.0, 0.0))
    ldir = rz @ Vector((0.0, math.cos(math.radians(40)), -math.sin(math.radians(40))))
    q = to_world(root, 1.55, 2.2, T)
    src = q - ldir * 60.0
    spot = L.laser_line("Laser", src, q, power=a.laser, width=0.0007, spread=40.0, blend=1.0, speckle=0.12)

    if a.portrait:
        cam = L.camera(W(0.4, -44, 7.2), W(0.1, 0, -0.4), lens=70, fstop=a.fstop, focus=to_world(root, 0.5, 2.6, T))
    else:
        cam = L.camera((0.6, -47.0, 6.6), (0.5, 0.0, 3.0), lens=80, fstop=a.fstop, focus=to_world(root, 0.5, 2.6, T))
    cam.data.dof.aperture_blades = 0

    if not a.live:
        spot.hide_render = True  # в неподвижния кадър няма лазер — той идва с живата сцена
        L.post(glare=0.16, threshold=1.6, size=7, dispersion=0.008, vignette=0.45)
        L.render(os.path.join(a.out, a.name), (a.w, a.h), a.samples, a.border)
        return
    for ob in base:
        L.group(ob, "base")
    L.group(world, "base")
    L.group(spot, "spot")
    sweeps = {}
    for k in range(SWEEPS):
        x = -26.0 + k * 13.0
        # двойка: предната лента се оглежда в челата и фаските, задната — в плетката на пода
        # пропускливи (through): светят, без да закриват постоянните софтбоксове зад себе си
        L.group(L.softbox(f"SweepF{k}", W(x, -30, 15), fc, size=(7, 20), strength=12.0, edge=0.9, through=True), f"sw{k}")
        L.group(L.softbox(f"SweepB{k}", W(x * 1.5, 43, 27), W(x * 0.7, 4, 0), size=(22, 24), strength=6.0, edge=0.9, through=True), f"sw{k}")
        sweeps[f"sw{k}"] = ([f"sw{k}"], False)
    L.group(L.sun("Flood", ldir, strength=a.flood), "flood")
    os.makedirs(a.live, exist_ok=True)
    L.live_passes(a.live, ["base", "glow"],
                  {"base": (["base"], True), "glow": (["glow"], True), "flood": (["flood"], False), **sweeps},
                  glare=0.16, threshold=1.6, vignette=0.45)
    L.render(os.path.join(a.live, "_combined.png"), (a.w, a.h), a.samples)
    x0 = min(p[0] for p in E["C"]["outer"])
    x1 = max(p[0] for p in E["S"]["outer"])
    scan = [float(n.dot(to_world(root, x0 - 0.6, 0, 0))), float(n.dot(to_world(root, x1 + 0.6, 0, 0)))]
    s_min, s_max = L.render_position(a.live, (a.w, a.h), n, clip=(scan[0] - 22.0, scan[1] + 12.0))
    meta = {"w": a.w, "h": a.h, "sweeps": SWEEPS, "sMin": s_min, "sMax": s_max, "s0": float(n.dot(q)), "scan": scan}
    with open(os.path.join(a.live, "meta.json"), "w", encoding="utf8") as f:
        json.dump(meta, f, indent=1)
    print("live:", meta, flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    ap.add_argument("--name", default="hero.png")
    ap.add_argument("--w", type=int, default=1920)
    ap.add_argument("--h", type=int, default=1080)
    ap.add_argument("--samples", type=int, default=448)
    ap.add_argument("--fstop", type=float, default=0.22)
    ap.add_argument("--exposure", type=float, default=0.0)
    ap.add_argument("--glow", type=float, default=4.2)
    ap.add_argument("--laser", type=float, default=1.1e7)
    ap.add_argument("--flood", type=float, default=28.0)
    ap.add_argument("--border", type=float, nargs=4, default=None)
    ap.add_argument("--portrait", action="store_true", help="кадър за телефон (изправен)")
    ap.add_argument("--live", default="", help="папка за светлинните слоеве на живата версия")
    # blender -b -P hero.py -- --out DIR → аргументите са след „--“; като bpy модул → всички
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else (sys.argv[1:] if sys.argv[0].endswith(".py") else [])
    A = ap.parse_args(argv)
    os.makedirs(A.out, exist_ok=True)
    main(A)
