"""The 3/8" ratchet with a 17 mm deep socket that tightens every nut and bolt (owner, 24.11.2026; it replaces the
spanner). Modelled here, no brand: satin-chrome head with the direction lever, the quick-release button and two
screws, a bent chrome neck, a black rubber grip with green rings and a hanging hole. The socket is deep because the
anchor studs stand 7.4 mm proud of their nuts.
Local frame: the fastener's centre at the origin, the socket axis +Z away from it (mouth at z = MOUTH), the handle
along +X. stroke() turns a tightening into ratchet strokes: the handle swings forward with the nut, back without it."""
import math
from mathutils import Matrix
from lib import empty, cylinder, box, prism, node, material, noise, maprange, math_op
from grinder import lathe

MOUTH, SOCKET = -0.004, 0.063
HEAD_Z = MOUTH + SOCKET          # bottom of the head
HEAD_T, HEAD_R = 0.013, 0.0185
GRIP_Z = HEAD_Z + HEAD_T / 2 + 0.006


def chrome_satin(nt, b):
    """Polished chrome with a whisper of brushing and roughness variation."""
    br = noise(nt, 700.0, 4.0, 0.6, (1, 1, 60))
    bp = node(nt, "ShaderNodeBump", Strength=0.04, Distance=0.0001)
    nt.links.new(br.outputs["Fac"], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    nt.links.new(maprange(nt, noise(nt, 40.0, 3.0, 0.5), 0.08, 0.2).outputs["Result"], b.inputs["Roughness"])


def dimples(nt, b):
    """Rubber grip: a field of shallow round dimples and a fine grain."""
    co = nt.nodes.new("ShaderNodeTexCoord")
    vor = node(nt, "ShaderNodeTexVoronoi", Scale=260.0, Randomness=0.0)
    nt.links.new(co.outputs["Object"], vor.inputs["Vector"])
    cup = math_op(nt, "GREATER_THAN", vor.outputs["Distance"], val=0.32)
    grain = noise(nt, 1500.0, 3.0, 0.6)
    h = math_op(nt, "ADD", cup.outputs[0], math_op(nt, "MULTIPLY", grain.outputs["Fac"], val=0.3).outputs[0])
    bp = node(nt, "ShaderNodeBump", Strength=0.5, Distance=0.0006)
    nt.links.new(h.outputs[0], bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])


def head_outline(n=40):
    """The head seen along the socket axis: a round end blending into the neck (+X)."""
    pts = []
    for k in range(n + 1):
        a = math.radians(70 + 220 * k / n)
        pts.append((HEAD_R * math.cos(a), HEAD_R * math.sin(a)))
    pts += [(0.028, -0.0072), (0.036, -0.0062), (0.036, 0.0062), (0.028, 0.0072)]
    return pts


