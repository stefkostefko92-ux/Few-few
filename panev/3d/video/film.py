"""Which film the shared scripts make. VIDEO_FILM=<subfolder> (e.g. guida, the counterweight guides) puts that folder
first on sys.path, so its build, pose, timeline, texts, score and sfx are the ones imported; unset, it is the
landing-door film of this folder. Its renders, frames and outputs go under the film's own folder. Import it before
any of those modules (render.py, run.py, shot.py, assemble.py, audio.py and captions.py do)."""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = os.environ.get("VIDEO_FILM", "").strip()
DIR = os.path.join(HERE, NAME) if NAME else HERE
if not os.path.isdir(DIR):
    sys.exit(f"VIDEO_FILM={NAME}: no such film folder ({DIR})")
for p in (HERE, DIR):  # the film's folder ends up first
    if p in sys.path:
        sys.path.remove(p)
    sys.path.insert(0, p)
