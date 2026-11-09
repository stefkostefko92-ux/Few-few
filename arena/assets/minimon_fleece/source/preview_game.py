"""Рендерира модела за играта с готовите текстури (проверка) и изнася чистия .blend + FBX.

Пускане: python preview_game.py --work bake_work.blend --tex DIR --high HIGH.blend --out DIR
"""
import argparse
import math
import os
import sys

import bpy  # noqa: I001
import addon_utils
from mathutils import Vector

ap = argparse.ArgumentParser()
ap.add_argument("--work", required=True)
ap.add_argument("--tex", required=True)
ap.add_argument("--high", required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--samples", type=int, default=48)
args = ap.parse_args(sys.argv[1:])
OUT = os.path.abspath(args.out)
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=os.path.abspath(args.work))
addon_utils.enable("cycles", default_set=True)
addon_utils.enable("io_scene_fbx", default_set=True)
scene = bpy.context.scene

# маха източника на изпичането; остават само моделите за играта
for c in list(bpy.data.collections):
    if c.name.startswith("high detail"):
        for o in list(c.objects):
            bpy.data.objects.remove(o)
        bpy.data.collections.remove(c)
for o in list(scene.objects):
    if o.name not in ("jbib_000", "lowr_000"):
        bpy.data.objects.remove(o)
JB, LW = bpy.data.objects["jbib_000"], bpy.data.objects["lowr_000"]
for o in (JB, LW):
    o.hide_render = False
    for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(o, attr, True)


def game_mat(prefix, letter):
    m = bpy.data.materials.new(f"{prefix} {letter}")
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Sheen Weight"].default_value = 0.4
    d = nt.nodes.new("ShaderNodeTexImage")
    d.image = bpy.data.images.load(os.path.join(args.tex, f"{prefix}_diff_000_{letter}_uni.png"), check_existing=True)
    nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(os.path.join(args.tex, f"{prefix}_normal_000.png"), check_existing=True)
    n.image.colorspace_settings.name = "Non-Color"
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    sp = nt.nodes.new("ShaderNodeTexImage")
    sp.image = bpy.data.images.load(os.path.join(args.tex, f"{prefix}_spec_000.png"), check_existing=True)
    sp.image.colorspace_settings.name = "Non-Color"
    inv = nt.nodes.new("ShaderNodeMath")
    inv.operation = "SUBTRACT"
    inv.inputs[0].default_value = 0.9
    nt.links.new(sp.outputs["Color"], inv.inputs[1])
    nt.links.new(inv.outputs[0], bsdf.inputs["Roughness"])
    nt.links.new(sp.outputs["Color"], bsdf.inputs["Metallic"])
    return m


def assign(letter):
    for o, p in ((JB, "jbib"), (LW, "lowr")):
        o.data.materials.clear()
        o.data.materials.append(game_mat(p, letter))


assign("a")
for o in (JB, LW):
    o.data.polygons.foreach_set("use_smooth", [True] * len(o.data.polygons))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "minimon_fleece_game.blend"))
for o, p in ((JB, "jbib"), (LW, "lowr")):
    for x in scene.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.export_scene.fbx(filepath=os.path.join(OUT, f"{p}_000.fbx"), use_selection=True, apply_unit_scale=True,
                             axis_forward="-Z", axis_up="Y", path_mode="STRIP", mesh_smooth_type="FACE")
print("EXPORTED game blend + fbx", flush=True)

# ---- контролни рендери с манекен
with bpy.data.libraries.load(os.path.abspath(args.high), link=False) as (src, dst):
    dst.objects = [n for n in src.objects if n.split(".")[0] in ("Head", "Neck", "Hand right", "Hand left", "Foot right", "Foot left", "Ankle right", "Ankle left")]
for o in dst.objects:
    scene.collection.objects.link(o)
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.view_settings.view_transform = "Standard"
world = bpy.data.worlds.new("Studio")
scene.world = world
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.08


def area(loc, size, energy):
    ld = bpy.data.lights.new("l", "AREA")
    ld.shape = "DISK"
    ld.size = size
    ld.energy = energy * 0.2
    ob = bpy.data.objects.new("l", ld)
    scene.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0.95)) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return ob


lights = [area((-2.3, -2.9, 2.7), 2.4, 650), area((2.6, -2.2, 1.3), 3.0, 260), area((0.4, 3.0, 2.6), 2.0, 420), area((0, -0.4, 4.0), 3.0, 150)]
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(cam)
scene.camera = cam
cam.data.lens = 70
scene.render.resolution_x, scene.render.resolution_y = 700, 1120


def shot(name, deg, letter):
    assign(letter)
    a = math.radians(deg)
    loc = Vector((4.1 * math.sin(a), -4.1 * math.cos(a), 0.9))
    cam.location = loc
    cam.rotation_euler = (Vector((0, 0, 0.88)) - loc).to_track_quat("-Z", "Y").to_euler()
    for L, base in zip(lights, [(-2.3, -2.9, 2.7), (2.6, -2.2, 1.3), (0.4, 3.0, 2.6), (0, -0.4, 4.0)]):
        x, y, z = base
        L.location = (x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), z)
        L.rotation_euler = (Vector((0, 0, 0.95)) - L.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name, flush=True)


shot("game_front_a", 0, "a")
shot("game_back_b", 180, "b")
shot("game_hero_c", -32, "c")
print("PREVIEW DONE", flush=True)
