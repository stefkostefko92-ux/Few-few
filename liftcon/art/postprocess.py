#!/usr/bin/env python3
"""Конвертира мастерите от out/*.png в public/img/render/ (AVIF, WebP, JPG). Цел: hero-1600.avif <= 180 KB, .webp <= 260 KB."""
import io
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
DEST = HERE.parent / "public" / "img" / "render"
DEST.mkdir(parents=True, exist_ok=True)


def size_at(img, fmt, q):
    b = io.BytesIO()
    kw = {"quality": q}
    if fmt == "AVIF": kw["speed"] = 4
    if fmt == "WEBP": kw["method"] = 6
    img.save(b, fmt, **kw)
    return b.tell()


def pick_quality(img, fmt, limit, hi=90, lo=40):
    """Най-високо качество, което се побира в лимита (двоично търсене)."""
    best = lo
    while lo <= hi:
        mid = (lo + hi) // 2
        if size_at(img, fmt, mid) <= limit: best, lo = mid, mid + 1
        else: hi = mid - 1
    return best


def resized(master, w):
    h = round(master.height * w / master.width)
    return master if w == master.width else master.resize((w, h), Image.LANCZOS)


def export(name, widths, ref_w, jpg_w, limits):
    master = Image.open(OUT / f"{name}.png").convert("RGB")
    ref = resized(master, ref_w)
    q = {f: pick_quality(ref, f, limits[f]) if limits.get(f) else 80 for f in ("AVIF", "WEBP")}
    print(name, "качество", q)
    for w in widths:
        im = resized(master, w)
        im.save(DEST / f"{name}-{w}.avif", "AVIF", quality=q["AVIF"], speed=4)
        im.save(DEST / f"{name}-{w}.webp", "WEBP", quality=q["WEBP"], method=6)
    resized(master, jpg_w).save(DEST / f"{name}-{jpg_w}.jpg", "JPEG", quality=84, optimize=True, progressive=True, subsampling=0)


if (OUT / "hero.png").exists():
    export("hero", [600, 800, 1200, 1600, 2400], 1600, 1600, {"AVIF": 175 * 1024, "WEBP": 250 * 1024})
if (OUT / "dettaglio.png").exists():
    export("dettaglio", [600, 900, 1200], 1200, 1200, {"AVIF": 140 * 1024, "WEBP": 200 * 1024})
if (OUT / "og.png").exists():
    og = Image.open(OUT / "og.png").convert("RGB")
    assert og.size == (1200, 630)
    og.save(DEST / "og-base.png", optimize=True)
    og.save(DEST / "og-base.jpg", "JPEG", quality=88, optimize=True, progressive=True)
for p in sorted(DEST.iterdir()): print(f"{p.name:24s}{p.stat().st_size/1024:8.1f} KB")
