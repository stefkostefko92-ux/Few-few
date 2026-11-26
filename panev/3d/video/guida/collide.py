"""VIDEO_FILM=guida blender -b -P collide.py [-- step]: the realism check of the counterweight-guide film (owner,
25.11.2026: nothing may pass through anything). Every `step` seconds (default 1/12) it poses the scene and tests, with
triangle BVHs in world space, the tools (ratchet, drill, marker, level) and the plumb lines against the brackets, the
rails, the clips, the hardware and the wall. Intended contacts are left out: the socket swallowing its nut and the
stud or shank end, the bit and the marker tip at the wall, the level on the face it reads. Prints every hit; exit 1
when there is one."""
import os
import sys
sys.path[:0] = [os.path.dirname(os.path.dirname(os.path.abspath(__file__)))]
os.environ.setdefault("VIDEO_FILM", "guida")
import film  # noqa: E402,F401
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402
from build import build  # noqa: E402
from lib import script_args  # noqa: E402
from pose import pose  # noqa: E402
from timeline import DURATION  # noqa: E402

HW = ("nut", "stud", "bolt", "shank", "grower", "washer", "bigbot", "bigtop", "anchor")
TOOLS = ("ratchet", "drill", "marker", "level")


def visible(ob):
    return ob.type == "MESH" and not ob.hide_render


def world_bvh(ob):
    mw = ob.matrix_world
    me = ob.data
    return BVHTree.FromPolygons([mw @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons], epsilon=0.0)


def box(ob):
    cs = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
    return [min(c[i] for c in cs) for i in range(3)], [max(c[i] for c in cs) for i in range(3)]


def near(a, b, pad=0.002):
    return all(a[0][i] - pad <= b[1][i] and b[0][i] - pad <= a[1][i] for i in range(3))


def tool_of(ob):
    while ob is not None:
        if ob.name in TOOLS:
            return ob.name
        ob = ob.parent
    return None


def allowed(tool, part, other):
    if tool == "ratchet" and part.startswith(("rt-socket", "rt-band", "rt-drive")) and any(h in other for h in HW):
        return True  # the deep socket over the nut, the stud's or the shank's end inside it
    if tool in ("drill", "marker") and other == "wall":
        return True
    if tool == "drill" and other.startswith(("hole", "dust")):
        return True
    if tool == "level" and other.startswith(("SU-sx0", "rail-sx")):
        return True  # resting on the plate, then against the blade
    return False


def main():
    step = float(script_args()[0]) if script_args() else 1 / 12
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    S = build(scene)
    hits, t = [], 0.0
    wall = None  # the wall never moves: one tree
    while t < DURATION:
        pose(S, t, scene)
        bpy.context.view_layer.update()
        obs = [o for o in scene.objects if visible(o)]
        tools = [o for o in obs if tool_of(o)]
        lines = [o for o in obs if o.name.endswith("-line")]
        if tools or lines:
            others = [o for o in obs if not tool_of(o) and o not in lines]
            boxes = {o.name: box(o) for o in others}
            trees = {}
            for o in tools + lines:
                tool = tool_of(o) or "line"
                ob_box, b = box(o), None
                for other in others:
                    name = other.name
                    if tool == "line" and (name == "wall" or name.endswith("-bobbody")):
                        continue
                    if allowed(tool, o.name, name) or not near(ob_box, boxes[name]):
                        continue
                    if name == "wall":
                        wall = wall or world_bvh(other)
                        tree = wall
                    else:
                        tree = trees.get(name) or trees.setdefault(name, world_bvh(other))
                    b = b or world_bvh(o)
                    if b.overlap(tree):
                        hits.append((round(t, 3), o.name, name))
        t = round(t + step, 6)
    for h in hits:
        print("HIT", *h)
    print(f"collide: {len(hits)} hits")
    sys.exit(1 if hits else 0)


main()
