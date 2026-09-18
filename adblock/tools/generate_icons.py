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
def carbon_bg(w, h):
    buf = bytearray(w * h * 4)
    for y in range(h):
        t = y / h
        base = (int(18 + (9 - 18) * t), int(20 + (10 - 20) * t), int(24 + (12 - 24) * t))
        for x in range(w):
            weave = math.sin((x + y) * 0.6) * 3 + math.sin((x - y) * 0.6) * 3
            i = (y * w + x) * 4
            buf[i] = int(max(0, min(255, base[0] + weave)))
            buf[i + 1] = int(max(0, min(255, base[1] + weave)))
            buf[i + 2] = int(max(0, min(255, base[2] + weave)))
            buf[i + 3] = 255
    return buf


def light_bg(w, h):
    """Light card for the promo tile: the supplied lockup has a NAVY wordmark, so
    it is only legible on a light ground (on carbon the 'AdBlock' half vanishes)."""
    buf = bytearray(w * h * 4)
    for y in range(h):
        t = y / h
        base = (int(255 + (233 - 255) * t), int(255 + (238 - 255) * t), int(255 + (244 - 255) * t))
        for x in range(w):
            weave = math.sin((x + y) * 0.6) * 1.5 + math.sin((x - y) * 0.6) * 1.5
            i = (y * w + x) * 4
            buf[i] = int(max(0, min(255, base[0] + weave)))
            buf[i + 1] = int(max(0, min(255, base[1] + weave)))
            buf[i + 2] = int(max(0, min(255, base[2] + weave)))
            buf[i + 3] = 255
    return buf


def composite(bg, w, h, fg, fw, fh, ox, oy):
    for y in range(fh):
        for x in range(fw):
            si = (y * fw + x) * 4
            a = fg[si + 3]
            if not a:
                continue
            dx, dy = ox + x, oy + y
            if 0 <= dx < w and 0 <= dy < h:
                di = (dy * w + dx) * 4
                af = a / 255.0
                for c in range(3):
                    bg[di + c] = int(fg[si + c] * af + bg[di + c] * (1 - af))
                bg[di + 3] = 255


def bar(buf, w, h, x0, y0, x1, y1, color):
    for y in range(max(0, y0), min(h, y1)):
        for x in range(max(0, x0), min(w, x1)):
            i = (y * w + x) * 4
            buf[i : i + 3] = bytes(color)


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

    # Toolbar/extension icons: the shield fills the square, a hair of padding so
    # the anti-aliased edge is never clipped by Chrome's own rounding.
    for size in (16, 32, 48, 128):
        write_png(os.path.join(icons, f"icon{size}.png"), size, size, fit(shield, sw, sh, size, pad=0.02))
        print("icon", size)

    # Store icon: artwork inside 96x96 with 16px transparent padding on 128x128.
    write_png(os.path.join(store, "store_icon_128.png"), 128, 128, fit(shield, sw, sh, 128, pad=0.125))
    print("store icon 128")

    # Small promo tile: the full lockup (shield + wordmark), downscaled.
    lw, lh, lockup = read_png(os.path.join(store, "brand", "logo-transparent.png"))
    lockup, lw, lh = trim(lockup, lw, lh)
    w, h = 440, 280
    bg = light_bg(w, h)
    bar(bg, w, h, 0, h - 6, w, h, (0, 229, 255))
    tw = 372
    th = max(1, int(round(lh * tw / lw)))
    composite(bg, w, h, resize(lockup, lw, lh, tw, th), tw, th, (w - tw) // 2, (h - th) // 2 - 4)
    write_png(os.path.join(store, "promo_small_440x280.png"), w, h, bg)
    print("promo 440x280")

    # Marquee: the shield alone, large — still a downscale from the 512 master.
    w, h = 1400, 560
    bg = carbon_bg(w, h)
    bar(bg, w, h, 0, h - 10, w, h, (0, 229, 255))
    composite(bg, w, h, fit(shield, sw, sh, 380), 380, 380, 130, (h - 380) // 2)
    write_png(os.path.join(store, "marquee_1400x560.png"), w, h, bg)
    print("marquee 1400x560")


if __name__ == "__main__":
    main()
