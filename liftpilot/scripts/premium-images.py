# Builds the illustrations of the LiftPilot Premium pack for the site (sources in brand/premium/images/): the elevator
# cutaway (the landing's hero), the lobby (the closing call to action) and the shaft schematic (the standards block),
# as responsive AVIF and WebP in public/img/premium/<name>-<width>.<ext>. They are illustrations, not the output of a
# project: the page that shows them labels them so.
# Run from liftpilot/: python3 -I scripts/premium-images.py   (needs Pillow with WebP and AVIF)
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "brand", "premium", "images")
OUT = os.path.join(ROOT, "public", "img", "premium")

# name: (widths, formats, WebP quality, AVIF quality); the hero is the landing's LCP: its 800 px AVIF stays small
IMAGES = {
    "elevator-cutaway": ((480, 800, 1086), ("avif", "webp"), 78, 58),
    "elevator-lobby": ((800, 1400, 1983), ("avif", "webp"), 74, 48),
    "elevator-blueprint": ((450, 900), ("webp",), 86, None),
}

os.makedirs(OUT, exist_ok=True)
for old in os.listdir(OUT):
    os.remove(os.path.join(OUT, old))
for name, (widths, formats, q_webp, q_avif) in IMAGES.items():
    src = Image.open(os.path.join(SRC, f"{name}.png"))
    # the schematic is line work on transparency; the renders are opaque
    src = src.convert("RGBA" if src.mode == "RGBA" else "RGB")
    for w in widths:
        im = src if w == src.width else src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
        for ext in formats:
            path = os.path.join(OUT, f"{name}-{w}.{ext}")
            if ext == "webp":
                im.save(path, "WEBP", quality=q_webp, method=6, exact=True)
            else:
                im.save(path, "AVIF", quality=q_avif, speed=4)
            print(f"{os.path.relpath(path, ROOT)}  {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")
