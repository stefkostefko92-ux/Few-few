# -*- coding: utf-8 -*-
"""Генерира gerb_data.py от оригиналния растер (Wikimedia Commons, 132 × 190 px).

Само ЕЛЕМЕНТИТЕ в долното синьо поле (зъбно колело, дъга, чукове, житен клас) се трасират
от растера (potrace). Силуетът, полетата и надписът са чиста геометрия, измерена по оригинала;
светкавиците са един почистен полигон, повторен три пъти (в оригинала са еднакви).
Пускане:  python3 make_gerb_data.py <оригинален.png> > ../gerb_data.py
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
import potrace

SRC = sys.argv[1]
SC = 8
src = Image.open(SRC).convert('RGBA')
bg = Image.new('RGBA', src.size, (255, 255, 255, 255)); bg.alpha_composite(src)
rgb = np.asarray(bg.convert('RGB')).astype(int)
H0, W0 = rgb.shape[:2]


def classify(p):
    r, g, b = p
    if min(r, g, b) >= 200: return 0
    if r >= 120 and g <= 70 and b <= 70: return 2
    if b >= 100 and r <= 90 and g <= 90: return 3
    if r >= 140 and g >= 80 and b <= 100: return 1
    cents = {0: (255, 255, 255), 1: (255, 205, 0), 2: (205, 0, 0), 3: (0, 0, 170)}
    return min(cents, key=lambda k: sum((a - c) ** 2 for a, c in zip(p, cents[k])))


lab = np.array([[classify(rgb[y, x]) for x in range(W0)] for y in range(H0)], dtype=np.uint8)


def smooth_up(mask, sigma):
    m = Image.fromarray((mask * 255).astype(np.uint8)).resize((W0 * SC, H0 * SC), Image.BICUBIC)
    return np.asarray(m.filter(ImageFilter.GaussianBlur(SC * sigma))).astype(float)


soft = [smooth_up(lab == k, 0.66) for k in range(4)]
big = np.argmax(np.stack(soft), axis=0)
yy = np.arange(H0 * SC)[:, None] / SC
# злато в долното поле (орнаменти + рамка; рамката после се отрязва от клип-контура)
gold_low = (big == 1) & (yy >= 111.0)

bm = potrace.Bitmap(~gold_low)
curves = []
for curve in bm.trace(turdsize=40, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY,
                      alphamax=1.1, opticurve=True, opttolerance=0.6):
    segs = []
    sp = curve.start_point
    for s in curve.segments:
        if s.is_corner:
            segs.append(('L', round(s.c.x / SC, 2), round(s.c.y / SC, 2)))
            segs.append(('L', round(s.end_point.x / SC, 2), round(s.end_point.y / SC, 2)))
        else:
            segs.append(('C',) + tuple(round(v / SC, 2) for v in (s.c1.x, s.c1.y, s.c2.x, s.c2.y, s.end_point.x, s.end_point.y)))
    curves.append({'start': (round(sp.x / SC, 2), round(sp.y / SC, 2)), 'segs': segs})

print('# -*- coding: utf-8 -*-')
print('"""Данни за герба на Бобов дол (генерирани от make_gerb_data.py — не се редактират на ръка).')
print()
print('Оригинал: Wikimedia Commons, „Bobov.dol-coat-of-arms.png“ (132 × 190 px, обществено достояние).')
print('Координати: пиксели на оригинала (Y надолу).')
print('"""')
print()
print('ORNAMENTS = %r' % (curves,))
