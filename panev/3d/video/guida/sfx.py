"""The sounds of the counterweight-guide film, on the frames that show them (the shared sounds are in ../foley.py).
The times are read from the source of steps.py and pose.py (they import bpy): move an action there and its sound
moves with it. New here: the plumb line paying out of its reel, the SG landing on the SU's arm and sliding 20 mm along
it, the 5 m T50 rail sliding down the SG's flange and coming to rest, the forged N1 clips seating on the rail's foot.
The DX side works a beat behind and mostly off camera: in the close-ups on SX it is heard further off, on the right.
render(n) → (dry, room send), both stereo."""
import ast
import os
import numpy as np
from dsp import SR, ns, times, noise, band, peak, shape, modal, burst, place
from foley import tick, knock, clack, scrape, marker_dot, ratchet, drill, roughness
from timeline import TIMELINE

HERE = os.path.dirname(os.path.abspath(__file__))
CLOSE = {"trac", "fora", "fiss", "sg", "sg2", "gap", "piombo", "graffe", "serr"}
MID = {"intro", "graffe2", "livella"}
PAN = {"sx": -0.15, "dx": 0.4}
LEVEL = ((13.9, 14.9), (37.7, 39.1), (83.8, 85.2))  # pose.level_at: set down, lifted (steps 2, 4 and 9)


