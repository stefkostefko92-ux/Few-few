"""Path-traced renders of the landing page (Mitsuba 3, monochrome), made here so that no picture
comes from a third party.

    cd scripts/render
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/python render.py preview vano            # small and quick: out/vano.png
    .venv/bin/python render.py final                   # every shot: out/<shot>.png (16-bit masters)
    .venv/bin/python render.py develop vano            # the print again from out/vano.npy (exposure)
    npm run render:encode                              # (in rilievi/) masters → public/img/site (AVIF + WebP)

The image is developed here as a black and white print: exposure, a filmic shoulder, sRGB, a gentle
S-curve, a soft vignette and fine grain.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import mitsuba as mi
import numpy as np
from PIL import Image

mi.set_variant('llvm_ad_mono')

from scenes.bottoniera import bottoniera  # noqa: E402  (after the variant)
from scenes.tablet import tablet  # noqa: E402
from scenes.vano import vano  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / 'out'

SCENES = {'bottoniera': bottoniera, 'tablet': tablet, 'vano': vano}

# The shots of the page: scene, master size, samples per pixel, exposure.
SHOTS = [
    {'file': 'vano', 'scene': 'vano', 'width': 2400, 'height': 1350, 'spp': 768, 'exposure': 13.0},
    {'file': 'vano-portrait', 'scene': 'vano', 'width': 1200, 'height': 1600, 'spp': 768, 'exposure': 13.0},
    {'file': 'bottoniera', 'scene': 'bottoniera', 'width': 1600, 'height': 1200, 'spp': 768, 'exposure': 9.0},
    {'file': 'tablet', 'scene': 'tablet', 'width': 1600, 'height': 1200, 'spp': 768, 'exposure': 3.4},
]


def trace(name: str, width: int, height: int, spp: int) -> np.ndarray:
    """Linear luminance, rendered in passes of 16 samples (memory stays small) and averaged."""
    scene = mi.load_dict(SCENES[name](width, height))
    passes = max(1, spp // 16)
    total = np.zeros((height, width), np.float64)
    started = time.time()
    for i in range(passes):
        image = mi.render(scene, spp=16, seed=i)
        total += np.array(image, dtype=np.float64)[..., 0]
        if i % 8 == 7 or i == passes - 1:
            print(f'  {name}: {(i + 1) * 16}/{passes * 16} spp, {time.time() - started:.0f} s', flush=True)
    return (total / passes).astype(np.float32)


def defirefly(lum: np.ndarray, k: float = 4.0) -> np.ndarray:
    """Clamps isolated bright pixels (a path that found a small lamp by chance) to k × the local median."""
    padded = np.pad(lum, 1, mode='edge')
    h, w = lum.shape
    stack = np.stack([padded[y:y + h, x:x + w] for y in range(3) for x in range(3)])
    local = np.median(stack, axis=0)
    return np.minimum(lum, local * k + 1e-4)


def develop(lum: np.ndarray, exposure: float, seed: int = 7) -> np.ndarray:
    """From linear luminance to a 16-bit black and white print."""
    x = np.maximum(defirefly(lum) * exposure, 0)
    v = np.clip((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0, 1)
    v = np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(v, 1 / 2.4) - 0.055)
    v = v * 0.7 + v * v * (3 - 2 * v) * 0.3
    h, w = v.shape
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.hypot(xx - w / 2, yy - h / 2) / np.hypot(w / 2, h / 2)
    v *= 1 - 0.25 * r ** 2.2
    v += np.random.default_rng(seed).normal(0, 0.012, v.shape)
    return np.clip(v * 65535, 0, 65535).astype(np.uint16)


def save(name: str, print16: np.ndarray) -> Path:
    OUT.mkdir(exist_ok=True)
    path = OUT / f'{name}.png'
    Image.fromarray(print16).save(path)
    return path


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else 'preview'
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if mode == 'preview':
        name = only or 'vano'
        width = int(os.environ.get('W', 960))
        height = int(os.environ.get('H', 540))
        spp = int(os.environ.get('S', 64))
        exposure = float(os.environ.get('E', 1.0))
        started = time.time()
        lum = trace(name, width, height, spp)
        print(f'{name}: {width}×{height}, {spp} spp, {time.time() - started:.0f} s; '
              f'median {np.median(lum):.4f}, p99 {np.percentile(lum, 99):.3f}')
        print(save(name, develop(lum, exposure)))
        return
    for shot in SHOTS:
        if only and shot['file'] != only:
            continue
        started = time.time()
        linear = OUT / f"{shot['file']}.npy"
        if mode == 'develop':
            # Only the print again (exposure, curve) from the linear luminance of the last final.
            lum = np.load(linear)
        else:
            lum = trace(shot['scene'], shot['width'], shot['height'], shot['spp'])
            OUT.mkdir(exist_ok=True)
            np.save(linear, lum)
        path = save(shot['file'], develop(lum, shot['exposure']))
        print(f"{shot['file']}: {time.time() - started:.0f} s → {path}")


if __name__ == '__main__':
    main()
