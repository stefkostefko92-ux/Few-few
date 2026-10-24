"""Картинката за споделяне (Open Graph / Twitter) и иконата за начален екран.

Пуска се на ръка, когато се смени визията:  python3 -I scripts/og.py
Изход: public/og.png (1200×630) и public/apple-touch-icon.png (180×180).
Ползва само шрифтовете в public/fonts (Sofia Sans, OFL), знака на Carbon Stealth и Pillow.
Нула активи на Valve: хоризонтът, мерникът и надписите са наши.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "public" / "fonts"

NIGHT = (7, 10, 14)
DEEP = (13, 19, 25)
SAND = (255, 181, 71)
CYAN = (0, 229, 255)
CHALK = (233, 241, 245)
DUST = (147, 166, 179)


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONTS / name), size)


def horizon(draw: ImageDraw.ImageDraw, width: int, height: int) -> None:
    """Нощният хоризонт: светла линия на ~74 % височина и перспективна решетка под нея."""
    line = int(height * 0.74)
    for i in range(-14, 15):
        draw.line([(width // 2 + i * 40, line), (width // 2 + i * 190, height)], fill=(14, 28, 38), width=1)
    draw.line([(0, line), (width, line)], fill=(0, 140, 158), width=2)


def reticle(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, width: int) -> None:
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=CYAN, width=width)
    arm = int(r * 0.9)
    gap = int(r * 0.55)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        start = (cx + dx * (r + gap - arm), cy + dy * (r + gap - arm))
        end = (cx + dx * (r + gap), cy + dy * (r + gap))
        draw.line([start, end], fill=CYAN, width=width)
    dot = max(3, r // 5)
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=SAND)


def og() -> None:
    width, height = 1200, 630
    glow = Image.new("RGB", (width, height), NIGHT)
    glow_draw = ImageDraw.Draw(glow)
    for step in range(28, 0, -1):
        radius = step * 30
        mix = 0.42 * (1 - step / 28)
        shade = tuple(int(NIGHT[i] + (SAND[i] - NIGHT[i]) * mix) for i in range(3))
        glow_draw.ellipse([1010 - radius, 470 - radius, 1010 + radius, 470 + radius], fill=shade)
    image = glow
    draw = ImageDraw.Draw(image)
    horizon(draw, width, height)

    draw.text((80, 84), "CarbonStealth.eu", font=font("sofia-sans-latin-700-normal.woff2", 40), fill=CYAN)
    draw.text((72, 128), "DUST2 DM", font=font("sofia-sans-extra-condensed-latin-800-normal.woff2", 250), fill=CHALK)
    draw.text((80, 400), "Counter-Strike 2  Deathmatch  de_dust2", font=font("sofia-sans-latin-700-normal.woff2", 38), fill=SAND)

    draw.rectangle([80, 480, 760, 552], fill=DEEP, outline=CYAN, width=2)
    console = font("sofia-sans-latin-400-normal.woff2", 34)
    draw.text((104, 494), "]", font=console, fill=SAND)
    draw.text((130, 494), "connect dm.carbonstealth.eu:27015", font=console, fill=CHALK)

    reticle(draw, 1030, 260, 84, 9)
    logo = Image.open(ROOT / "public" / "cs-logo-192.webp").convert("RGB")
    image.paste(logo, (1030 - 96, 410))
    image.save(ROOT / "public" / "og.png", optimize=True)


def touch_icon() -> None:
    size = 180
    image = Image.new("RGB", (size, size), NIGHT)
    draw = ImageDraw.Draw(image)
    reticle(draw, size // 2, size // 2, 44, 9)
    image.save(ROOT / "public" / "apple-touch-icon.png", optimize=True)


if __name__ == "__main__":
    og()
    touch_icon()
