#!/usr/bin/env python3
"""Текстурите за банерите-картинки в de_dust2 (Workshop addon-а на cs2dm).

Изход: out/materials/carbonstealth/<име>_color.png + <име>_selfillum.png (бяла маска = свети винаги,
и в сянка) + out/preview.png за одобрение. Размерите са степени на двойката (изискване на Source 2).

Източници:
  src/carbonstealth-logo.webp   официалното лого (carbonstealth.eu/brand/cs-scene.webp)
  src/carbonstealth-wide.png    официалната OG картинка (carbonstealth.eu/og-image.png)
  ../../adblock/store/…         снимките от Chrome Web Store (източникът им е adblock/store/screenshots/build.py)

    python3 build_textures.py          # нужни са Pillow и шрифтът Inter (fonts-inter)
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
STORE = HERE.parent.parent / "adblock" / "store"
OUT = HERE / "out" / "materials" / "carbonstealth"
CYAN = (0, 229, 255)
WHITE = (245, 245, 240)
GREY = (196, 196, 189)
FONT_DIRS = [Path("/usr/share/fonts/opentype/inter"), Path("C:/Windows/Fonts"), Path.home() / "Library/Fonts"]


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        p = d / name
        if p.exists():
            return ImageFont.truetype(str(p), size)
    sys.exit(f"build_textures: липсва шрифт {name} (инсталирай Inter: apt install fonts-inter)")


def source(path: Path) -> Image.Image:
    if not path.exists():
        sys.exit(f"build_textures: липсва {path}")
    return Image.open(path).convert("RGB")


def glow_text(img: Image.Image, xy: tuple[int, int], text: str, fnt: ImageFont.FreeTypeFont,
              fill: tuple[int, int, int], anchor: str = "la", glow: int = 0) -> None:
    """Текст с меко сияние отдолу (четим от разстояние върху тъмен фон)."""
    if glow:
        layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(layer).text(xy, text, font=fnt, fill=(*fill, 200), anchor=anchor)
        img.paste(layer.filter(ImageFilter.GaussianBlur(glow)), (0, 0), layer.filter(ImageFilter.GaussianBlur(glow)))
    ImageDraw.Draw(img).text(xy, text, font=fnt, fill=fill, anchor=anchor)


def pad_to(img: Image.Image, width: int, height: int) -> Image.Image:
    """Мащабира до височината и допълва страните с крайните колони (без видим шев)."""
    scale = height / img.height
    img = img.resize((round(img.width * scale), height), Image.LANCZOS)
    if img.width >= width:
        left = (img.width - width) // 2
        return img.crop((left, 0, left + width, height))
    canvas = Image.new("RGB", (width, height))
    left = (width - img.width) // 2
    canvas.paste(img.crop((0, 0, 1, height)).resize((left, height)), (0, 0))
    right = width - left - img.width
    canvas.paste(img.crop((img.width - 1, 0, img.width, height)).resize((right, height)), (left + img.width, 0))
    canvas.paste(img, (left, 0))
    return canvas


def cs_logo() -> Image.Image:
    img = source(HERE / "src" / "carbonstealth-logo.webp").resize((1024, 1024), Image.LANCZOS)
    glow_text(img, (512, 975), "CARBONSTEALTH.EU", font("Inter-Bold.otf", 46), CYAN, anchor="ms", glow=10)
    return img


def cs_wide() -> Image.Image:
    src = source(HERE / "src" / "carbonstealth-wide.png")
    img = src.resize((2048, round(src.height * 2048 / src.width)), Image.LANCZOS)
    top = (img.height - 1024) // 2
    img = img.crop((0, top, 2048, top + 1024))
    glow_text(img, (1024, 905), "CARBONSTEALTH.EU", font("Inter-Bold.otf", 64), CYAN, anchor="ms", glow=12)
    glow_text(img, (1024, 975), "Websites · E-commerce · Apps · ERP", font("Inter-SemiBold.otf", 40), GREY, anchor="ms")
    return img


def adblock_shot(n: int) -> Image.Image:
    # Скрийншотът е 1280×800; празното място под текста вляво е за адреса.
    img = pad_to(source(STORE / "screenshots" / f"screenshot-{n}.png"), 2048, 1024)
    scale, left = 1024 / 800, (2048 - round(1280 * 1024 / 800)) // 2
    x, y = left + round(72 * scale), round(600 * scale)
    glow_text(img, (x, y), "adblock.carbonstealth.eu", font("Inter-Bold.otf", 46), CYAN, anchor="ls", glow=10)
    glow_text(img, (x, y + 58), "Free for Chrome · Edge · Brave", font("Inter-SemiBold.otf", 34), GREY, anchor="ls")
    return img


def adblock_marquee() -> Image.Image:
    src = source(STORE / "marquee_1400x560.png")
    img = src.resize((round(src.width * 1024 / src.height), 1024), Image.LANCZOS).crop((0, 0, 2048, 1024))
    glow_text(img, (110, 470), "Supreme AdBlock", font("Inter-Bold.otf", 92), WHITE, anchor="ls", glow=14)
    glow_text(img, (114, 545), "adblock.carbonstealth.eu", font("Inter-Bold.otf", 50), CYAN, anchor="ls", glow=10)
    glow_text(img, (114, 610), "Blocks ads & trackers · free", font("Inter-SemiBold.otf", 38), GREY, anchor="ls")
    return img


TEXTURES = {
    "cs_logo": cs_logo,
    "cs_wide": cs_wide,
    "adblock_shot1": lambda: adblock_shot(1),
    "adblock_shot2": lambda: adblock_shot(2),
    "adblock_marquee": adblock_marquee,
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    built = {}
    for name, make in TEXTURES.items():
        img = make()
        w, h = img.size
        assert w & (w - 1) == 0 and h & (h - 1) == 0, f"{name}: {w}×{h} не е степен на двойката"
        img.save(OUT / f"{name}_color.png", optimize=True)
        Image.new("L", img.size, 255).save(OUT / f"{name}_selfillum.png", optimize=True)
        built[name] = img
        print(f"  ✓ {name}_color.png {w}×{h}")

    # Лист за преглед: всички в един ред с имената.
    thumbs = [im.resize((round(im.width * 360 / im.height), 360), Image.LANCZOS) for im in built.values()]
    sheet = Image.new("RGB", (sum(t.width for t in thumbs) + 40 * (len(thumbs) + 1), 440), (24, 24, 28))
    x = 40
    for (name, _), t in zip(built.items(), thumbs):
        sheet.paste(t, (x, 30))
        ImageDraw.Draw(sheet).text((x, 400), name, font=font("Inter-SemiBold.otf", 26), fill=GREY)
        x += t.width + 40
    sheet.save(HERE / "out" / "preview.png", optimize=True)
    print(f"  ✓ out/preview.png")


if __name__ == "__main__":
    main()
