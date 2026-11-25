#!/usr/bin/env python3
"""Генерира фона на героя: public/brand/hero.webp

    python3 scripts/make-hero.py

ЗАЩО Е ГЕНЕРИРАН, А НЕ СНИМКА. Кадър от GTA V или FiveM НЕ е свободен за
ползване — той е на Take-Two/Rockstar, а сайтът изрично обявява, че не е
свързан с тях; такава снимка твърди точно обратното. Стокова снимка пък иска
проследим лиценз за всеки файл. Затова фонът е НАШ: рисува се тук, детерминирано
(`random.seed`), тоест същият вход дава същия файл и историята в git е чиста.

Замяна със собствена снимка: сложи `public/brand/hero.{webp,jpg,png}` —
`page.tsx` я вдига сама и този скрипт става излишен. Търси тъмен, широк кадър с
празно място ВЛЯВО (там стои заглавието).

Иска Pillow. Инструмент за асети, пуска се на ръка — не е в гейта.
"""

import os

from PIL import Image, ImageDraw, ImageFilter
import random

W, H = 2400, 1200
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "brand", "hero.webp")


def main() -> None:
    random.seed(7)  # детерминирано: повторно пускане дава СЪЩИЯ файл
    img = Image.new("RGB", (W, H), (6, 10, 14))
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=(int(6 + 14 * t), int(10 + 38 * t), int(14 + 50 * t)))

    # Сиянието е ВДЯСНО, защото вляво стои заглавието и там фонът трябва да е тъмен.
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([W * 0.50, -H * 0.35, W * 1.18, H * 0.80], fill=(18, 120, 146))
    gd.ellipse([W * 0.70, H * 0.05, W * 1.08, H * 0.90], fill=(14, 96, 74))
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(200)), 0.62)
    d = ImageDraw.Draw(img)

    def skyline(base, mn, mx, col, wmn, wmx, lit, lit_col, density):
        x = -40
        while x < W + 60:
            w = random.randint(wmn, wmx)
            h = random.randint(mn, mx)
            d.rectangle([x, base - h, x + w, base], fill=col)
            if lit:
                for wy in range(base - h + 18, base - 14, 26):
                    for wx in range(x + 12, x + w - 10, 22):
                        if random.random() < density:
                            d.rectangle([wx, wy, wx + 7, wy + 11], fill=lit_col)
            x += w + random.randint(6, 26)

    # Два плана — далечният е по-блед и дава дълбочина.
    skyline(int(H * 0.86), 90, 300, (12, 20, 28), 70, 190, True, (40, 120, 140), 0.10)
    skyline(int(H * 0.94), 150, 470, (6, 11, 17), 90, 230, True, (64, 205, 232), 0.20)
    d.rectangle([0, int(H * 0.94), W, H], fill=(4, 7, 11))

    # Следи от фарове — една топла, една студена; размити, за да не крещят.
    trail = Image.new("RGB", (W, H), (0, 0, 0))
    td = ImageDraw.Draw(trail)
    td.line([(W * 0.04, H * 0.965), (W * 0.99, H * 0.920)], fill=(180, 55, 40), width=8)
    td.line([(W * 0.04, H * 0.988), (W * 0.99, H * 0.945)], fill=(40, 130, 160), width=8)
    img = Image.blend(img, trail.filter(ImageFilter.GaussianBlur(10)), 0.55)

    img.save(OUT, "WEBP", quality=82, method=6)
    print(f"{OUT}: {round(os.path.getsize(OUT) / 1024, 1)} KB · {img.size}")


if __name__ == "__main__":
    main()
