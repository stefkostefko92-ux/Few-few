#!/usr/bin/env python3
"""OG/Twitter изображение 1200×630: рендерът og-base.png (Дизайнера) + бял панел с пълното лого вляво.

    python3 liftcon/scripts/og-image.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "public" / "img" / "render" / "og-base.png"
LOGO = ROOT / "public" / "assets" / "brand" / "logo-full.png"
OUT = ROOT / "public" / "img" / "og" / "liftcon-og.jpg"


def main() -> None:
    if not BASE.exists():
        raise SystemExit(f"Липсва {BASE} — първо рендерите (liftcon/art).")
    img = Image.open(BASE).convert("RGBA").resize((1200, 630), Image.LANCZOS)
    # Плоча за логото: светла, с мека сянка — логото е графитено/зелено и иска светъл фон.
    plate = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    box = (56, 200, 56 + 560, 200 + 230)
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((box[0], box[1] + 14, box[2], box[3] + 14), 18, fill=(20, 24, 28, 110))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(18)))
    d.rounded_rectangle(box, 18, fill=(245, 246, 243, 242))
    img = Image.alpha_composite(img, plate)
    logo = Image.open(LOGO).convert("RGBA")
    w = 500
    logo = logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS)
    img.alpha_composite(logo, (box[0] + 30, box[1] + (box[3] - box[1] - logo.height) // 2))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(OUT, quality=86, optimize=True, progressive=True)
    print(f"{OUT} {OUT.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
