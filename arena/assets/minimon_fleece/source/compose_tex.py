"""Сглобява текстурите от изпечените карти: цвят = албедо x смекчен AO, запълнена клетка за вътрешността, normal map."""
import json
import os
import sys

from PIL import Image, ImageChops, ImageFilter

src, dst = sys.argv[1], sys.argv[2]
os.makedirs(dst, exist_ok=True)
man = json.load(open(os.path.join(os.path.dirname(src.rstrip('/')), 'bake_manifest.json')))
S = man['size']
AO_STRENGTH = 0.4


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


for prefix in ('jbib', 'lowr'):
    ao = Image.open(os.path.join(src, f'{prefix}_ao_000.png')).convert('L').filter(ImageFilter.GaussianBlur(1.4))
    ao = ao.point(lambda v: int(255 - AO_STRENGTH * (255 - v)))
    ao_rgb = Image.merge('RGB', (ao, ao, ao))
    cu, cv = man[f'{prefix}_cell']
    cx, cy = int(cu * S), int((1 - cv) * S)
    half = max(6, int(0.012 / 1.45 * S))
    for letter, pal in man['palettes'].items():
        alb = Image.open(os.path.join(src, f'{prefix}_albedo_{letter}.png')).convert('RGB')
        diff = ImageChops.multiply(alb, ao_rgb)
        inner = tuple(int(c * 0.72) for c in hexrgb(pal['fab']))
        diff.paste(inner, (cx - half, cy - half, cx + half, cy + half))
        diff.save(os.path.join(dst, f'{prefix}_diff_000_{letter}_uni.png'), optimize=True)
    nrm = Image.open(os.path.join(src, f'{prefix}_normal_000.png')).convert('RGB')
    nrm.save(os.path.join(dst, f'{prefix}_normal_000.png'), optimize=True)
    r, g, b = nrm.split()
    Image.merge('RGB', (r, g.point(lambda v: 255 - v), b)).save(os.path.join(dst, f'{prefix}_normal_000_directx.png'), optimize=True)
    Image.open(os.path.join(src, f'{prefix}_specmask_000.png')).convert('L').save(os.path.join(dst, f'{prefix}_spec_000.png'), optimize=True)
    print(prefix, 'ok')
