"""python fetch_assets.py — downloads the render inputs into assets/ and checks every file against its pinned hash.
Poly Haven (CC0 1.0, https://polyhaven.com/license): concrete + dirty_concrete textures, the interior_construction
https://github.com/rsms/inter): the overlay's typeface. Writes assets/LICENSES.txt. Safe to run again: skips what is
already there and correct."""
import hashlib
import io
import os
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
POLYHAVEN = [  # (path under assets/, url, md5) — pinned 23.11.2026
    ("concrete_diff_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/concrete/concrete_diff_4k.jpg", "045fa12314ad6089ca517d5697989793"),
    ("concrete_nor_gl_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/concrete/concrete_nor_gl_4k.jpg", "9a7ee42a72956075716dd6dbbf1a97e7"),
    ("concrete_rough_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/concrete/concrete_rough_4k.jpg", "fbcf04b6ebc0c2befe1091cf954fc314"),
    ("dirty_concrete_diff_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/dirty_concrete/dirty_concrete_diff_4k.jpg", "050f153f03f1da892d435f8035813dc2"),
    ("dirty_concrete_nor_gl_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/dirty_concrete/dirty_concrete_nor_gl_4k.jpg", "bd00187760b467948a6cd7e02cdf9659"),
    ("dirty_concrete_rough_4k.jpg", "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/dirty_concrete/dirty_concrete_rough_4k.jpg", "1bc05ec1c59fd36556a23014b34a1a73"),
    ("interior_construction_4k.hdr", "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/4k/interior_construction_4k.hdr", "99928d77adac0042948f719f4d0dff2e"),
    ("Drill_01/Drill_01_2k.blend", "https://dl.polyhaven.org/file/ph-assets/Models/blend/2k/Drill_01/Drill_01_2k.blend", "bd170cef2f16d6d49709fd2a41186012"),
    ("Drill_01/textures/Drill_01_nor_gl_2k.exr", "https://dl.polyhaven.org/file/ph-assets/Models/exr/2k/Drill_01/Drill_01_nor_gl_2k.exr", "83af060443441ef83abaa6a4460e2cfb"),
    ("Drill_01/textures/Drill_01_metallic_2k.exr", "https://dl.polyhaven.org/file/ph-assets/Models/exr/2k/Drill_01/Drill_01_metallic_2k.exr", "2ff3f1b27dd89f1cdb085ffab028fb1b"),
    ("Drill_01/textures/Drill_01_diff_2k.jpg", "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/Drill_01/Drill_01_diff_2k.jpg", "e228492108e8c22d0d4edb7508b24a47"),
    ("Drill_01/textures/Drill_01_roughness_2k.jpg", "https://dl.polyhaven.org/file/ph-assets/Models/jpg/2k/Drill_01/Drill_01_roughness_2k.jpg", "2213264258857d064f8ed1c8bd544d2d"),
]
INTER = ("https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip",
         "ff970a5d4561a04f102a7cb781adbd6ac4e9b6c460914c7a101f15acb7f7d1a4")
FONTS = ("Inter-Regular", "Inter-Medium", "Inter-SemiBold", "Inter-Bold", "InterDisplay-SemiBold", "InterDisplay-Bold")
LICENSES = """Render inputs of the Panev mounting video — internal, not redistributed, not in git.

Poly Haven assets — CC0 1.0 (public domain), https://polyhaven.com/license
  source: https://polyhaven.com/a/<name> · downloaded by fetch_assets.py from dl.polyhaven.org, md5-checked

Inter 4.0 — SIL Open Font License 1.1, https://github.com/rsms/inter (fonts/LICENSE.txt)
  release v4.0, Inter-4.0.zip, sha256 ff970a5d4561a04f102a7cb781adbd6ac4e9b6c460914c7a101f15acb7f7d1a4

Panev Ascensori logo — the owner's (panev/img/brand/panev-ascensori-logo.webp), used with permission.
"""


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "panev-video-fetch/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def digest(data, algo):
    return hashlib.new(algo, data).hexdigest()


def main():
    os.makedirs(os.path.join(ASSETS, "fonts"), exist_ok=True)
    for rel, url, md5 in POLYHAVEN:
        dst = os.path.join(ASSETS, *rel.split("/"))
        if os.path.exists(dst) and digest(open(dst, "rb").read(), "md5") == md5:
            continue
        data = get(url)
        if digest(data, "md5") != md5:
            sys.exit(f"{rel}: md5 does not match the pinned value — not saved")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(dst, "wb") as fh:
            fh.write(data)
        print(f"ok {rel} ({len(data) // 1024} KB)", flush=True)
    fonts = os.path.join(ASSETS, "fonts")
    if not all(os.path.exists(os.path.join(fonts, f + ".otf")) for f in FONTS):
        data = get(INTER[0])
        if digest(data, "sha256") != INTER[1]:
            sys.exit("Inter-4.0.zip: sha256 does not match the pinned value — not saved")
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            for f in FONTS:
                with open(os.path.join(fonts, f + ".otf"), "wb") as fh:
                    fh.write(z.read(f"extras/otf/{f}.otf"))
            with open(os.path.join(fonts, "LICENSE.txt"), "wb") as fh:
                fh.write(z.read("LICENSE.txt"))
        print("ok fonts (Inter 4.0)", flush=True)
    with open(os.path.join(ASSETS, "LICENSES.txt"), "w", encoding="utf-8") as fh:
        fh.write(LICENSES)
    print("assets ready:", ASSETS)


if __name__ == "__main__":
    main()
