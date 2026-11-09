"""Изпича детайлния модел върху нискополигоналния модел за играта (jbib + lowr).

Пускане: python bake_rfs.py --high HIGH.blend --game GAME.blend --out DIR [--size 2048]

Изход за всяка част: цвят a/b/c (розово/черно/виолетово), tangent normal map, маска за spec и AO;
плюс .blend с UV атлас (bake_work.blend) за preview_game.py.
"""
import argparse
import math
import os
import sys

import bpy  # noqa: I001
import addon_utils
import bmesh
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("--high", required=True)
ap.add_argument("--game", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--size", type=int, default=2048)
ap.add_argument("--samples", type=int, default=48)
args = ap.parse_args(sys.argv[1:])
OUT = os.path.abspath(args.out)
TEX = os.path.join(OUT, "textures")
os.makedirs(TEX, exist_ok=True)
S = args.size

PALETTES = {
    "a": ("rose", {"fab": "#DDA3A5", "rib": "#E0A6A9", "teeth": "#C98C90", "cord": "#E8B2B4"}),
    "b": ("black", {"fab": "#232125", "rib": "#29272B", "teeth": "#18171A", "cord": "#2D2B2F"}),
    "c": ("violet", {"fab": "#714FA0", "rib": "#7654A5", "teeth": "#5E418A", "cord": "#8062AD"}),
}
TRIM = {"metal": "#CFC7C2", "stone": "#E9E5DF", "red": "#C2142F"}


def lin(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c) + (1.0,)


bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.game))
addon_utils.enable("cycles", default_set=True)
addon_utils.enable("io_scene_fbx", default_set=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"

low_objs = {o.name: o for o in bpy.data.objects}
JBIB = ["Hoodie body", "Hoodie hem band", "Hood front edges (funnel)", "Hood", "Sleeve wearer right", "Sleeve wearer left",
        "Cuff wearer right", "Cuff wearer left"]
LOWR = ["Trouser leg wearer right", "Trouser leg wearer left", "Elastic waistband", "Ankle channel wearer right",
        "Ankle channel wearer left", "Back pocket right", "Back pocket left"]
INNER = {"Hoodie hem band", "Hood front edges (funnel)", "Hood", "Cuff wearer right", "Cuff wearer left",
         "Ankle channel wearer right", "Ankle channel wearer left", "Elastic waistband"}

# ---------------------------------------------------------------- детайлната сцена
with bpy.data.libraries.load(os.path.abspath(args.high), link=False) as (src, dst):
    dst.objects = [n for n in src.objects]
high = bpy.data.collections.new("high detail (bake source)")
scene.collection.children.link(high)
HIGH_GARMENT, HIGH_ALL = [], []
MANNEQUIN = {"Head", "Neck", "Hand right", "Hand left", "Foot right", "Foot left", "Ankle right", "Ankle left"}
for ob in dst.objects:
    if ob is None:
        continue
    if ob.type not in ("MESH", "CURVE"):
        bpy.data.objects.remove(ob)
        continue
    base = ob.name.rsplit(".", 1)[0] if ob.name.rsplit(".", 1)[-1].isdigit() else ob.name
    if base in MANNEQUIN or base.startswith("Floor"):
        bpy.data.objects.remove(ob)
        continue
    high.objects.link(ob)
    HIGH_ALL.append(ob)
for ob in HIGH_ALL:  # едно ниво подразделяне стига за източника; финия детайл го дава bump-ът в шейдъра
    for md in ob.modifiers:
        if md.type == "SUBSURF":
            md.render_levels = 1
print(f"appended {len(HIGH_ALL)} high objects", flush=True)

# ---------------------------------------------------------------- UV острови от пръстените


def tube_uv(ob):
    """UV на всеки ъгъл в метри: u = дължина на дъгата по пръстена (центрирана), v = дължина по тръбата."""
    me = ob.data
    N, M = int(ob["ring_n"]), int(ob["ring_m"])
    co = [v.co for v in me.vertices]
    per, arc = [], []
    for i in range(M):
        ring = co[i * N:(i + 1) * N]
        s = [0.0]
        for j in range(1, N + 1):
            s.append(s[-1] + (ring[j % N] - ring[j - 1]).length)
        per.append(s[-1])
        arc.append(s)
    cen = [sum(co[i * N:(i + 1) * N], Vector()) / N for i in range(M)]
    vv = [0.0]
    for i in range(1, M):
        vv.append(vv[-1] + (cen[i] - cen[i - 1]).length)
    uvs = {}
    for poly in me.polygons:
        idx = [me.loops[li].vertex_index for li in poly.loop_indices]
        js = [k % N for k in idx]
        wrap = (N - 1 in js) and (0 in js)
        for li, vi in zip(poly.loop_indices, idx):
            i, j = divmod(vi, N)
            jj = N if (wrap and j == 0) else j
            uvs[li] = (arc[i][jj] - per[i] / 2, vv[i])
    w = max(per)
    return uvs, w, vv[-1]


def grid_uv(ob):
    me = ob.data
    gu, gv = ob["grid"]
    uvs = {}
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            r, c = divmod(vi, gu)
            uvs[li] = (c / (gu - 1) * 0.12 - 0.06, r / (gv - 1) * 0.165)
    return uvs, 0.12, 0.165


def shelf_pack(boxes, margin):
    """boxes: списък (w, h). Връща (позиции, страна) за най-малкия намерен квадрат."""
    area = sum((w + margin) * (h + margin) for w, h in boxes)
    side = math.sqrt(area) * 1.05
    order = sorted(range(len(boxes)), key=lambda k: -boxes[k][1])
    while True:
        pos, x, y, shelf_h, ok = {}, margin, margin, 0.0, True
        for k in order:
            w, h = boxes[k]
            if x + w + margin > side:
                x, y = margin, y + shelf_h + margin
                shelf_h = 0.0
            if w + 2 * margin > side or y + h + margin > side:
                ok = False
                break
            pos[k] = (x, y)
            x += w + margin
            shelf_h = max(shelf_h, h)
        if ok:
            return pos, side
        side *= 1.03


def build_drawable(name, parts):
    """Слива частите в един меш с UV атлас; вътрешните обвивки сочат запазена клетка с плътен цвят."""
    islands, data = [], []
    for pn in parts:
        ob = low_objs[pn]
        print(f"  {pn}: {len(ob.data.polygons)} quads", flush=True)
        uvs, w, h = grid_uv(ob) if "grid" in ob else tube_uv(ob)
        islands.append((w, h))
        data.append((ob, uvs, w))
    cell = 0.03
    islands.append((cell, cell))
    pos, side = shelf_pack(islands, margin=0.012)
    cx, cy = pos[len(islands) - 1]
    cell_uv = ((cx + cell / 2) / side, (cy + cell / 2) / side)
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    for k, (ob, uvs, w) in enumerate(data):
        ox, oy = pos[k]
        me = ob.data
        vmap = [bm.verts.new(v.co) for v in me.vertices]
        for poly in me.polygons:
            f = bm.faces.new([vmap[me.loops[li].vertex_index] for li in poly.loop_indices])
            f.smooth = True
            for loop, li in zip(f.loops, poly.loop_indices):
                u, v = uvs[li]
                loop[uvl].uv = ((ox + w / 2 + u) / side, (oy + v) / side)
        if ob.name in INNER:
            new_faces = []
            for poly in me.polygons:
                vs = [bm.verts.new(me.vertices[me.loops[li].vertex_index].co - me.vertices[me.loops[li].vertex_index].normal * 0.003)
                      for li in reversed(list(poly.loop_indices))]
                f = bm.faces.new(vs)
                f.smooth = True
                for loop in f.loops:
                    loop[uvl].uv = cell_uv
                new_faces.append(f)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00001)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    for pn in parts:
        bpy.data.objects.remove(low_objs[pn])
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    print(f"{name}: {tris} tris, atlas {side:.2f} m -> {S / side / 100:.1f} px/cm", flush=True)
    return ob, cell_uv, side


