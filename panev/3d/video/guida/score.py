"""The music of the counterweight-guide film, on the engine of the landing-door film (../music.py), so the two sound
like one series: pad and electric piano for the plumb lines and the marking, a soft pulse from the drilling (23 s),
the full groove from the anchors (30 s), a counter-melody from the rail (59 s). Step 9, level and tighten (83 s),
drops to the held pulse, louder with every nut, and resolves on Dmaj9 with the finished level (98 s).
render(n) → stereo music, dry and reverb together."""
import music
from timeline import STEPS, DURATION

CUT = STEPS[-1][0]        # step 9: the level, then everything tight
FINAL = STEPS[-1][1]      # the hero shot
PLAN = music.Plan(
    cards=tuple(a for a, _ in STEPS), cut=CUT, final=FINAL, duration=DURATION, pulse=23, groove=30, counter=59,
    cutoff=((0, 500), (3.5, 1300), (4, 1600), (22.5, 2000), (23, 2400), (29.5, 2800), (30, 3300), (58.5, 3500),
            (59, 4100), (CUT - 0.5, 4300), (CUT, 900), (CUT + 12, 2400), (FINAL, 5200), (FINAL + 2.5, 2600), (DURATION, 1100)))


def render(n):
    return music.render(n, PLAN)
