#!/usr/bin/env python3
"""Render the extension icons and Chrome Web Store graphics.

Everything is drawn at 4x and downsampled with premultiplied-alpha averaging,
which gives clean anti-aliased edges without any external image libraries.
"""

import math
import os
import struct
import zlib

SS = 4  # supersampling factor

# ---- PNG writer ----------------------------------------------------------
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


def lerp(a, b, t):
    return a + (b - a) * t


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


# ---- Shield geometry (normalised 0..1) -----------------------------------
def half_extent(ny, mx, mtop, mbot):
    """Left/right shield edges at a given normalised y, or None if outside."""
    cx = 0.5
    Ty, By = mtop, 1 - mbot
    if ny < Ty or ny > By:
        return None
    hw = 0.5 - mx
    rc = hw * 0.42
    My = Ty + (By - Ty) * 0.55

    if ny <= My:
        left, right = cx - hw, cx + hw
        if ny < Ty + rc:
            dy = (Ty + rc) - ny
            inset = rc - math.sqrt(max(0.0, rc * rc - dy * dy))
            left += inset
            right -= inset
        return left, right

    t = (ny - My) / (By - My)
    w = hw * (1 - t) ** 0.62
    return cx - w, cx + w


def in_shield(nx, ny, mx, mtop, mbot):
    ext = half_extent(ny, mx, mtop, mbot)
    return ext is not None and ext[0] <= nx <= ext[1]


# ---- Icon sample ---------------------------------------------------------
RIM = (6, 6, 8)               # carbon black border (matches site #060608)
C_TOP = (0, 229, 255)         # Carbon Stealth cyan (#00e5ff)
C_BOT = (0, 150, 180)         # deeper cyan
WHITE = (6, 14, 18)           # near-black prohibition mark (contrast on cyan)

INNER = dict(mx=0.105, mtop=0.095, mbot=0.085)
OUTER = dict(mx=0.06, mtop=0.05, mbot=0.05)


def sample_icon(nx, ny):
    """Return RGBA (0..255) for one normalised point."""
    if not in_shield(nx, ny, **OUTER):
        return (0, 0, 0, 0)

    if not in_shield(nx, ny, **INNER):
        return (*RIM, 255)

    Ty = INNER["mtop"]
    By = 1 - INNER["mbot"]
    ty = (ny - Ty) / (By - Ty)
    t = max(0.0, min(1.0, ty * 0.78 + nx * 0.22))
    r, g, b = mix(C_TOP, C_BOT, t)

    weave = math.sin((nx + ny) * 90) * 4 + math.sin((nx - ny) * 90) * 4
    gloss = max(0.0, 0.18 - ty) * 120
    r = max(0, min(255, r + weave + gloss))
    g = max(0, min(255, g + weave + gloss * 0.6))
    b = max(0, min(255, b + weave + gloss * 0.6))

    # Prohibition mark.
    pcx, pcy = 0.5, Ty + (By - Ty) * 0.46
    R = (0.5 - INNER["mx"]) * 0.66
    dx, dy = nx - pcx, ny - pcy
    dist = math.hypot(dx, dy)
    ring = abs(dist - R) <= R * 0.17
    bx = dx * math.cos(math.radians(45)) - dy * math.sin(math.radians(45))
    by = dx * math.sin(math.radians(45)) + dy * math.cos(math.radians(45))
    bar = abs(by) <= R * 0.17 and abs(bx) <= R * 0.78
    if (ring or bar) and dist <= R + R * 0.2:
        return (*WHITE, 255)

    return (int(r), int(g), int(b), 255)


# ---- Renderer ------------------------------------------------------------
def render(size, sampler):
    hi = size * SS
    buf = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            ar = ag = ab = aa = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    nx = (x * SS + sx + 0.5) / hi
                    ny = (y * SS + sy + 0.5) / hi
                    r, g, b, a = sampler(nx, ny)
                    af = a / 255.0
                    ar += r * af
                    ag += g * af
                    ab += b * af
                    aa += af
            alpha = aa / (SS * SS)
            if aa > 0:
                r, g, b = int(ar / aa), int(ag / aa), int(ab / aa)
            else:
                r = g = b = 0
            i = (y * size + x) * 4
            buf[i : i + 4] = bytes((r, g, b, int(alpha * 255)))
    return buf


# ---- Store graphics ------------------------------------------------------
def carbon_bg(w, h):
    buf = bytearray(w * h * 4)
    for y in range(h):
        base = mix((18, 20, 24), (9, 10, 12), y / h)
        for x in range(w):
            weave = math.sin((x + y) * 0.6) * 3 + math.sin((x - y) * 0.6) * 3
            r = int(max(0, min(255, base[0] + weave)))
            g = int(max(0, min(255, base[1] + weave)))
            b = int(max(0, min(255, base[2] + weave)))
            i = (y * w + x) * 4
            buf[i : i + 4] = bytes((r, g, b, 255))
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
def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    icons = os.path.join(root, "icons")
    store = os.path.join(root, "store")
    os.makedirs(icons, exist_ok=True)
    os.makedirs(store, exist_ok=True)

    for s in (16, 32, 48, 128):
        write_png(os.path.join(icons, f"icon{s}.png"), s, s, render(s, sample_icon))
        print("icon", s)

    write_png(os.path.join(store, "store_icon_128.png"), 128, 128, render(128, sample_icon))

    w, h = 440, 280
    bg = carbon_bg(w, h)
    bar(bg, w, h, 0, h - 6, w, h, (0, 229, 255))
    composite(bg, w, h, render(200, sample_icon), 200, 200, 40, (h - 200) // 2)
    write_png(os.path.join(store, "promo_small_440x280.png"), w, h, bg)
    print("promo 440x280")

    w, h = 1400, 560
    bg = carbon_bg(w, h)
    bar(bg, w, h, 0, h - 10, w, h, (0, 229, 255))
    composite(bg, w, h, render(380, sample_icon), 380, 380, 130, (h - 380) // 2)
    write_png(os.path.join(store, "marquee_1400x560.png"), w, h, bg)
    print("marquee 1400x560")


if __name__ == "__main__":
    main()