def build_ratchet(M):
    mats = {
        "chrome": material("rt-chrome", (0.9, 0.91, 0.93), 0.12, 1.0, chrome_satin),
        "black": material("rt-black", (0.012, 0.012, 0.014), 0.55, 0.0, dimples),
        "green": material("rt-green", (0.16, 0.75, 0.04), 0.5, 0.0),
        "dark": material("rt-dark", (0.02, 0.02, 0.022), 0.35, 0.0),
        "hole": material("rt-hole", (0.003, 0.003, 0.003), 0.9),
    }
    g = empty("ratchet")
    # deep socket: chamfered mouth, the 23.5 mm body, a slimmer drive end; the 12-point opening is dark inside
    lathe("rt-socket", [(MOUTH, 0.0), (MOUTH, 0.0101), (MOUTH + 0.0012, 0.0117), (MOUTH + 0.046, 0.0117),
                        (MOUTH + 0.052, 0.0101), (MOUTH + SOCKET - 0.001, 0.0101), (MOUTH + SOCKET, 0.0094), (MOUTH + SOCKET, 0.0)],
          mats["chrome"], g, axis="Z", segs=64, centre=(0, 0, 0))
    cylinder("rt-socket-hole", 0.0094, 0.0006, mats["hole"], segs=12, loc=(0, 0, MOUTH - 0.0001), parent=g)
    for k in range(2):  # the two rings of a laser-etched size band
        cylinder(f"rt-band{k}", 0.01175, 0.0004, mats["dark"], segs=64, loc=(0, 0, MOUTH + 0.03 + 0.005 * k), parent=g)
    cylinder("rt-drive", 0.0055, 0.004, mats["chrome"], segs=24, loc=(0, 0, HEAD_Z - 0.003), parent=g)
    head = prism("rt-head", head_outline(), HEAD_T, mats["chrome"], (), g, 0.002)
    head.location = (0, 0, HEAD_Z)
    cylinder("rt-cover", 0.0135, 0.0006, mats["chrome"], segs=64, loc=(0, 0, HEAD_Z + HEAD_T), bev=0.0002, parent=g)
    cylinder("rt-button", 0.0048, 0.0028, mats["dark"], segs=32, loc=(-0.002, 0, HEAD_Z + HEAD_T + 0.0004), bev=0.0008, parent=g)
    for sy in (-1, 1):
        cylinder(f"rt-screw{sy}", 0.0019, 0.0007, mats["hole"], segs=16, loc=(0.008, sy * 0.0085, HEAD_Z + HEAD_T + 0.0004), parent=g)
    lever = box("rt-lever", (0.011, 0.006, 0.003), mats["dark"], (0.0155, 0.0, HEAD_Z + HEAD_T + 0.0012), 0.0012, g)
    lever.rotation_euler = (0, 0, math.radians(18))
    # bent neck to the grip, then the grip along +X
    neck = lathe("rt-neck", [(0.03, 0.0), (0.03, 0.0062), (0.06, 0.0056), (0.084, 0.0058), (0.088, 0.0)], mats["chrome"], g,
                 axis="X", segs=32, centre=(0, 0, 0))
    bend = math.atan2(GRIP_Z - (HEAD_Z + HEAD_T / 2), 0.058)
    neck.matrix_basis = Matrix.Translation((0.03, 0, HEAD_Z + HEAD_T / 2)) @ Matrix.Rotation(-bend, 4, "Y") @ Matrix.Translation((-0.03, 0, 0))
    lathe("rt-collar", [(0.084, 0.0), (0.084, 0.0088), (0.094, 0.0094), (0.094, 0.0)], mats["green"], g,
          axis="X", segs=48, centre=(0, 0, GRIP_Z))
    lathe("rt-grip", [(0.093, 0.0), (0.093, 0.0098), (0.11, 0.0112), (0.15, 0.0122), (0.178, 0.0118), (0.192, 0.0106),
                      (0.198, 0.0085), (0.2, 0.0)], mats["black"], g, axis="X", segs=48, centre=(0, 0, GRIP_Z))
    lathe("rt-tip", [(0.186, 0.0), (0.186, 0.0116), (0.19, 0.0116), (0.19, 0.0)], mats["green"], g, axis="X", segs=48, centre=(0, 0, GRIP_Z))
    hole = cylinder("rt-hang", 0.0032, 0.024, mats["hole"], segs=24, loc=(0.194, -0.012, GRIP_Z), axis="Y", parent=g)
    hole.scale = (1.0, 1.0, 1.6)
    return g


def stroke(t, a, b, total, n=3):
    """Ratchet strokes over [a, b]: returns (handle angle, fastener angle). Each stroke swings the handle forward by
    total/n with the fastener (65 % of the time), then back alone."""
    if t <= a:
        return 0.0, 0.0
    if t >= b:
        return 0.0, total
    per = (b - a) / n
    i = min(n - 1, int((t - a) / per))
    u = (t - a - i * per) / per
    step = total / n
    if u < 0.65:
        k = u / 0.65
        k = k * k * (3 - 2 * k)
        return step * k, step * (i + k)
    k = (u - 0.65) / 0.35
    k = k * k * (3 - 2 * k)
    return step * (1 - k), step * (i + 1)