def literals(*files):
    """Module-level NAME = literal assignments of the given sources (the tables of steps.py and pose.py)."""
    out = {}
    for f in files:
        with open(os.path.join(HERE, f), encoding="utf-8") as fh:
            tree = ast.parse(fh.read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
                try:
                    out[node.targets[0].id] = ast.literal_eval(node.value)
                except (ValueError, TypeError, SyntaxError):
                    pass
    return out


T = literals("steps.py", "pose.py")


def put(dry, wet, t, sig, gain, pan, side="sx"):
    """Places a sound as the shot hears it: close-ups louder and drier than the wide shots; the DX side, off camera
    while the camera is on SX, softer and further in the room."""
    name = next((s for s, a, b in TIMELINE if a <= t < b), "hero")
    g, w = (1.0, 0.12) if name in CLOSE else (0.85, 0.18) if name in MID else (0.68, 0.26)
    if side == "dx" and (name in CLOSE or name in MID):
        g, w = 0.45 * g, 0.32
    place(dry, t, sig, gain * g, pan)
    place(wet, t, sig, gain * g * w, pan)


def reel(dur, seed):
    """The plumb line paying out of its reel: a plastic pawl clicking as fast as the line runs (eased), a faint hiss."""
    n = ns(dur)
    u = np.clip(times(n) / dur, 0, 1)
    speed = 6 * u * (1 - u) / 1.5
    clicks = np.diff(np.floor(np.cumsum(28 * speed) / SR), prepend=0) > 0
    y = np.zeros(n)
    for k, i in enumerate(np.nonzero(clicks)[0]):
        c = modal((2700, 4900, 7400), (0.012, 0.008, 0.006), (1.0, 0.6, 0.3), 0.02, seed + k, 0.05)
        j = min(n, i + len(c))
        y[i:j] += c[:j - i] * (0.7 + 0.3 * speed[i])
    hiss = shape(noise(n, seed + 999), lambda f: band(f, 3000, 9000)) * speed * 0.15
    return y + hiss


def clank(seed):
    """The SG set down on the SU's arm: two folded steel plates meeting, a short ring."""
    y = modal((520, 1240, 2380, 3900), (0.12, 0.08, 0.05, 0.03), (1.0, 0.55, 0.35, 0.18), 0.25, seed)
    y[:ns(0.012)] += 0.35 * burst(0.012, 600, 7000, 0.005, seed + 1)
    return y


def rail_slide(dur, seed):
    """The rail's foot sliding down the SG's flange: rough steel-on-steel, coloured by the rail's own ringing."""
    n = ns(dur)
    speed = np.sin(np.pi * np.clip(times(n) / dur, 0, 1))
    y = shape(noise(n, seed), lambda f: band(f, 250, 4500) * peak(f, 470, 8, 0.25) * peak(f, 1180, 7, 0.2)
              * peak(f, 2230, 6, 0.2))
    return y * roughness(n, 25, seed + 1) * speed


def rail_rest(seed):
    """The 5 m rail coming to rest on its line: a soft heavy thud and the long, low ring of the T."""
    y = modal((92, 236, 470, 790, 1180, 1650), (0.9, 0.8, 0.6, 0.45, 0.32, 0.22), (0.5, 1.0, 0.8, 0.5, 0.3, 0.18), 1.4,
              seed, 0.01)
    y[:ns(0.03)] += 0.3 * burst(0.03, 120, 1500, 0.015, seed + 1)
    return y


def bolts_in(dry, wet, table, seed, pan, gain=0.4):
    """Bolts and washers dropped through the slots (a light scrape), each seating with a tick."""
    for k, (a, b) in enumerate(table):
        put(dry, wet, a, scrape(b - a, 3000, 9000, seed + k, 400), 0.05, pan)
        put(dry, wet, b, tick(seed + 10 + k), gain, pan)


def spun_on(dry, wet, table, seed, pan):
    """Nuts spun on by hand: the thread's whir, then the nut sitting down on its grower."""
    for k, (a, b) in enumerate(table):
        put(dry, wet, a, scrape(b - a, 2500, 9000, seed + k, 300), 0.04, pan)
        put(dry, wet, b, tick(seed + 10 + k, 1.6), 0.2, pan)


def render(n):
    dry, wet = np.zeros((2, n)), np.zeros((2, n))
    for side, (a, b) in T["WIRE_IN"].items():                                  # 1: the plumb lines from the top
        put(dry, wet, a, reel(b - a, 40 + len(side)), 0.3, {"sx": -0.6, "dx": 0.6}[side], side)
    for side in ("sx", "dx"):
        p = PAN[side]
        s0 = 100 if side == "sx" else 200
        put(dry, wet, T["SU_IN"][side][1], knock(s0), 0.55, p, side)          # 2: the SU against the wall
        for j, dt in enumerate((0.45, 1.0)):                                    # the marker through the slots
            put(dry, wet, T["MARK"][side] + dt - 0.15, marker_dot(s0 + 1 + j), 0.15, p, side)
        a, b = T["SU_OUT"][side]
        put(dry, wet, a, scrape(0.4, 800, 4000, s0 + 3, 80), 0.05, p, side)
        t0 = T["DRILL"][side]                                                   # 3: two holes (pose.tools)
        runs = ((t0 + 0.35, t0 + 1.15), (t0 + 1.45, t0 + 2.25))
        into = ((t0 + 0.45, t0 + 1.1), (t0 + 1.55, t0 + 2.2))
        a, y = drill(s0 + 4, runs, into, None)
        put(dry, wet, a, y, 0.088, p - 0.05, side)
        put(dry, wet, T["SU_BACK"][side][1], knock(s0 + 5), 0.45, p, side)    # 4: back on its anchors
        for j in range(2):
            t1 = T["ANCH"][side] + 0.5 * j + 0.9
            put(dry, wet, t1 - 0.6, scrape(0.6, 800, 4000, s0 + 6 + j, 80), 0.06, p, side)
            put(dry, wet, t1, tick(s0 + 8 + j, 0.6), 0.35, p, side)
        put(dry, wet, T["SG_IN"][side][1] - 0.2, scrape(0.2, 1500, 6000, s0 + 10, 120), 0.06, p, side)  # 5: the SG
        put(dry, wet, T["SG_IN"][side][1], clank(s0 + 11), 0.4, p, side)
        a, b = T["RAIL_IN"][side]                                               # 6: the rail down its flange
        put(dry, wet, a, rail_slide(b - a, s0 + 12), 0.12, p, side)
        put(dry, wet, b, rail_rest(s0 + 13), 0.3, p, side)
        a, b = T["ALIGN"][side]                                                 # 7: the SG slid 20 mm to the foot
        put(dry, wet, a, scrape(b - a, 600, 5000, s0 + 14, 50), 0.15, p, side)
        put(dry, wet, b, tick(s0 + 15, 0.7), 0.3, p, side)
    p = PAN["sx"]
    for k, (down, up) in enumerate(LEVEL):                                       # the level set down and lifted
        put(dry, wet, down, clack(300 + k), 0.4 if k < 2 else 0.35, p)
        put(dry, wet, up, tick(310 + k, 0.8), 0.1, p)
    bolts_in(dry, wet, T["BOLT_TOP"]["sx"], 320, p)                             # 5: bolts from above, washers
    for k, (a, b) in enumerate(T["BOLT_LOW"]["sx"]):                            # large washer and grower below
        put(dry, wet, b, tick(330 + k, 1.4), 0.2, p)
    spun_on(dry, wet, T["SPIN_ON"]["sx"], 340, p)
    for k, (a, b) in enumerate(T["CLIP_IN"]["sx"]):                             # 8: the N1 clips onto the foot
        put(dry, wet, a, scrape(b - a, 1500, 7000, 350 + k, 150), 0.05, p)
        put(dry, wet, b, tick(352 + k, 0.75), 0.35, p)
    for k, (a, b) in enumerate(T["CSTACK_IN"]["sx"]):                           # washer and grower behind
        put(dry, wet, b, tick(360 + k, 1.5), 0.15, p)
    spun_on(dry, wet, T["CSPIN"]["sx"], 370, p)
    # the ratchet (pose.ratchet_at): anchors 120° in 3 strokes, SG snug 60° in 2, SG and clip nuts tight 150° in 3
    jobs = [(a, b, 120, 3) for a, b in T["ANCH_TIGHT"]["sx"]] + [(a, b, 60, 2) for a, b in T["SNUG"]["sx"]] + \
        [(a, b, 150, 3) for a, b in T["TIGHT"]["sx"] + T["CTIGHT"]["sx"]]
    for i, (a, b, total, k) in enumerate(jobs):
        ratchet(put, dry, wet, a, a, b, total, k, b, p + 0.05, 400 + 50 * i)
    return dry, wet
