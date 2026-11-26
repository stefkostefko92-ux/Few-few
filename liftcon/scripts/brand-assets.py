#!/usr/bin/env python3
"""Брандови растерни активи на LiftCon от оригиналното лого (brand/liftcon-logo-originale.png).

Без SVG (правило на репото): лого за хедъра, пълно лого, иконки (favicon, apple-touch, PWA) и логото за
JSON-LD. Бялото става прозрачно с „color to alpha“, за да няма бял ореол върху светлия фон на сайта.

    python3 liftcon/scripts/brand-assets.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "brand" / "liftcon-logo-originale.png"
OUT = ROOT / "public" / "assets" / "brand"

# Кутиите са измерени върху оригинала 1774×887 (профил по редове/колони на небелите пиксели).
EMBLEM = (66, 227, 520, 674)  # емблемата с асансьора и документа
WORDMARK = (566, 276, 1726, 516)  # „LIFTCON“
FULL = (66, 227, 1726, 674)  # цялото лого с подзаглавието
# Редът с девиза „VERIFICA | CONTROLLO | CONFORMITÀ“ се маха от версиите за сайта: т. 8 на каталога и правният
# одит (Codice del consumo art. 21) — „verifica/conformità“ се чете като официална проверка. Оригиналът е непокътнат.
TAGLINE = (566, 596, 1726, 652)


def white_to_alpha(img: Image.Image) -> Image.Image:
    """GIMP „color to alpha“ за бяло: запазва антиалиасинга по ръбовете без бял ореол."""
    a = np.asarray(img.convert("RGB")).astype(np.float64) / 255.0
    alpha = np.max(1.0 - a, axis=2)
    alpha = np.where(alpha < 0.02, 0.0, alpha)  # фонът на оригинала е 254, не 255
    safe = np.where(alpha > 0, alpha, 1.0)[..., None]
    rgb = np.clip(1.0 - (1.0 - a) / safe, 0, 1)
    out = np.dstack([rgb, alpha])
    return Image.fromarray((out * 255).round().astype(np.uint8), "RGBA")


def fit_height(img: Image.Image, h: int) -> Image.Image:
    w = round(img.width * h / img.height)
    return img.resize((w, h), Image.LANCZOS)


def on_white_square(img: Image.Image, size: int, pad: float) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    inner = int(size * (1 - 2 * pad))
    scale = min(inner / img.width, inner / img.height)
    em = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(em, ((size - em.width) // 2, (size - em.height) // 2))
    return canvas


def save_pair(img: Image.Image, name: str) -> None:
    img.save(OUT / f"{name}.png", optimize=True)
    img.save(OUT / f"{name}.webp", quality=92, method=6)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    ImageDraw.Draw(src).rectangle(TAGLINE, fill=(255, 255, 255))
    emblem = white_to_alpha(src.crop(EMBLEM))
    word = white_to_alpha(src.crop(WORDMARK))
    full = white_to_alpha(src.crop(FULL))

    # Хедър: емблема + „LIFTCON“ на един ред, 2× за ретина (показва се на 36 px височина).
    h = 72
    em_h = fit_height(emblem, h)
    wm_h = fit_height(word, round(h * 0.64))
    gap = round(h * 0.18)
    header = Image.new("RGBA", (em_h.width + gap + wm_h.width, h), (0, 0, 0, 0))
    header.alpha_composite(em_h, (0, 0))
    header.alpha_composite(wm_h, (em_h.width + gap, (h - wm_h.height) // 2))
    save_pair(header, "logo-header")

    # Пълното лого (футър, 404, OG): 2× при показване на 84 px височина.
    save_pair(fit_height(full, 168), "logo-full")

    # Иконки — емблемата върху бял квадрат.
    on_white_square(emblem, 180, 0.08).convert("RGB").save(OUT / "apple-touch-icon.png", optimize=True)
    on_white_square(emblem, 192, 0.06).save(OUT / "icon-192.png", optimize=True)
    on_white_square(emblem, 512, 0.06).save(OUT / "icon-512.png", optimize=True)
    on_white_square(emblem, 512, 0.16).save(OUT / "icon-maskable-512.png", optimize=True)
    on_white_square(emblem, 512, 0.04).convert("RGB").save(OUT / "logo-schema.png", optimize=True)
    fav = on_white_square(emblem, 48, 0.02)
    fav.save(OUT / "favicon-48.png", optimize=True)
    fav.save(ROOT / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])


if __name__ == "__main__":
    main()
