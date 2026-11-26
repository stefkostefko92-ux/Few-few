"""blender -b --factory-startup -P run.py -- <out dir> <samples> <W>x<H> <t,t,...|f0-f1[:step]> [--save]: renders the frames."""
import json
import os
import sys
import time
import bpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film  # noqa: F401,E402 (the film's own build, pose, timeline and texts come first)
from build import build
from lib import script_args, use_device
from pose import pose
from timeline import FPS

ARGS = script_args()
out, samples, res, spec = ARGS[0], int(ARGS[1]), ARGS[2], ARGS[3]
W, H = map(int, res.split("x"))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
S = build(scene)
r = scene.render
r.engine = "CYCLES"
print("device:", use_device(scene), flush=True)
scene.cycles.samples = samples
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.015
scene.cycles.use_denoising = True
scene.cycles.max_bounces, scene.cycles.glossy_bounces, scene.cycles.diffuse_bounces, scene.cycles.transmission_bounces = 6, 4, 3, 4
scene.cycles.sample_clamp_indirect = 6.0
scene.cycles.seed = 7
r.use_persistent_data = True
r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
r.image_settings.file_format = "PNG"
r.image_settings.color_mode = "RGB"
r.image_settings.compression = 30
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
except TypeError:
    pass
os.makedirs(out, exist_ok=True)
if "-" in spec and "," not in spec:
    a, rest = spec.split("-")
    b, step = (rest.split(":") + ["1"])[:2]
    frames = list(range(int(a), int(b) + 1, int(step)))
else:
    frames = [round(float(x) * FPS) for x in spec.split(",")]
pts = {}
for f in frames:
    t0 = time.time()
    pts[f] = pose(S, f / FPS, scene)
    r.filepath = f"{out}/f{f:05d}.png"
    bpy.ops.render.render(write_still=True)
    print(f"frame {f} ({f / FPS:.2f} s) {time.time() - t0:.1f} s", flush=True)
    with open(f"{out}/pts-{frames[0]:05d}.json", "w") as fh:
        json.dump(pts, fh)
if "--save" in ARGS:
    bpy.ops.wm.save_as_mainfile(filepath=f"{out}/scene.blend")
