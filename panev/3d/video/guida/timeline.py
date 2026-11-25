"""Shot list of the counterweight-guide film (seconds), shared by pose.py (Blender), assemble.py and the sound.
Owner's procedure (25.11.2026): plumb lines first; each SU on the wall (marked, drilled, two M10 anchors); then the
SG on its arm, snug only; the rail; the N1 clips; the rail to its plumb line; everything tight at the end.
VIDEO_FPS sets the frame rate: 24 for the light review clip, 60 for the 4K master."""
import os

FPS = int(os.environ.get("VIDEO_FPS", "24"))
DURATION = 105.0
SLUG = "Panev_guide-contrappeso-in-nove-passi"
MESH = "mesh/guida.json"
# the closing still is framed as the landing-door film's (owner): the whole mounted level, a slow push-in under the card
TIMELINE = [("intro", 0.0, 4.0), ("fili", 4.0, 12.0), ("trac", 12.0, 19.5), ("tracw", 19.5, 23.0),
            ("fora", 23.0, 30.0), ("fiss", 30.0, 40.0), ("fissw", 40.0, 44.0), ("sg", 44.0, 49.4),
            ("sg2", 49.4, 56.0), ("sgw", 56.0, 59.0), ("rail", 59.0, 66.0), ("graffe", 66.0, 70.2),
            ("graffe2", 70.2, 75.0), ("piombo", 75.0, 80.0), ("gap", 80.0, 82.4), ("livella", 82.4, 85.0),
            ("piombow", 85.0, 88.0), ("serr", 88.0, 98.0),
            ("hero", 98.0, 105.0)]
STEPS = [(4.0, 12.0), (12.0, 23.0), (23.0, 30.0), (30.0, 44.0), (44.0, 59.0), (59.0, 66.0), (66.0, 75.0),
         (75.0, 88.0), (88.0, 98.0)]
