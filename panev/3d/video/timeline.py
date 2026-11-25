"""Shot list of the mounting video (seconds) — shared by pose.py (Blender) and assemble.py (no bpy).
VIDEO_FPS sets the frame rate: 24 for the light review clip, 60 for the 4K master. One rate everywhere."""
import os

FPS = int(os.environ.get("VIDEO_FPS", "24"))
DURATION = 133.0
# step 10 (owner, 24.11.2026): the middle bracket goes up DX, its first hole stops on a rebar, its B DX is swapped for
# a B SX on the same A DX (they are interchangeable), and it is fixed 65 mm aside
TIMELINE = [("intro", 0.0, 4.0), ("asm", 4.0, 13.0), ("pos", 13.0, 21.0), ("top3", 21.0, 30.0),
            ("drill", 30.0, 36.5), ("work2", 36.5, 48.0), ("front", 48.0, 55.0), ("wide6", 55.0, 61.0),
            ("under", 61.0, 67.0), ("wide8", 67.0, 74.0), ("side", 74.0, 84.0), ("wide10", 84.0, 88.0),
            ("drill10", 88.0, 94.5), ("swap10", 94.5, 101.0), ("drill10b", 101.0, 107.5), ("wide10b", 107.5, 112.0),
            ("cut", 112.0, 120.5), ("cutw", 120.5, 127.0), ("hero", 127.0, 133.0)]
STEPS = [(4.0, 13.0), (13.0, 21.0), (21.0, 30.0), (30.0, 48.0), (48.0, 55.0), (55.0, 61.0), (61.0, 67.0),
         (67.0, 74.0), (74.0, 84.0), (84.0, 112.0), (112.0, 127.0)]
