# -*- coding: utf-8 -*-
"""Изрязва корицата (преден и заден капак) от снимка на ТЕЦ „Бобов дол“ (Голямо село).

Източник: Wikimedia Commons, „Sunset above power plant (Unsplash).jpg“ — Viktor Kiryanov, CC0.
Пускане:  python3 prep_cover.py <снимка.jpg>   → photos/cover-bobov-dol.jpg, photos/cover-bobov-dol-back.jpg
Страница A5 е с отношение 0,706; изрязва се портретна част с тази пропорция.
"""
import sys
import numpy as np
from PIL import Image, ImageEnhance

src = Image.open(sys.argv[1]).convert('RGB')
w, h = src.size
cw = int(round(h * 148.0 / 210.0))               # ширина на портретното изрязване (A5)
OUT = 'photos/'


def crop(x0_frac):
    x0 = int(round(x0_frac * w))
    x0 = max(0, min(w - cw, x0))
    im = src.crop((x0, 0, x0 + cw, h))
    # леко повдигане на сенките и контраста (като при печат)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Color(im).enhance(1.04)
    return im


def veil(im, layers, color=(5, 8, 16)):
    """Затъмняване с вертикален градиент на прозрачност, „изпечено“ в снимката.
    layers: списък (y0, y1, a0, a1) — дялове от височината, отгоре надолу; прозрачността расте/пада линейно."""
    a = np.asarray(im).astype(np.float32)
    H = a.shape[0]
    alpha = np.zeros(H, dtype=np.float32)
    for y0, y1, a0, a1 in layers:
        r0, r1 = int(y0 * H), int(y1 * H)
        t = np.linspace(a0, a1, max(1, r1 - r0), dtype=np.float32)
        alpha[r0:r1] = 1 - (1 - alpha[r0:r1]) * (1 - t)
    out = a * (1 - alpha[:, None, None]) + np.array(color, dtype=np.float32)[None, None, :] * alpha[:, None, None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))


# горе — за заглавието; долу — за автора (корица); целият заден капак — по-тъмен за четливост
VEIL_FRONT = [(0.0, 0.50, 0.78, 0.0), (0.76, 1.0, 0.0, 0.80)]
VEIL_BACK = [(0.0, 1.0, 0.62, 0.62), (0.0, 0.40, 0.30, 0.0), (0.65, 1.0, 0.0, 0.35)]

target_w = 1700                                    # ≈ 400 dpi на A5; без увеличаване над оригинала
for name, frac in (('cover-bobov-dol.jpg', 0.255), ('cover-bobov-dol-back.jpg', 0.62)):
    im = crop(frac)
    if im.width > target_w:
        im = im.resize((target_w, int(round(im.height * target_w / im.width))), Image.LANCZOS)
    im = veil(im, VEIL_FRONT if name == 'cover-bobov-dol.jpg' else VEIL_BACK)
    im.save(OUT + name, 'JPEG', quality=90, optimize=True, subsampling=0)
    print(name, im.size)
