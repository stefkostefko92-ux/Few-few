"""export.py — от рендерите (PNG) към файловете на сайта (WebP).

Пуска се с обикновен Python 3 и Pillow:
    python3 export.py --src DIR_С_РЕНДЕРИТЕ --site ../../public/brand

  * лентата  header.png (3200×800) → bench-1600.webp (1600×400) и bench-800.webp (изрез около детайла
    и сондата, за телефон). Само WebP: 8-битовият AVIF е с ~13 KB по-малък, но измества тъмните неутрални
    тонове с около едно ниво към зелено (измерено: R −0.5, G +1.0, B −0.4 при среден тон 8/255), а
    кадърът е почти черен карбон — там това е видимо като цветен оттенък;
  * иконите  icons/*.png → svc/<име>.webp (192 px) и svc/<име>-384.webp (за екрани с висока плътност);
    всички се изрязват до ЕДИН общ правоъгълник, за да са еднакво големи и подравнени в списъка.
Печата размерите — числата за width/height в App.jsx идват оттук.
"""
import argparse
import os

from PIL import Image

ICONS = "web ecommerce software erp mobile gamedev seo aeo analytics hosting security api reverse".split()


def save(im, base, webp_q):
    im.save(base + ".webp", "WEBP", quality=webp_q, method=6)
    return [(os.path.basename(base) + ".webp", os.path.getsize(base + ".webp"))]


def header(src, site, crop_x):
    im = Image.open(os.path.join(src, "header.png")).convert("RGB")
    w, h = im.size
    rep = save(im.resize((1600, 400), Image.LANCZOS), os.path.join(site, "bench-1600"), 80)
    x0 = int(w * crop_x)
    rep += save(im.crop((x0, 0, x0 + w // 2, h)).resize((800, 400), Image.LANCZOS), os.path.join(site, "bench-800"), 80)
    return rep


def icons(src, site, pad=10):
    ims = {n: Image.open(os.path.join(src, "icons", n + ".png")).convert("RGBA") for n in ICONS}
    box = None
    for im in ims.values():
        b = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    s = next(iter(ims.values())).size[0]
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(s, box[2] + pad), min(s, box[3] + pad))
    os.makedirs(os.path.join(site, "svc"), exist_ok=True)
    rep, dims = [], None
    for n, im in ims.items():
        c = im.crop(box)
        for wpx, suffix in ((192, ""), (384, "-384")):
            hpx = round(c.height * wpx / c.width)
            rep += save(c.resize((wpx, hpx), Image.LANCZOS), os.path.join(site, "svc", n + suffix), 86)
            if wpx == 192:
                dims = (wpx, hpx)
    return rep, box, dims


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--site", required=True)
    ap.add_argument("--only", choices=("header", "icons"), default=None)
    ap.add_argument("--crop-x", type=float, default=0.43, help="ляв край на изреза за телефон, дял от ширината")
    a = ap.parse_args()
    if a.only != "icons":
        for name, size in header(a.src, a.site, a.crop_x):
            print(f"{name:22s} {size / 1024:6.1f} KB")
    if a.only != "header":
        rep, box, dims = icons(a.src, a.site)
        tot = {"": 0, "-384": 0}
        for name, size in rep:
            tot["-384" if "-384" in name else ""] += size
        print(f"икони: общ изрез {box}, размер {dims[0]}×{dims[1]}; 13×192 px = {tot[''] / 1024:.0f} KB, 13×384 px = {tot['-384'] / 1024:.0f} KB")
