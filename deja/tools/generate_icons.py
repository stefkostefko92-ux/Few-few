#!/usr/bin/env python3
"""Déjà — генерира иконите на разширението (тъмен фон, виолетово „Д“)."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 32, 48, 128]
BG = (14, 14, 20, 255)  # --bg от UI-а
ACCENT = (139, 124, 246, 255)  # --accent
OUT = Path(__file__).resolve().parent.parent / "icons"

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("Не намерих шрифт — инсталирай fonts-dejavu-core")


def make_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = max(2, size // 5)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    letter = "Д"
    font = load_font(int(size * 0.62))
    left, top, right, bottom = draw.textbbox((0, 0), letter, font=font)
    x = (size - (right - left)) / 2 - left
    y = (size - (bottom - top)) / 2 - top
    draw.text((x, y), letter, font=font, fill=ACCENT)

    # точката-акцент от логото „Déjà.“
    dot = max(1, size // 10)
    draw.ellipse(
        [size - 3 * dot, size - 3 * dot, size - dot, size - dot],
        fill=(234, 234, 242, 255),
    )
    return img


def main() -> None:
    OUT.mkdir(exist_ok=True)
    for size in SIZES:
        make_icon(size).save(OUT / f"icon{size}.png")
        print(f"icons/icon{size}.png")


if __name__ == "__main__":
    main()
