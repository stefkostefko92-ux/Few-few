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


def live(src, dst, prefix, base_scale=1.0, pass_scale=1.0, posters=(("", 1.0),), base_q=80, pass_q=72, poster_sweep=None):
    """Слоевете на „живата“ сцена (от --live на сцената) → файловете за public/js/cs-live.js:
    <prefix>-base.webp, <prefix>-sweep.webp (K положения на подвижната светлина едно под друго, сиво),
    <prefix>-flood.webp (сиво), <prefix>-glow.webp (ако има), <prefix>-pos.png (без загуба: байтовете носят
    позицията, затова се умалява само с „най-близък съсед“), <prefix>.json и неподвижните кадри
    <prefix>-poster<наставка>.webp. Слоевете на светлината са меки и вървят в по-ниска резолюция от базата.
    poster_sweep=k: неподвижният кадър се сглобява от слоевете по формулата на cs-live.js (базата, плюс
    светещите елементи и k-тото положение на подвижната лампа, наложени като „screen“) — така живата сцена
    тръгва точно от него (phi0 в JSON-а), без скок в яркостта."""
    import json
    meta = json.load(open(os.path.join(src, "meta.json"), encoding="utf8"))
    os.makedirs(dst, exist_ok=True)
    rep = []

    def load(name, scale, mode=Image.LANCZOS):
        im = Image.open(os.path.join(src, name + ("" if name == "pos" else "_0001") + ".png")).convert("RGB")
        if scale != 1.0:
            im = im.resize((round(im.width * scale), round(im.height * scale)), mode)
        return im

    rep += save(load("base", base_scale), os.path.join(dst, prefix + "-base"), base_q)
    rows = [load(f"sw{k}", pass_scale).convert("L") for k in range(meta["sweeps"])]
    atlas = Image.new("L", (rows[0].width, rows[0].height * len(rows)))
    for k, r in enumerate(rows):
        atlas.paste(r, (0, k * r.height))
    rep += save(atlas, os.path.join(dst, prefix + "-sweep"), pass_q)
    rep += save(load("flood", pass_scale).convert("L"), os.path.join(dst, prefix + "-flood"), pass_q)
    if os.path.exists(os.path.join(src, "glow_0001.png")):
        rep += save(load("glow", pass_scale), os.path.join(dst, prefix + "-glow"), pass_q)
    load("pos", pass_scale, Image.NEAREST).save(os.path.join(dst, prefix + "-pos.png"), "PNG", optimize=True)
    rep.append((prefix + "-pos.png", os.path.getsize(os.path.join(dst, prefix + "-pos.png"))))
    poster = None
    if poster_sweep is not None:
        import numpy as np
        f = lambda n: np.asarray(load(n, 1.0)).astype(np.float32) / 255.0
        add = f(f"sw{poster_sweep}").mean(-1, keepdims=True)
        if os.path.exists(os.path.join(src, "glow_0001.png")):
            add = add + f("glow")
        out = 1.0 - (1.0 - f("base")) * (1.0 - np.clip(add, 0, 1))
        poster = Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGB")
        meta["phi0"] = poster_sweep
    for suffix, scale in posters:
        im = load("poster", scale) if poster is None else poster.resize((round(poster.width * scale), round(poster.height * scale)), Image.LANCZOS)
        rep += save(im, os.path.join(dst, prefix + "-poster" + suffix), base_q)
    json.dump({k: meta[k] for k in ("sweeps", "sMin", "sMax", "s0", "scan", "phi0") if k in meta},
              open(os.path.join(dst, prefix + ".json"), "w", encoding="utf8"))
    return rep, meta


def icons_live(src, live_dir, site, pad=10, width=288):
    """„Живите“ слоеве на иконите → svc/<име>-glow.webp и svc/<име>-glint.webp (прозрачни: алфата е
    яркостта, цветът е „разпремултиплициран“ — така обикновеното наслагване в CSS добавя светлина, без да
    зависи от mix-blend-mode и от това какво има под иконата). Изрезът е същият като на самите икони."""
    ims = {n: Image.open(os.path.join(src, "icons", n + ".png")).convert("RGBA") for n in ICONS}
    box = None
    for im in ims.values():
        b = im.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    s = next(iter(ims.values())).size[0]
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(s, box[2] + pad), min(s, box[3] + pad))
    import numpy as np
    tot = 0
    for n in ICONS:
        for name in ("glow", "glint"):
            im = Image.open(os.path.join(live_dir, n, name + "_0001.png")).convert("RGB").crop(box)
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
            a = np.asarray(im).astype(np.float32) / 255.0
            alpha = np.clip(a.max(-1) * 1.35, 0, 1)
            rgb = np.where(alpha[..., None] > 1e-4, a / np.maximum(alpha[..., None], 1e-4), 0)
            out = np.dstack((np.clip(rgb, 0, 1), alpha))
            fn = os.path.join(site, "svc", f"{n}-{name}.webp")
            Image.fromarray((out * 255 + 0.5).astype(np.uint8), "RGBA").save(fn, "WEBP", quality=80, method=6)
            tot += os.path.getsize(fn)
    return tot


