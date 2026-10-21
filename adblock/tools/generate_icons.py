#!/usr/bin/env python3
"""Render the extension icons and Chrome Web Store graphics from the BRAND art.

Source of truth is the shield as supplied by the owner — not a drawing made here:

    store/brand/shield-transparent.png   the shield, 180x180 RGBA
    store/brand/logo-transparent.png     the full lockup (shield + wordmark)
    server/icon-512.png                  the same shield at 512x512 (preferred
                                         master: every output is a downscale,
                                         so nothing is ever upscaled)

Zero external libraries, as before: PNG read/write through zlib and a separable
Lanczos-3 resampler over premultiplied alpha (premultiplying is what keeps the
transparent edges from picking up a dark halo).

Usage: python3 tools/generate_icons.py
"""

import math
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---- PNG I/O -------------------------------------------------------------
def write_png(path, width, height, rgba):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for y in range(height):
        raw.append(0)
        raw.extend(rgba[y * width * 4 : (y + 1) * width * 4])

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def read_png(path):
    """Minimal reader: 8-bit, non-interlaced, RGB or RGBA. Returns (w, h, rgba)."""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(path + ": not a PNG")
    i, idat = 8, bytearray()
    width = height = depth = color = interlace = None
    while i < len(data):
        length = struct.unpack(">I", data[i : i + 4])[0]
        tag = data[i + 4 : i + 8]
        body = data[i + 8 : i + 8 + length]
        i += 12 + length
        if tag == b"IHDR":
            width, height, depth, color, _comp, _filt, interlace = struct.unpack(">IIBBBBB", body)
        elif tag == b"IDAT":
            idat += body
        elif tag == b"IEND":
            break
    if depth != 8 or interlace != 0 or color not in (2, 6):
        raise SystemExit(f"{path}: need 8-bit non-interlaced RGB/RGBA (got depth={depth} color={color})")

    bpp = 4 if color == 6 else 3
    stride = width * bpp
    raw = zlib.decompress(bytes(idat))
    out = bytearray(width * height * 4)
    prev = bytearray(stride)
    pos = 0
    for y in range(height):
        ftype = raw[pos]
        pos += 1
        line = bytearray(raw[pos : pos + stride])
        pos += stride
        if ftype:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                if ftype == 1:
                    line[x] = (line[x] + a) & 255
                elif ftype == 2:
                    line[x] = (line[x] + b) & 255
                elif ftype == 3:
                    line[x] = (line[x] + ((a + b) >> 1)) & 255
                elif ftype == 4:
                    pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                    pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                    line[x] = (line[x] + pred) & 255
                else:
                    raise SystemExit(path + ": bad filter type")
        if bpp == 4:
            out[y * width * 4 : (y + 1) * width * 4] = line
        else:
            for x in range(width):
                o = (y * width + x) * 4
                out[o : o + 3] = line[x * 3 : x * 3 + 3]
                out[o + 3] = 255
        prev = line
    return width, height, out


# ---- Resampling ----------------------------------------------------------
def _lanczos(x, a=3.0):
    if x == 0.0:
        return 1.0
    if abs(x) >= a:
        return 0.0
    px = math.pi * x
    return (math.sin(px) / px) * (math.sin(px / a) / (px / a))


def _weights(src_n, dst_n, a=3.0):
    """Per-output-pixel (index, weight) taps; the kernel widens when downscaling."""
    scale = dst_n / src_n
    inv = min(scale, 1.0)
    support = a / inv
    rows = []
    for i in range(dst_n):
        center = (i + 0.5) / scale
        taps, total = [], 0.0
        for j in range(int(math.floor(center - support)), int(math.ceil(center + support)) + 1):
            w = _lanczos((j + 0.5 - center) * inv, a)
            if w == 0.0:
                continue
            taps.append((min(src_n - 1, max(0, j)), w))
            total += w
        rows.append([(j, w / total) for j, w in taps])
    return rows


def resize(src, sw, sh, dw, dh):
    """Lanczos-3 resize over premultiplied alpha (no dark fringe on soft edges)."""
    # premultiply into floats
    pm = [0.0] * (sw * sh * 4)
    for i in range(sw * sh):
        a = src[i * 4 + 3] / 255.0
        pm[i * 4] = src[i * 4] * a
        pm[i * 4 + 1] = src[i * 4 + 1] * a
        pm[i * 4 + 2] = src[i * 4 + 2] * a
        pm[i * 4 + 3] = a

    xw = _weights(sw, dw)
    tmp = [0.0] * (dw * sh * 4)
    for y in range(sh):
        row = y * sw * 4
        orow = y * dw * 4
        for x in range(dw):
            r = g = b = al = 0.0
            for j, w in xw[x]:
                s = row + j * 4
                r += pm[s] * w
                g += pm[s + 1] * w
                b += pm[s + 2] * w
                al += pm[s + 3] * w
            o = orow + x * 4
            tmp[o], tmp[o + 1], tmp[o + 2], tmp[o + 3] = r, g, b, al

    yw = _weights(sh, dh)
    out = bytearray(dw * dh * 4)
    for y in range(dh):
        taps = yw[y]
        for x in range(dw):
            r = g = b = al = 0.0
            for j, w in taps:
                s = (j * dw + x) * 4
                r += tmp[s] * w
                g += tmp[s + 1] * w
                b += tmp[s + 2] * w
                al += tmp[s + 3] * w
            al = min(1.0, max(0.0, al))
            o = (y * dw + x) * 4
            if al <= 0.0:
                out[o : o + 4] = b"\x00\x00\x00\x00"
                continue
            out[o] = min(255, max(0, int(round(r / al))))
            out[o + 1] = min(255, max(0, int(round(g / al))))
            out[o + 2] = min(255, max(0, int(round(b / al))))
            out[o + 3] = int(round(al * 255))
    return out


