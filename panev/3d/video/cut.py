"""Step 11, last of all (owner, 24.11.2026): each plate A is marked with the marker along the sill's front edge, the
sill is pushed back in the slots (18), the angle grinder cuts on the mark, the sill comes forward again, flush. Booleans
on A: a kerf that follows the disc's leading edge while it crosses the plate, then everything in
front of the cut plane; the off-cut is a copy of A kept by an intersecting box and drops into the shaft. Sparks are
ballistic streaks from the leading edge. Every state is a pure function of t (frames render in any order)."""
import math
import random
import bpy
from mathutils import Matrix, Vector
from lib import box
from grinder import HEAD_Y, N_SPARKS

Z_C = -0.045           # disc centre height: the nut stays under the sill (bottom at -0.028)
A_X = (-0.055, 0.005)  # plate A across x, relative to its pair
LEAD = 0.0605          # disc centre to its leading edge at plate A's height
RATE, SHUTTER, G = 440.0, 1 / 60, Vector((0, 0, -9.81))
A_TOP = -0.028         # top of plate A's platform = bottom of the sill
PUSH = 0.010           # the sill slides back 10 mm in the slots (18) for the disc, then returns flush
MARK = (96.3, 97.2)    # the marker draws on the left plate in the close-up; the others are marked by then
# pair, approach, traverse, retreat (s); the close-up cuts the left plate, the wide shot the middle and the right one
CUTS = [(0, (98.8, 99.5), (99.5, 101.7), (101.8, 102.6)),
        (2, (104.9, 105.4), (105.4, 106.4), (106.45, 106.75)),
        (1, (106.75, 107.25), (107.25, 108.25), (108.3, 108.8))]


def sill_push(t):
    """How far the sill is pushed back towards the wall (m): out for the cuts, back flush at the end."""
    return PUSH * (seg(t, 97.8, 98.6) - seg(t, 109.1, 109.9))


def build_cut(pairs):
    out = []
    for k, p in enumerate(pairs):
        A = p["A"]
        boxes = {n: box(f"{n}{k}", (1, 1, 1), None) for n in ("kerf", "big", "keep")}
        for b in boxes.values():
            b.hide_render = True
            b.display_type = "WIRE"
        mods = {}
        for n in ("kerf", "big"):
            m = A.modifiers.new(n, "BOOLEAN")
            m.operation, m.object, m.solver = "DIFFERENCE", boxes[n], "EXACT"
            m.show_render = m.show_viewport = False
            mods[n] = m
        off = bpy.data.objects.new(f"offcut{k}", A.data)
        bpy.context.scene.collection.objects.link(off)
        m = off.modifiers.new("keep", "BOOLEAN")
        m.operation, m.object, m.solver = "INTERSECT", boxes["keep"], "EXACT"
        off.hide_render = True
        line = box(f"markA{k}", (1, 1, 1), bpy.data.materials.get("mark"))
        line.hide_render = True
        out.append({"A": A, "boxes": boxes, "mods": mods, "off": off, "line": line})
    return out


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def seg(t, a, b):
    return ease((t - a) / (b - a))


def place(ob, centre, size):
    ob.matrix_world = Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0))


def schedule(front_y, pair_x):
    """Disc-centre keyframes of every cut: where it comes from, where the traverse starts and ends, where it leaves."""
    y_c = front_y - 0.0011
    out, prev = [], None
    for k, ap, tr, rt in CUTS:
        xl, xr = pair_x[k] + A_X[0], pair_x[k] + A_X[1]
        s = Vector((xl - LEAD, y_c, Z_C))
        e = Vector((xr - LEAD + 0.004, y_c, Z_C))
        far = prev if prev is not None else s + Vector((-0.06, -0.16, 0.05))
        gone = e + Vector((0.02, -0.16, 0.04))
        out.append({"k": k, "ap": ap, "tr": tr, "rt": rt, "far": far, "s": s, "e": e, "gone": gone, "xl": xl, "xr": xr, "y_c": y_c})
        prev = gone
    return out


def disc_at(c, t):
    if t < c["ap"][1]:
        return c["far"].lerp(c["s"], seg(t, *c["ap"]))
    if t < c["tr"][1]:
        return c["s"].lerp(c["e"], (t - c["tr"][0]) / (c["tr"][1] - c["tr"][0]))
    return c["e"].lerp(c["gone"], seg(t, *c["rt"]))


def pose_cut(S, t, front_y, pair_x):
    """Places grinder, cutters, off-cuts, sparks and their light for second t; returns overlay points."""
    G_ = S["grinder"]
    cuts = schedule(front_y, pair_x)
    rig = G_["rig"]
    live = next((c for c in cuts if c["ap"][0] <= t < c["rt"][1]), None)
    rig.hide_render = live is None
    for ch in rig.children_recursive:
        ch.hide_render = live is None
    spin = 1.0 if live is not None else 0.0
    G_["spin"].outputs[0].default_value = spin
    G_["disc"]["geo"] = spin
    if live is not None:
        rig.matrix_world = Matrix.Translation(disc_at(live, t)) @ Matrix.Rotation(math.pi, 4, "Z")
    for c in cuts:
        cut_plate(S["cuts"][c["k"]], c, t, front_y)
    sparks(G_, cuts, t)
    marks(S, cuts, t, front_y)
    pts = {}
    c0 = cuts[0]
    pts["cut_m"] = Vector(((c0["xl"] + c0["xr"]) / 2, front_y - 0.0005, A_TOP))
    pts["grinder"] = rig.matrix_world @ Vector((0.0, HEAD_Y + 0.026, 0.0))
    return pts