def site_live(live_dir, src, site, only=("bench", "hero", "herop", "icons")):
    """Всичко за „живите“ сцени наведнъж: слоевете от --live рендерите → public/brand/live и public/brand/svc.

    live_dir — папката с bench/, hero/, herop/, icons/ (изходът на header.py, hero.py и icons.py с --live);
    src — папката с неподвижните икони (за общия изрез); site — public/brand.
    """
    dst = os.path.join(site, "live")
    os.makedirs(dst, exist_ok=True)

    def show(rep):
        for n, sz in rep:
            print(f"  {n:26s} {sz / 1024:7.1f} KB")
        print(f"  → живи слоеве общо: {sum(sz for n, sz in rep if 'poster' not in n) / 1024:.0f} KB")

    if "bench" in only:
        print("ЛЕНТА")
        rep, _ = live(os.path.join(live_dir, "bench"), dst, "bench", base_scale=0.5, pass_scale=0.5, posters=())
        show(rep)
        # неподвижният кадър на лентата идва от СЪЩИЯ рендер като базата — иначе при поемането от платното има скок
        im = Image.open(os.path.join(live_dir, "bench", "poster_0001.png")).convert("RGB")
        w, h = im.size
        x0 = int(w * 0.43)
        still = save(im.resize((1600, 400), Image.LANCZOS), os.path.join(site, "bench-1600"), 80)
        still += save(im.crop((x0, 0, x0 + w // 2, h)).resize((800, 400), Image.LANCZOS), os.path.join(site, "bench-800"), 80)
        for n, sz in still:
            print(f"  {n:26s} {sz / 1024:7.1f} KB  (неподвижен кадър)")
    if "hero" in only:
        print("НАЧАЛНА — десктоп")
        rep, _ = live(os.path.join(live_dir, "hero"), dst, "hero", base_scale=1.0, pass_scale=2 / 3,
                      posters=(("", 1.0), ("-1280", 2 / 3)), poster_sweep=2)
        show(rep)
    if "herop" in only:
        print("НАЧАЛНА — телефон")
        rep, _ = live(os.path.join(live_dir, "herop"), dst, "herop", base_scale=2 / 3, pass_scale=0.5,
                      posters=(("", 1.0), ("-720", 2 / 3)), poster_sweep=2)
        show(rep)
    if "icons" in only:
        print("ИКОНИ")
        tot = icons_live(src, os.path.join(live_dir, "icons"), site)
        print(f"  26 слоя (glow + glint × 13): {tot / 1024:.0f} KB")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--site", required=True)
    ap.add_argument("--only", choices=("header", "icons"), default=None)
    ap.add_argument("--crop-x", type=float, default=0.43, help="ляв край на изреза за телефон, дял от ширината")
    ap.add_argument("--live", default=None, help="папка с --live рендерите (bench/, hero/, herop/, icons/): изнася само живите слоеве")
    ap.add_argument("--scenes", nargs="*", default=["bench", "hero", "herop", "icons"], help="с --live: кои сцени")
    a = ap.parse_args()
    if a.live:
        site_live(a.live, a.src, a.site, a.scenes)
        raise SystemExit(0)
    if a.only != "icons":
        for name, size in header(a.src, a.site, a.crop_x):
            print(f"{name:22s} {size / 1024:6.1f} KB")
    if a.only != "header":
        rep, box, dims = icons(a.src, a.site)
        tot = {"": 0, "-384": 0}
        for name, size in rep:
            tot["-384" if "-384" in name else ""] += size
        print(f"икони: общ изрез {box}, размер {dims[0]}×{dims[1]}; 13×192 px = {tot[''] / 1024:.0f} KB, 13×384 px = {tot['-384'] / 1024:.0f} KB")