def trim(rgba, w, h, threshold=8):
    """Crop fully transparent margins so the art fills the canvas optically."""
    x0, y0, x1, y1 = w, h, -1, -1
    for y in range(h):
        row = y * w
        for x in range(w):
            if rgba[(row + x) * 4 + 3] > threshold:
                if x < x0: x0 = x
                if x > x1: x1 = x
                if y < y0: y0 = y
                if y > y1: y1 = y
    if x1 < 0:
        return rgba, w, h
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    out = bytearray(cw * ch * 4)
    for y in range(ch):
        s = ((y + y0) * w + x0) * 4
        out[y * cw * 4 : (y + 1) * cw * 4] = rgba[s : s + cw * 4]
    return out, cw, ch


def fit(rgba, w, h, size, pad=0.0):
    """Scale to fit a square canvas (aspect kept, centred), `pad` as a fraction."""
    inner = int(round(size * (1.0 - 2 * pad)))
    scale = min(inner / w, inner / h)
    dw, dh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))
    small = resize(rgba, w, h, dw, dh)
    canvas = bytearray(size * size * 4)
    ox, oy = (size - dw) // 2, (size - dh) // 2
    for y in range(dh):
        d = ((y + oy) * size + ox) * 4
        canvas[d : d + dw * 4] = small[y * dw * 4 : (y + 1) * dw * 4]
    return canvas


# ---- Store graphics ------------------------------------------------------
def outer_glow(rgba, size, radius=3, strength=0.45, color=(255, 255, 255)):
    """A soft light halo just outside the artwork, under it. Google's icon guideline: a mostly dark
    icon should get "a subtle white outer glow so it'll look good against dark backgrounds"."""
    alpha = [rgba[i * 4 + 3] / 255.0 for i in range(size * size)]

    def box(src, horizontal):
        out = [0.0] * (size * size)
        for line in range(size):
            idx = (lambda k: line * size + k) if horizontal else (lambda k: k * size + line)
            acc = sum(src[idx(min(size - 1, max(0, k)))] for k in range(-radius, radius + 1))
            for k in range(size):
                out[idx(k)] = acc / (2 * radius + 1)
                acc += src[idx(min(size - 1, k + radius + 1))] - src[idx(max(0, k - radius))]
        return out

    # Only around the OUTER silhouette: the narrow transparent gaps inside the mark (between the
    # frame and the blade) must stay see-through, or the logo itself changes. A morphological
    # closing (dilate, then erode) seals gaps narrower than ~2·radius; the glow lives outside that.
    solid = [1 if a > 0.12 else 0 for a in alpha]

    def morph(src, grow):
        out = src[:]
        for _ in range(radius):
            nxt = out[:]
            for i in range(size * size):
                x, y = i % size, i // size
                nb = [out[j] for j in ((i - 1) if x else i, (i + 1) if x < size - 1 else i, (i - size) if y else i, (i + size) if y < size - 1 else i)]
                nxt[i] = max(nb + [out[i]]) if grow else min(nb + [out[i]])
            out = nxt
        return out

    closed = morph(morph(solid, True), False)
    outside = [not c for c in closed]
    halo = [0.0 if outside[i] else 1.0 for i in range(size * size)]
    for _ in range(3):  # three box passes ≈ a gaussian
        halo = box(box(halo, True), False)
    out = bytearray(rgba)
    for i in range(size * size):
        ia = alpha[i]
        if not outside[i] and ia < 0.12:
            continue  # an inner gap: leave it transparent
        ga = min(1.0, halo[i] * strength) * (1.0 - ia)  # only outside / at the soft edge
        oa = ia + ga
        if oa <= 0:
            continue
        for c in range(3):
            out[i * 4 + c] = int(round((rgba[i * 4 + c] * ia + color[c] * ga) / oa))
        out[i * 4 + 3] = int(round(oa * 255))
    return bytes(out)


# ---- Build ---------------------------------------------------------------
def load_shield():
    """Highest-resolution copy of the brand shield we have (never upscale)."""
    master = os.path.join(ROOT, "server", "icon-512.png")
    src = master if os.path.exists(master) else os.path.join(ROOT, "store", "brand", "shield-transparent.png")
    w, h, px = read_png(src)
    px, w, h = trim(px, w, h)
    print("shield source:", os.path.relpath(src, ROOT), f"{w}x{h} (trimmed)")
    return px, w, h


def main():
    icons = os.path.join(ROOT, "icons")
    store = os.path.join(ROOT, "store")
    os.makedirs(icons, exist_ok=True)

    shield, sw, sh = load_shield()

    # Toolbar icons (16/32/48): the shield fills the square, a hair of padding so the
    # anti-aliased edge is never clipped by Chrome's own rounding.
    for size in (16, 32, 48):
        write_png(os.path.join(icons, f"icon{size}.png"), size, size, fit(shield, sw, sh, size, pad=0.02))
        print("icon", size)

    # 128: the install dialog, chrome://extensions and the store. Google's rule: 96x96 artwork with
    # 16px of transparent padding per side, plus a subtle light glow for dark backgrounds. The store
    # icon is the same image.
    icon128 = outer_glow(fit(shield, sw, sh, 128, pad=0.125), 128)
    for path in (os.path.join(icons, "icon128.png"), os.path.join(store, "store_icon_128.png")):
        write_png(path, 128, 128, icon128)
    print("icon 128 + store icon 128 (96px artwork, 16px padding, light glow)")
    # The promo tile (440x280) and the marquee (1400x560) are rendered by tools/store_promo.mjs.

if __name__ == "__main__":
    main()
