"""python3 assemble.py <render root> <out dir> [f0 f1]: rebuilds every shot from its full frame and crops,
cross-dissolves between shots (0.5 s), slowly pushes in on the two stills (intro, closing), lays the Italian
overlay on top, fades in from and out to black and writes the VIDEO_OUT frames (1920x1080 or 3840x2160) for ffmpeg."""
import json
import os
import sys
import numpy as np
from PIL import Image
from overlay import frame_overlay, OW as W, OH as H
from postfx import finish

from timeline import FPS, DURATION as DUR, TIMELINE
DISSOLVE = 0.5
FADE_IN, FADE_OUT = 0.5, 1.0  # seconds from black at the start, to black at the end
STILLS = {"intro": (1.0, 1.04), "hero": (1.0, 1.05)}
root, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
F0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
F1 = int(sys.argv[4]) if len(sys.argv) > 4 else round(DUR * FPS) - 1


def feather(w, h, left, top, right, bottom, r=14):
    m = np.ones((h, w), np.float32)
    ramp = np.linspace(0, 1, r + 2, dtype=np.float32)[1:-1]
    k = min(r, w // 2, h // 2)
    if k <= 0:
        return m
    ramp = ramp[:k]
    if left:
        m[:, :k] *= ramp[None, :]
    if right:
        m[:, -k:] *= ramp[::-1][None, :]
    if top:
        m[:k, :] *= ramp[:, None]
    if bottom:
        m[-k:, :] *= ramp[::-1][:, None]
    return m


class Shot:
    def __init__(self, name):
        self.dir = f"{root}/{name}"
        self.log = json.load(open(f"{self.dir}/log.json"))["frames"]
        self.frames = sorted(int(k) for k in self.log)
        self.img, self.at = None, None

    def get(self, f):
        f = max(self.frames[0], min(self.frames[-1], f))
        start = self.frames[0] if self.at is None or f < self.at else self.at + 1
        for g in range(start, f + 1):
            e = self.log[str(g)]
            if e["kind"] == "full":
                self.img = np.asarray(Image.open(f"{self.dir}/f{g:05d}.png").convert("RGB"), np.float32)
            elif e["kind"] == "crop":
                x0, y0, x1, y1 = e["box"]
                crop = np.asarray(Image.open(f"{self.dir}/f{g:05d}.png").convert("RGB"), np.float32)
                h, w = crop.shape[:2]
                y0 = y1 - h  # Blender keeps the left and bottom edges of the border exact
                x1 = x0 + w
                RH, RW = self.img.shape[:2]
                m = feather(w, h, x0 > 0, y0 > 0, x1 < RW, y1 < RH)[..., None]
                self.img[y0:y1, x0:x1] = self.img[y0:y1, x0:x1] * (1 - m) + crop * m
        self.at = f
        return self.img

    def pts(self, f):
        f = max(self.frames[0], min(self.frames[-1], f))
        return self.log[str(f)]["pts"]


def still(name, t):
    a, b = next((x, y) for n, x, y in TIMELINE if n == name)
    img = STILL_IMG[name]
    z0, z1 = STILLS[name]
    k = (t - (a - DISSOLVE / 2)) / ((b + DISSOLVE / 2) - (a - DISSOLVE / 2))
    z = z0 + (z1 - z0) * max(0, min(1, k))
    sw, sh = img.size
    cw, ch = sw / z, sh / z
    box = ((sw - cw) / 2, (sh - ch) / 2, (sw + cw) / 2, (sh + ch) / 2)
    return np.asarray(img.resize((W, H), Image.LANCZOS, box=box), np.float32)


STILL_IMG = {n: Image.open(f"{root}/{n}.png").convert("RGB") for n in STILLS if os.path.exists(f"{root}/{n}.png")}
shots = {n: Shot(n) for n, *_ in TIMELINE if n not in STILLS and os.path.exists(f"{root}/{n}/log.json")}
STILL_PTS = {n: json.load(open(f"{root}/{n}.json")) for n in STILLS if os.path.exists(f"{root}/{n}.json")}


def smooth(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


for f in range(F0, F1 + 1):
    t = f / FPS
    parts = []
    for i, (n, a, b) in enumerate(TIMELINE):
        lo, hi = a - DISSOLVE / 2, b + DISSOLVE / 2
        if lo <= t < hi or (i == 0 and t < hi) or (i == len(TIMELINE) - 1 and t >= lo):
            w_in = 1.0 if i == 0 else smooth((t - lo) / DISSOLVE)
            w_out = 1.0 if i == len(TIMELINE) - 1 else 1 - smooth((t - (b - DISSOLVE / 2)) / DISSOLVE)
            parts.append((n, min(w_in, w_out)))
    tot = sum(w for _, w in parts)
    img = np.zeros((H, W, 3), np.float32)
    best = max(parts, key=lambda p: p[1])[0]
    for n, w in parts:
        src = still(n, t) if n in STILLS else shots[n].get(f)
        if src.shape[1] != W:  # review renders are smaller: up to the output size
            src = np.asarray(Image.fromarray(src.clip(0, 255).astype(np.uint8)).resize((W, H), Image.LANCZOS), np.float32)
        img += src * (w / tot)
    img = finish(img, f)
    pts = STILL_PTS.get(best, {}) if best in STILLS else shots[best].pts(f)
    frame = Image.fromarray(img.clip(0, 255).astype(np.uint8)).convert("RGBA")
    frame.alpha_composite(frame_overlay(t, pts))
    k = min(1.0, t / FADE_IN, (DUR - t) / FADE_OUT)
    frame = frame.convert("RGB")
    if k < 1.0:
        frame = Image.fromarray((np.asarray(frame, np.float32) * max(0.0, k)).astype(np.uint8))
    frame.save(f"{out}/v{f:05d}.png", compress_level=1)
    if f % 48 == 0:
        print("assembled", f, flush=True)