JB, JB_CELL, JB_SIDE = build_drawable("jbib_000", JBIB)
LW, LW_CELL, LW_SIDE = build_drawable("lowr_000", LOWR)

# ---------------------------------------------------------------- изпичане
ORIG = {}
for ob in HIGH_ALL:
    ORIG[ob.name] = [s.material for s in ob.material_slots]


def emission_mat(name, color):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = color
    em.inputs["Strength"].default_value = 1.0
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return m


def classify(mat_name):
    n = mat_name.lower()
    if "red" in n:
        return "red"
    if "crystal" in n:
        return "stone"
    if "silver" in n:
        return "metal"
    if "coil" in n:
        return "teeth"
    if "rib" in n:
        return "rib"
    if "drawcord" in n:
        return "cord"
    return "fab"


def set_high_emission(colors):
    cache = {}
    for ob in HIGH_ALL:
        for slot, orig in zip(ob.material_slots, ORIG[ob.name]):
            key = classify(orig.name)
            if key not in cache:
                cache[key] = emission_mat(f"bake {key}", colors[key])
            slot.material = cache[key]


def restore_high():
    for ob in HIGH_ALL:
        for slot, orig in zip(ob.material_slots, ORIG[ob.name]):
            slot.material = orig


def bake_target(ob, img):
    m = bpy.data.materials.new(f"bake target {ob.name}")
    nt = m.node_tree
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.nodes.active = tex
    ob.data.materials.clear()
    ob.data.materials.append(m)


