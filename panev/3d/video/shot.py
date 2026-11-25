"""blender -b --factory-startup -P shot.py -- <shot> <out dir> <spp> [t0 t1]: renders one camera shot frame by frame. The first frame
is rendered whole; after that only the screen region where something moved (objects at the previous and the
current pose, plus their shadows on the wall and the floor) is rendered and saved as a crop with its offset.
assemble.py rebuilds the frames. Same seed and settings everywhere, so unchanged pixels match."""
import json
import math
import os
import sys
import time
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import film  # noqa: F401,E402 (the film's own build, pose, timeline and texts come first)
from build import build
from lib import script_args, use_device
from pose import pose
from timeline import FPS, DURATION, TIMELINE

ARGS = script_args()
shot, out, spp = ARGS[0], ARGS[1], int(ARGS[2])
HOLD = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"hold-{shot}")
while os.path.exists(HOLD):  # a shot can be held back while its props are being replaced
    time.sleep(10)
a, b = next((x, y) for n, x, y in TIMELINE if n == shot)
t0 = float(ARGS[3]) if len(ARGS) > 3 else max(0.0, a - 0.25)
t1 = float(ARGS[4]) if len(ARGS) > 4 else min(DURATION, b + 0.25)
W, H = map(int, os.environ.get("VIDEO_RES", "1920x1080").split("x"))
MARGIN = round(36 * W / 1920)
DRY = os.environ.get("DRY") == "1"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
S = build(scene)
r = scene.render
r.engine = "CYCLES"
c = scene.cycles
c.samples, c.use_adaptive_sampling, c.adaptive_threshold, c.use_denoising = spp, True, 0.015, True
print("device:", use_device(scene), flush=True)
c.max_bounces, c.glossy_bounces, c.diffuse_bounces, c.transmission_bounces = 6, 4, 3, 4
c.sample_clamp_indirect, c.seed = 6.0, 7
r.use_persistent_data = True
r.resolution_x, r.resolution_y, r.resolution_percentage = W, H, 100
r.image_settings.file_format, r.image_settings.color_mode, r.image_settings.compression = "PNG", "RGB", 15
scene.view_settings.view_transform = "AgX"
try:
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.3
except TypeError:
    pass
os.makedirs(out, exist_ok=True)

meshes = [o for o in scene.objects if o.type == "MESH"]
lamps = [o for o in scene.objects if o.type == "LIGHT"]
LAMPS = {o.name for o in lamps}
lights = []  # the key light's corners (its penumbra), the centres of the weaker fill and top lights
for k in ("key", "fill", "top"):
    L = S["lights"][k]
    pts_l = [(sx, sy) for sx in (-0.5, 0.5) for sy in (-0.5, 0.5)] if k == "key" else [(0, 0)]
    for sx, sy in pts_l:
        lights.append(L.matrix_world @ Vector((sx * L.data.size, sy * L.data.size_y, 0)))
REACH = round(260 * W / 1920)  # px: a shadow further than this from its object is too soft and faint to matter
cam = S["cam"]
CAM = "\0camera"  # its key in state(): no object can be called that


def state():
    st = {}
    for o in meshes:
        vis = not o.hide_render
        m = tuple(round(v, 7) for row in o.matrix_world for v in row) if vis else None
        st[o.name] = (vis, m, o.get("geo"))  # geo: a boolean cut or a material state that moves no matrix
    for o in lamps:  # a light that switches or moves relights everything: render the frame whole
        st[o.name] = (not o.hide_render, round(o.data.energy, 4), tuple(round(v, 6) for row in o.matrix_world for v in row))
    st[CAM] = (tuple(round(v, 7) for row in cam.matrix_world for v in row), round(cam.data.lens, 4),
               round(cam.data.dof.focus_distance, 5))  # a camera move (step 10's push-in): whole frames too
    return st


def corners(o):
    return [o.matrix_world @ Vector(c) for c in o.bound_box]


