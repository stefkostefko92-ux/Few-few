"""Motion helpers of the mounting video: frames from axes, visibility, easing, the technicians' hands, where each
bracket pair is at second t, B's plumb tilt, the anchor hardware going in, screen points."""
import math
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix, Vector
from lib import seg
from build import LEAN, PAIR_X

DEG = math.radians


def basis(z_axis, x_hint):
    z = Vector(z_axis).normalized()
    y = z.cross(Vector(x_hint)).normalized()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed().to_4x4()


def show(ob, on=True):
    ob.hide_render = not on
    for c in ob.children_recursive:
        c.hide_render = not on


def bump(t, a, b):
    x = (t - a) / (b - a)
    return math.sin(math.pi * min(1, max(0, x)))


def jitter(t, k):
    """A technician's hands: a millimetre of drift and a fraction of a degree."""
    ph = k * 1.7
    return (Matrix.Translation((0.0008 * math.sin(2.1 * t + ph), -0.0004 * (1 + math.sin(1.3 * t + ph)) / 2,
                                0.0009 * math.sin(1.7 * t + 2 * ph)))
            @ Matrix.Rotation(DEG(0.18) * math.sin(1.1 * t + ph), 4, "Y"))


def rig_pose(k, t):
    """matrix_basis of the left or right pair's rig (wall-local) at time t, or None when it is not on stage (the middle
    pair: middle.rig2)."""
    home = Matrix.Translation((PAIR_X[k], 0, 0))
    floating = Matrix.Translation((PAIR_X[k], -0.28, 0.0)) @ Matrix.Rotation(-LEAN, 4, "X")  # B upright, in the air
    away = Matrix.Translation((PAIR_X[k], -0.3, -0.16))
    if k == 1 and t < 13.0:
        return None
    if t < 13.0:
        return floating
    if t < 16.4:
        start = floating if k == 0 else Matrix.Translation((PAIR_X[1], -0.3, -0.12)) @ Matrix.Rotation(-LEAN, 4, "X")
        m = blend(start, home, seg(t, 13.8 + 0.2 * k, 16.0 + 0.2 * k))
        return m @ jitter(t, k) if t > 16.0 else m
    if t < 32.0:
        return home @ jitter(t, k)
    if t < 36.8:
        return blend(home, away, seg(t, 32.0, 32.8))
    if t < 38.4:
        return blend(away, home, seg(t, 36.8, 38.2)) @ (jitter(t, k) if t > 38.2 else Matrix.Identity(4))
    return home


def blend(a, b, k):
    ta, tb = a.to_translation(), b.to_translation()
    qa, qb = a.to_quaternion(), b.to_quaternion()
    return Matrix.Translation(ta.lerp(tb, k)) @ qa.slerp(qb, k).to_matrix().to_4x4()


def plumb_tilt(k, t):
    """In-plane tilt of B (about the wall normal) until it is set plumb with the level (step 4)."""
    if k == 2 or t < 38.4:
        return 0.0
    a, b = ((41.6, 42.6), (44.0, 45.0))[k]
    return DEG(0.6) * (1 - seg(t, a, b))


def screen(scene, cam, co):
    p = world_to_camera_view(scene, cam, co)
    return [round(p.x * 1920, 1), round((1 - p.y) * 1080, 1), round(p.z, 4)]


def hw_local(pair, tag, kind):
    for k, ob, base in pair["hw"][tag]:
        if k == kind:
            return base.copy()
    return Vector()


def hardware(pair, tag, t, t0, t1):
    on = t >= t0
    for kind, ob, base in pair["hw"][tag]:
        show(ob, on)
        side = 1 if base.x > 0 else -1
        k = seg(t, t0, t1)
        ob.location = base + Vector((side * 0.06 * (1 - k), 0, 0))
        ob.rotation_euler = (DEG(360) * (1 - k) if kind == "nut" else 0.0, 0, 0)