def do_bake(low, kind, img_name, noncolor=False, samples=4):
    img = bpy.data.images.new(img_name, S, S, alpha=False, float_buffer=False)
    if noncolor:
        img.colorspace_settings.name = "Non-Color"
    bake_target(low, img)
    for o in list(scene.objects):
        o.select_set(False)
    for o in HIGH_ALL:
        o.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    scene.cycles.samples = samples
    for o in (JB, LW):  # моделът за играта не бива да засенчва детайлния източник
        o.hide_render = o is not low
        for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
            setattr(o, attr, False)
    b = scene.render.bake
    b.use_selected_to_active = True
    b.cage_extrusion = 0.012
    b.max_ray_distance = 0.04
    b.margin = 12
    b.normal_space = "TANGENT"
    bpy.ops.object.bake(type=kind)
    path = os.path.join(TEX, img_name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    print(f"baked {img_name}", flush=True)
    return path


results = {}
for low, prefix in ((JB, "jbib"), (LW, "lowr")):
    restore_high()
    results[(prefix, "normal")] = do_bake(low, "NORMAL", f"{prefix}_normal_000", noncolor=True, samples=8)
    results[(prefix, "ao")] = do_bake(low, "AO", f"{prefix}_ao_000", noncolor=True, samples=args.samples)
    for letter, (cwname, pal) in PALETTES.items():
        cols = {k: lin(v) for k, v in pal.items()}
        cols.update({k: lin(v) for k, v in TRIM.items()})
        set_high_emission(cols)
        results[(prefix, letter)] = do_bake(low, "EMIT", f"{prefix}_albedo_{letter}", samples=4)
    spec = {k: lin("#1A1A1A") for k in ("fab", "rib", "teeth", "cord")}
    spec.update({"metal": (0.9, 0.9, 0.9, 1), "stone": (1, 1, 1, 1), "red": (1, 1, 1, 1)})
    set_high_emission(spec)
    results[(prefix, "spec")] = do_bake(low, "EMIT", f"{prefix}_specmask_000", noncolor=True, samples=4)
    restore_high()

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "bake_work.blend"))
import json  # noqa: E402

with open(os.path.join(OUT, "bake_manifest.json"), "w") as fh:
    json.dump({"size": S, "jbib_cell": JB_CELL, "lowr_cell": LW_CELL, "jbib_side": JB_SIDE, "lowr_side": LW_SIDE,
               "palettes": {k: v[1] for k, v in PALETTES.items()}}, fh, indent=1)
print("BAKE DONE", flush=True)