def shadow_points(pts):
    W0 = S["wall"].matrix_world.translation
    n = (S["wall"].matrix_world.to_3x3() @ Vector((0, 1, 0))).normalized()
    outp = []
    for p in pts:
        for L in lights:
            d = p - L
            den = d.dot(n)
            if abs(den) > 1e-6:
                lam = (W0 - p).dot(n) / den
                if 0 < lam < 4:
                    outp.append(p + d * lam)
            if p.z > 0.0005 and d.z < -1e-6:
                lam = -p.z / d.z
                if 0 < lam < 4:
                    outp.append(p + d * lam)
    return outp


def screen_box(pts):
    xs, ys = [], []
    for p in pts:
        q = world_to_camera_view(scene, cam, p)
        if q.z <= 0:
            return (0, 0, W, H)  # behind the camera: render it all
        xs.append(q.x * W); ys.append((1 - q.y) * H)
    return (min(xs), min(ys), max(xs), max(ys))


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


log = {"shot": shot, "frames": {}}
prev, prev_corners = None, {}
f0, f1 = round(t0 * FPS), round(t1 * FPS)
start = f0
if os.path.exists(f"{out}/log.json"):  # resume: continue after the last saved frame with a whole frame
    log = json.load(open(f"{out}/log.json"))
    done = sorted(int(k) for k in log["frames"])
    start = done[-1] + 1 if done else f0
for f in range(start, f1 + 1):
    tic = time.time()
    t = f / FPS
    pts = pose(S, t, scene, shot)
    st = state()
    cur_corners = {o.name: corners(o) for o in meshes if st[o.name][0]}
    entry = {"pts": pts}
    if prev is None:
        region = (0, 0, W, H)
    else:
        changed = [n for n in st if st[n] != prev[n]]
        if not changed:
            region = None
        elif (LAMPS | {CAM}) & set(changed):
            region = (0, 0, W, H)
        else:
            pts3 = []
            for n in changed:
                pts3 += cur_corners.get(n, []) + prev_corners.get(n, [])
            ob = screen_box(pts3)
            sb = screen_box(shadow_points(pts3) or pts3)
            sb = (max(sb[0], ob[0] - REACH), max(sb[1], ob[1] - REACH), min(sb[2], ob[2] + REACH), min(sb[3], ob[3] + REACH))
            box = union([ob, sb])
            x0, y0 = max(0, int(box[0] - MARGIN)), max(0, int(box[1] - MARGIN))
            x1, y1 = min(W, int(math.ceil(box[2] + MARGIN))), min(H, int(math.ceil(box[3] + MARGIN)))
            region = (x0, y0, x1, y1) if x1 - x0 > 4 and y1 - y0 > 4 else None
            if region and (x1 - x0) * (y1 - y0) > 0.7 * W * H:
                region = (0, 0, W, H)
    if region is None:
        entry["kind"] = "same"
    else:
        x0, y0, x1, y1 = region
        full = region == (0, 0, W, H)
        r.use_border = not full
        r.use_crop_to_border = not full
        if not full:
            r.border_min_x, r.border_max_x = (x0 + 0.001) / W, (x1 - 0.001) / W
            r.border_min_y, r.border_max_y = 1 - (y1 - 0.001) / H, 1 - (y0 + 0.001) / H
        r.filepath = f"{out}/f{f:05d}.png"
        if not DRY:
            bpy.ops.render.render(write_still=True)
        entry["kind"] = "full" if full else "crop"
        entry["box"] = [x0, y0, x1, y1]
    log["frames"][f] = entry
    prev, prev_corners = st, cur_corners
    print(f"frame {f} t={t:.2f} {entry['kind']} {entry.get('box', '')} {time.time() - tic:.1f}s", flush=True)
    if f % 12 == 0 or f == f1:
        with open(f"{out}/log.json", "w") as fh:
            json.dump(log, fh)
