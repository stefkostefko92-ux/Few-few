"""The sounds of the tools in the landing-door film, on the frames that show them (the sounds themselves are in
foley.py). The times are those of pose.py and cut.py (they import bpy, so they are repeated here): move an action
there, move its sound here. The off-cuts land far down the shaft. In step 10 the middle bracket's first hole stops on a
rebar (a clang, the bit grinding on steel, the motor stalling), then its B is unbolted and swapped (middle.py).
render(n) → (dry, room send), both stereo."""
import numpy as np
from dsp import modal, place
from foley import tick, knock, clack, clonk, clink, scrape, marker_dot, marker_line, ratchet, drill, rebar_hit, grinder
from timeline import TIMELINE

CLOSE = {"asm", "drill", "front", "under", "cut", "drill10", "drill10b"}
MID = {"top3", "side", "swap10", "wide10b"}
# (socket on, first stroke, last stroke ends, total turn °, strokes, socket off, pan) — pose.py and middle.py
RATCHET = [(48.9, 48.9, 50.1, 120, 3, 50.1, 0.1), (50.5, 50.5, 51.7, 120, 3, 51.7, 0.1),
           (63.4, 63.6, 64.8, 60, 2, 65.0, 0.0), (79.8, 79.8, 81.2, 150, 3, 81.2, 0.15), (108.4, 108.4, 109.6, 120, 3, 109.6, 0.15)]
# rotary hammer: (bit spinning, in the wall) — step 4 (pose.py); step 10 (middle.py): the first run stops on the rebar
DRILL4 = (((33.3, 34.4), (34.9, 36.0)), ((33.55, 34.25), (35.15, 35.85)), None)
HIT = 91.45
DRILL10 = (((90.6, HIT),), ((90.75, HIT),), HIT)
DRILL10B = (((103.45, 104.25), (104.55, 105.35)), ((103.6, 104.1), (104.7, 105.2)), None)
T11 = 16.0  # step 11 came 16 s later when step 10 grew (cut.py)
GRINDER = [(98.8 + T11, 102.6 + T11, ((99.5 + T11, 101.7 + T11),), -0.05),
           (104.9 + T11, 108.8 + T11, ((105.4 + T11, 106.4 + T11), (107.25 + T11, 108.25 + T11)), 0.1)]  # cut.py
OFFCUT_DOWN = (102.85 + T11, 107.55 + T11, 109.4 + T11)  # each off-cut leaves its plate, ~1.15 s to the pit


def put(dry, wet, t, sig, gain, pan):
    """Places a sound as the shot hears it: close-ups louder and drier than the wide shots."""
    name = next((s for s, a, b in TIMELINE if a <= t < b), "hero")
    g, w = (1.0, 0.12) if name in CLOSE else (0.85, 0.18) if name in MID else (0.68, 0.26)
    place(dry, t, sig, gain * g, pan)
    place(wet, t, sig, gain * g * w, pan)


def render(n):
    dry, wet = np.zeros((2, n)), np.zeros((2, n))
    put(dry, wet, 4.8, scrape(1.8, 1500, 6000, 11, 120), 0.12, 0.0)            # step 1: A slides onto B
    put(dry, wet, 6.6, modal((650, 1500, 2900), (0.08, 0.05, 0.03), (1.0, 0.5, 0.3), 0.1, 12), 0.35, 0.0)
    for k, (a, b) in enumerate(((6.8, 7.8), (8.4, 9.4))):                      # joint and lock bolts
        put(dry, wet, a, scrape(b - a, 3000, 9000, 13 + k, 400), 0.05, 0.1)
        put(dry, wet, b, tick(15 + k), 0.4, 0.1)
    for t, p in ((16.0, -0.3), (16.2, 0.3), (38.2, -0.3), (38.25, 0.3), (86.2, 0.0), (100.6, 0.0), (106.7, 0.0)):
        put(dry, wet, t, knock(int(t * 10)), 0.55, p)                          # brackets against the wall
    for t, p in ((30.8, -0.2), (31.4, -0.2), (88.6, -0.1), (89.15, -0.1), (101.6, 0.0), (102.15, 0.0)):
        put(dry, wet, t, marker_dot(int(t * 10)), 0.15, p)                     # the marker through the slots
    for i, (runs, into, stall) in enumerate((DRILL4, DRILL10, DRILL10B)):
        t0, y = drill(21 + i, runs, into, stall)
        put(dry, wet, t0, y, 0.088, -0.1)
    put(dry, wet, HIT, rebar_hit(911), 0.5, -0.1)                              # step 10: the rebar
    for k, (a, b) in enumerate(((94.8, 95.6), (97.5, 98.3))):                  # the joint and lock bolts out, then in
        put(dry, wet, a, scrape(b - a, 3000, 9000, 950 + k, 400), 0.05, 0.1)
        put(dry, wet, a if k == 0 else b, tick(952 + k), 0.35, 0.1)
    put(dry, wet, 95.6, scrape(1.0, 1500, 6000, 960, 120), 0.1, -0.2)          # B DX off A's web, B SX on
    put(dry, wet, 96.4, scrape(1.0, 1500, 6000, 961, 120), 0.1, 0.2)
    put(dry, wet, 97.4, modal((650, 1500, 2900), (0.08, 0.05, 0.03), (1.0, 0.5, 0.3), 0.1, 962), 0.35, 0.1)
    for t, p in ((39.4, -0.3), (39.8, -0.3), (40.2, 0.3), (40.6, 0.3), (107.6, 0.0), (108.0, 0.0)):  # anchors in
        put(dry, wet, t - 0.6, scrape(0.6, 800, 4000, int(t * 10), 80), 0.06, p)
        put(dry, wet, t, tick(int(t * 10) + 1, 0.6), 0.35, p)
    for t, p, g in ((41.4, -0.3, 0.4), (43.6, 0.3, 0.4), (68.4, 0.0, 0.35), (75.4, 0.15, 0.35)):  # the level set down
        put(dry, wet, t, clack(int(t * 10)), g, p)
    for t, p in ((42.4, -0.3), (45.6, 0.3), (72.0, 0.0), (82.0, 0.15)):         # and lifted
        put(dry, wet, t, tick(int(t * 10), 0.8), 0.1, p)
    for i, r in enumerate(RATCHET):
        ratchet(put, dry, wet, *r[:6], r[6], 300 + 50 * i)
    put(dry, wet, 58.2, clonk(58), 0.6, 0.0)                                    # step 6: the sill on the A plates
    for t, p in ((62.8, -0.3), (62.85, 0.3), (111.6, 0.0)):                    # sill bolts up through the slots
        put(dry, wet, t, tick(int(t * 100), 1.1), 0.22, p)
    put(dry, wet, 96.3 + T11, tick(963, 2.2), 0.08, -0.1)                       # step 11: the marker along A
    put(dry, wet, 96.3 + T11, marker_line(964), 0.1, -0.1)
    for a, b in ((97.8 + T11, 98.6 + T11), (109.1 + T11, 109.9 + T11)):         # the sill back 10 mm, then flush
        put(dry, wet, a, scrape(b - a, 700, 5000, int(a * 10), 70), 0.12, 0.0)
        put(dry, wet, b, tick(int(b * 10), 0.9), 0.2, 0.0)
    for k, (a, b, cuts, p) in enumerate(GRINDER):
        put(dry, wet, a, grinder(a, b, cuts, 77 + k), 0.105, p)
    for t in OFFCUT_DOWN:
        place(dry, t, clink(int(t * 10)), 0.05, 0.1)
        place(wet, t, clink(int(t * 10)), 0.1, 0.1)
    return dry, wet
