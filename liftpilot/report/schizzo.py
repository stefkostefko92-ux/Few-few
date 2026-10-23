#!/usr/bin/env python3
"""A survey sketch's picture as the product shows it or sends it to be read (round 50): a JPEG or PNG kept by the upload
(its metadata already removed, src/lib/allegati/strip.ts), or a PDF page drawn by pdftoppm, turned the way the phone
held it (the EXIF orientation read at upload: the kept copy has none), on white where it was transparent, scaled down to
a longest side and a number of pixels, and encoded again by us: nothing of the uploaded bytes but the pixels goes out.

The manifest is JSON on stdin: {"dir": the private directory of the files, "jobs": [{"in", "out", "orientation",
"maxEdge", "maxPixels", "format": "jpeg"|"png", "quality", "maxBytes"}]}; the answer one line of JSON on stdout:
{"ok": true, "out": [{"file", "width", "height", "bytes"}]}. File names are ours only (checked again here). A picture
over 40 megapixels is refused before it is decoded (as the upload: src/lib/allegati/limits.ts). Pillow 9.4 or later
(Debian bookworm's python3-pil).
"""
import json
import math
import os
import re
import sys
import warnings

from PIL import Image

MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
warnings.simplefilter("error", Image.DecompressionBombWarning)
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}\.(jpg|png)$")
# EXIF orientation -> the transposition that shows the picture upright (as Pillow's ImageOps.exif_transpose)
TURN = {
    2: Image.Transpose.FLIP_LEFT_RIGHT, 3: Image.Transpose.ROTATE_180, 4: Image.Transpose.FLIP_TOP_BOTTOM,
    5: Image.Transpose.TRANSPOSE, 6: Image.Transpose.ROTATE_270, 7: Image.Transpose.TRANSVERSE, 8: Image.Transpose.ROTATE_90,
}


def path_of(directory, name):
    if not isinstance(name, str) or not NAME.match(name):
        raise ValueError("file name refused")
    return os.path.join(directory, name)


def target_size(w, h, max_edge, max_pixels):
    scale = min(1.0, max_edge / max(w, h))
    if max_pixels:
        scale = min(scale, math.sqrt(max_pixels / (w * h)))
    return max(1, int(w * scale)), max(1, int(h * scale))


def flat(im):
    """The picture in RGB (or grey), transparency laid on white."""
    if im.mode in ("RGBA", "LA", "PA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        out = Image.new("RGB", rgba.size, (255, 255, 255))
        out.paste(rgba, mask=rgba.getchannel("A"))
        return out
    if im.mode in ("L", "RGB"):
        return im
    return im.convert("RGB")


def run(directory, job):
    src, dst = path_of(directory, job["in"]), path_of(directory, job["out"])
    max_edge, max_pixels = int(job["maxEdge"]), job.get("maxPixels")
    with Image.open(src) as im:
        if im.format not in ("JPEG", "PNG"):
            raise ValueError("not a JPEG or PNG")
        if im.width * im.height > MAX_PIXELS:
            raise ValueError("too many pixels")
        turn = TURN.get(job.get("orientation") or 1)
        w, h = (im.height, im.width) if turn in (Image.Transpose.TRANSPOSE, Image.Transpose.TRANSVERSE, Image.Transpose.ROTATE_90,
                                                 Image.Transpose.ROTATE_270) else (im.width, im.height)
        size = target_size(w, h, max_edge, max_pixels)
        if im.format == "JPEG":
            # decode at a reduced scale when the picture is far larger than wanted (the DCT's own 1/2, 1/4, 1/8)
            im.draft("RGB", (size[1], size[0]) if (w, h) != (im.width, im.height) else size)
        im.load()
        pic = flat(im)
        if turn is not None:
            pic = pic.transpose(turn)
        if pic.size != size:
            pic = pic.resize(size, Image.Resampling.LANCZOS)
    quality = int(job.get("quality", 85))
    max_bytes = job.get("maxBytes")
    while True:
        if job["format"] == "png":
            pic.save(dst, "PNG")
        else:
            pic.save(dst, "JPEG", quality=quality)
        n = os.path.getsize(dst)
        if job["format"] == "png" or not max_bytes or n <= max_bytes or quality <= 50:
            break
        quality -= 15
    return {"file": job["out"], "width": pic.width, "height": pic.height, "bytes": n}


def main():
    manifest = json.loads(sys.stdin.read())
    directory = manifest["dir"]
    out = [run(directory, job) for job in manifest["jobs"][:8]]
    sys.stdout.write(json.dumps({"ok": True, "out": out}))


if __name__ == "__main__":
    main()