def marks(S, cuts, t, front_y):
    """The marker's line on each plate A along the sill's front edge; on the left plate it is drawn in the shot."""
    mk = S["marker"]
    for c in cuts:
        line = S["cuts"][c["k"]]["line"]
        k = seg(t, *MARK) if c["k"] == 0 else (1.0 if t >= MARK[1] else 0.0)
        line.hide_render = k <= 0.001
        if k > 0.001:
            x1 = c["xl"] + (c["xr"] - c["xl"]) * k
            place(line, Vector(((c["xl"] + x1) / 2, front_y - 0.001, A_TOP + 0.00008)), (x1 - c["xl"], 0.0018, 0.00016))
    c0 = cuts[0]
    if MARK[0] - 0.4 <= t < MARK[1] + 0.4:
        tip0 = Vector((c0["xl"], front_y - 0.0005, A_TOP + 0.0002))
        tip1 = Vector((c0["xr"], front_y - 0.0005, A_TOP + 0.0002))
        lift = Vector((0.03, -0.05, 0.08))
        if t < MARK[0]:
            tip = tip0 + lift * (1 - seg(t, MARK[0] - 0.4, MARK[0]))
        elif t < MARK[1]:
            tip = tip0.lerp(tip1, seg(t, *MARK))
        else:
            tip = tip1 + lift * seg(t, MARK[1], MARK[1] + 0.4)
        mk.hide_render = False
        for ch in mk.children_recursive:
            ch.hide_render = False
        mk.matrix_world = Matrix.Translation(tip) @ Matrix.Rotation(-0.35, 4, "Y") @ Matrix.Rotation(0.45, 4, "X") @ Matrix.Rotation(-math.pi / 2, 4, "X")


def cut_plate(cut, c, t, front_y):
    A, mods, bx, off = cut["A"], cut["mods"], cut["boxes"], cut["off"]
    t0, t1 = c["tr"]
    span_x = (c["xl"] - 0.01 + c["xr"] + 0.01) / 2
    if t < t0:
        phase, prog = 0, 0.0
    elif t < t1:
        phase, prog = 1, (t - t0) / (t1 - t0)
        lead = c["s"].x + LEAD + (c["e"].x - c["s"].x) * prog
        lo = c["xl"] - 0.004
        place(bx["kerf"], Vector(((lo + lead) / 2, c["y_c"], -0.12)), (max(lead - lo, 0.0005), 0.0012, 0.3))
    else:
        phase, prog = 2, 1.0
    back = c["y_c"] - 0.0006
    place(bx["big"], Vector((span_x, back - 0.2, -0.12)), (c["xr"] - c["xl"] + 0.02, 0.4, 0.3))
    mods["kerf"].show_render = mods["kerf"].show_viewport = phase == 1
    mods["big"].show_render = mods["big"].show_viewport = phase == 2
    A["geo"] = phase * 10 + round(prog, 4)
    tau = t - t1
    falling = phase == 2 and tau < 1.0
    off.hide_render = not falling
    if falling:
        ctr = Vector((span_x, front_y - 0.015, -0.045))
        drop = Matrix.Translation(ctr + Vector((0.01 * tau, -0.22 * tau, -0.5 * 9.81 * tau * tau))) @ \
            Matrix.Rotation(2.6 * tau, 4, Vector((1, 0.3, 0)).normalized()) @ Matrix.Translation(-ctr)
        off.matrix_world = drop @ A.matrix_world
        bx["keep"].matrix_world = drop @ bx["big"].matrix_world
        off["geo"] = round(tau, 4)


def sparks(G_, cuts, t):
    pool, light = G_["sparks"], G_["light"]
    for ob in pool:
        ob.hide_render = True
    light.hide_render = True
    light.data.energy = 0.0
    c = next((c for c in cuts if c["tr"][0] <= t < c["tr"][1] + 0.3), None)
    if c is None:
        return
    t0, t1 = c["tr"]
    if t < t1:
        light.hide_render = False
        lead = c["s"].x + LEAD + (c["e"].x - c["s"].x) * 0.5
        light.data.energy = 0.12
        light.location = Vector((lead, c["y_c"] - 0.005, Z_C - 0.012))
    n = math.floor((min(t, t1) - t0) * RATE)
    for slot in range(N_SPARKS):
        j = n - ((n - slot) % N_SPARKS)
        if j < 0:
            continue
        rnd = random.Random(c["k"] * 100003 + j)
        tb = t0 + j / RATE
        life = rnd.uniform(0.06, 0.28)
        age = t - tb
        if age < 0 or age > life:
            continue
        prog = (tb - t0) / (t1 - t0)
        lead = c["s"].x + LEAD + (c["e"].x - c["s"].x) * prog
        p0 = Vector((lead + rnd.uniform(-0.002, 0.001), c["y_c"] - 0.0008, rnd.uniform(-0.06, -0.03)))
        d = Vector((rnd.uniform(-0.45, 0.25), rnd.uniform(-0.35, 0.05), -1.0)).normalized()
        v0 = d * rnd.uniform(2.5, 7.0)
        p = p0 + v0 * age + G * (0.5 * age * age)
        v = v0 + G * age
        tail = p - v * min(SHUTTER, age)
        seg_v = p - tail
        ln = seg_v.length
        if ln < 1e-4:
            continue
        rot = Vector((0, 0, 1)).rotation_difference(seg_v / ln).to_matrix().to_4x4()
        ob = pool[slot]
        ob.matrix_world = Matrix.Translation(tail) @ rot @ Matrix.Diagonal((1.0, 1.0, ln, 1.0))
        glow = (1 - age / life) ** 0.6 * rnd.uniform(0.55, 1.0)
        ob.color = (glow, glow, glow, 1.0)
        ob["geo"] = round(glow, 3)
        ob.hide_render = False
