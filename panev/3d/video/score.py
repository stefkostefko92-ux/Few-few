"""The music of the landing-door film (the engine is music.py): pad and electric piano for steps 1–3, a soft pulse from
the drilling (30 s), the full groove from the ratchet (48 s), a counter-melody for the levelling (67 s). The cutting
(112 s) drops to a held pulse under the grinder and resolves on Dmaj9 with the finished sill (127 s). render(n) →
stereo music, dry and reverb together."""
import music
from timeline import STEPS, DURATION

CUT, FINAL = STEPS[-1]                  # the cutting (112 s, bar 42) and the finished sill (127 s, hero shot)
PLAN = music.Plan(
    cards=tuple(a for a, _ in STEPS), cut=CUT, final=FINAL, duration=DURATION, pulse=30, groove=48, counter=67,
    cutoff=((0, 500), (3.5, 1300), (4, 1600), (29.5, 2000), (30, 2400), (47.5, 2800), (48, 3300), (83.5, 3500),
            (84, 4100), (CUT - 0.5, 4300), (CUT, 900), (CUT + 12, 2400), (FINAL, 5200), (FINAL + 2.5, 2600), (DURATION, 1100)))


def render(n):
    return music.render(n, PLAN)


if __name__ == "__main__":
    import sys
    import numpy as np
    from dsp import ns, write_wav
    y = render(ns(DURATION))
    write_wav(sys.argv[1] if len(sys.argv) > 1 else "music.wav", y / max(1e-9, np.max(np.abs(y))) * 0.7)
