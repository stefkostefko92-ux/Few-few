#!/usr/bin/env python3
"""Маха запечения фон от растерните значки и ги центрира еднакво.

    python3 scripts/fix-badges.py --dry-run      # само доклад, нищо не се пише
    python3 scripts/fix-badges.py                # пренаписва public/icons/badges/*.png

ЗАЩО СЪЩЕСТВУВА. Значките бяха изнесени НЕ върху прозрачност, а върху плътен
`(4, 7, 10)` — това е `ink-950`, фонът на самия сайт. Измерено: 67 от 71 файла
нямат алфа канал изобщо, а 77–92% от всеки е точно този цвят. На страницата
картите са `ink-900/70`, тоест по-светли от `ink-950` → всяка значка се
виждаше като по-тъмен правоъгълник около рисунката. Отгоре на това съдържанието
е изместено (при `esx`: 34 px отляво, 98 отгоре, но само 9 отдолу), затова
значките изглеждаха и накриво изрязани.

КАК. Алфата се вади по МЕКА рампа спрямо разстоянието до фона, не с праг:
рисунките носят сенки и ореоли, а двоичен ключ им реже ръба на стъпала. После
съдържанието се изрязва до реалната си кутия и се центрира на 256×256 с
еднакво поле — така всички значки заемат еднаква част от квадрата си и спират
да „скачат“ по размер една спрямо друга.

Оригиналите НЕ се пазят в отделна папка нарочно — те са в историята на git
(`git show <комит>:FiveM/public/icons/badges/<име>.png`), а второ копие в
репото само тежи. Скриптът е идемпотентен: пуснат втори път върху вече
поправен файл не намира плътен фон и го пропуска.

Иска Pillow (`pip install pillow`). Инструмент за АСЕТИ, пускан на ръка — не е
част от продукта, нито от качествения гейт.
"""

from __future__ import annotations

import argparse
import glob
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - зависи от средата
    sys.exit("Липсва Pillow: pip install pillow")

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "icons", "badges")

CANVAS = 256
"""Крайното платно. Значките се рендират 24–40 px, но източникът остава едър."""

CONTENT = 224
"""Колко от платното заема рисунката. 224/256 = 12,5% общо поле."""

LO, HI = 8, 28
"""Рампата на алфата: под LO е чист фон, над HI е чиста рисунка."""


def corners(image: Image.Image):
    w, h = image.size
    px = image.load()
    return [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]


def solid_background(image: Image.Image):
    """Цветът на фона, само ако И ЧЕТИРИТЕ ъгъла са един и същ цвят.

    Изискването е нарочно строго: значка с рисунка, опряла ъгъла, не бива да
    бъде „почистена“ по погрешка — по-добре я пропуснем и я докладваме.
    """
    found = corners(image.convert("RGB"))
    return found[0] if len(set(found)) == 1 else None


def key_out(image: Image.Image, background) -> Image.Image:
    """Прави фона прозрачен по мека рампа спрямо разстоянието до него."""
    rgba = image.convert("RGBA")
    px = rgba.load()
    br, bg, bb = background
    w, h = rgba.size
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            distance = max(abs(r - br), abs(g - bg), abs(b - bb))
            if distance <= LO:
                alpha = 0
            elif distance >= HI:
                alpha = 255
            else:
                alpha = round(255 * (distance - LO) / (HI - LO))
            px[x, y] = (r, g, b, alpha)
    return rgba


def recenter(image: Image.Image) -> Image.Image | None:
    """Изрязва до съдържанието и го центрира на квадратно платно."""
    box = image.getchannel("A").getbbox()
    if box is None:
        return None
    content = image.crop(box)
    w, h = content.size
    scale = CONTENT / max(w, h)
    resized = content.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.paste(resized, ((CANVAS - resized.width) // 2, (CANVAS - resized.height) // 2))
    return canvas


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    fixed, skipped, empty, already = [], [], [], []
    for path in sorted(glob.glob(os.path.join(ROOT, "*.png"))):
        name = os.path.splitext(os.path.basename(path))[0]
        image = Image.open(path)

        # Файл, който ВЕЧЕ носи прозрачност, само се центрира — не се ключва.
        # Иначе `convert("RGB")` изхвърля алфата, прозрачните ъгли излизат
        # черни, скриптът ги приема за „плътен черен фон“ и изяжда тъмните
        # части на самата рисунка. Точно това щеше да стане с `fivem`, `logo`,
        # `logo-mono` и `unknown`.
        rgba = image.convert("RGBA")
        transparent = rgba.getchannel("A").getextrema()[0] < 255
        if transparent:
            result = recenter(rgba)
            already.append(name)
        else:
            background = solid_background(image)
            if background is None:
                skipped.append((name, "ъглите са различни — рисунката може да опира ръба"))
                continue
            result = recenter(key_out(image, background))
        if result is None:
            empty.append(name)
            continue
        if not args.dry_run:
            result.save(path, "PNG", optimize=True)
        fixed.append(name)

    print(f"почистен фон : {len(fixed) - len(already)}")
    print(f"само центрирани (вече с алфа): {len(already)} — {', '.join(already) or 'няма'}")
    print(f"пропуснати: {len(skipped)}")
    for name, why in skipped:
        print(f"  · {name}: {why}")
    if empty:
        print(f"ПРАЗНИ след чистене (само фон?): {', '.join(empty)}")
    if args.dry_run:
        print("\n--dry-run: нищо не е записано.")
    return 1 if empty else 0


if __name__ == "__main__":
    raise SystemExit(main())
