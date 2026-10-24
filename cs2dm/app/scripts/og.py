"""Картинката за споделяне (Open Graph / Twitter) и иконата за начален екран.

Пуска се на ръка, когато се смени визията:  python3 -I scripts/og.py
Изход: public/og.png (1200×630) и public/apple-touch-icon.png (180×180).
Ползва само шрифтовете в public/fonts (Sofia Sans, OFL) и Pillow. Нула активи на Valve:
стената, мерникът и надписите са наши.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"

NIGHT = (27, 22, 16)
DEEP = (18, 14, 10)
SEAM = (74, 60, 43)
SAND = (220, 183, 121)
OCHRE = (184, 134, 62)
SKY = (143, 198, 224)
CHALK = (240, 232, 217)
DUST = (182, 166, 142)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def wall(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    """Фугите на пясъчниковата стена — същият ритъм като public/wall.svg."""
    row = 56
    for index, y in enumerate(range(0, height, row)):
        draw.line([(0, y), (width, y)], fill=(44, 36, 27), width=2)
        offset = 0 if index % 2 == 0 else 84
        for x in range(offset, width, 168):
            draw.line([(x, y), (x, y + row)], fill=(44, 36, 27), width=2)


def crosshair(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, width: int) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=SAND, width=width)
    arm = int(r * 0.9)
    gap = int(r * 0.55)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        start = (cx + dx * (r + gap - arm), cy + dy * (r + gap - arm))
        end = (cx + dx * (r + gap), cy + dy * (r + gap))
        draw.line([start, end], fill=SAND, width=width)
    dot = max(3, r // 5)
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=SKY)


def og() -> None:
    width, height = 1200, 630
    image = Image.new("RGB", (width, height), NIGHT)
    glow = Image.new("RGB", (width, height), NIGHT)
    glow_draw = ImageDraw.Draw(glow)
    for step in range(24, 0, -1):
        radius = step * 34
        shade = tuple(int(NIGHT[i] + (SAND[i] - NIGHT[i]) * (0.16 * (1 - step / 24))) for i in range(3))
        glow_draw.ellipse([1050 - radius, -160 - radius, 1050 + radius, -160 + radius], fill=shade)
    image = Image.blend(image, glow, 1.0)
    draw = ImageDraw.Draw(image)
    wall(draw, width, height)

    draw.text((80, 92), "CarbonStealth.eu", font=font("sofia-sans-latin-700-normal.woff2", 40), fill=DUST)
    draw.text((72, 132), "DUST2 DM", font=font("sofia-sans-extra-condensed-latin-800-normal.woff2", 250), fill=SAND)
    draw.text((80, 392), "Counter-Strike 2  Deathmatch  de_dust2", font=font("sofia-sans-latin-700-normal.woff2", 38), fill=CHALK)

    draw.rectangle([80, 470, 760, 548], fill=DEEP, outline=SEAM, width=2)
    console = font("sofia-sans-latin-400-normal.woff2", 34)
    draw.text((104, 488), "]", font=console, fill=OCHRE)
    draw.text((130, 488), "connect dm.carbonstealth.eu:27015", font=console, fill=CHALK)

    crosshair(draw, 1000, 430, 92, 10)
    image.save(ROOT / "public" / "og.png", optimize=True)


def touch_icon() -> None:
    size = 180
    image = Image.new("RGB", (size, size), NIGHT)
    draw = ImageDraw.Draw(image)
    crosshair(draw, size // 2, size // 2, 44, 9)
    image.save(ROOT / "public" / "apple-touch-icon.png", optimize=True)


if __name__ == "__main__":
    og()
    touch_icon()
