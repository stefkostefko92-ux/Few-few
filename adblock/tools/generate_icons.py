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


# ---- Icon sample: Cosmic Slate (1:1 with server/favicon.svg) -------------
# Dark rounded tile, cyan-gradient shield OUTLINE with a faint fill, and the
# lightning bolt. Small sizes (16/32) get a thicker stroke and no faint fill
# so the silhouette stays crisp instead of muddy.
TILE = (6, 6, 8)              # carbon black tile (#060608)
CY_TOP = (0, 229, 255)        # #00e5ff
CY_BOT = (0, 184, 212)        # #00b8d4
TILE_R = 14 / 64              # tile corner radius (rx 14 on the 64 grid)
SH_X0, SH_W = 0.20, 0.60      # shield box inside the tile (fractions)
SH_Y0, SH_H = 0.12, 0.76
# lightning bolt polygon from the favicon path "M34 20 L24 35 h7 l-2 11 12 -16 h-8 z"
BOLT = [(34 / 64, 20 / 64), (24 / 64, 35 / 64), (31 / 64, 35 / 64),
        (29 / 64, 46 / 64), (41 / 64, 30 / 64), (33 / 64, 30 / 64)]
INNER = dict(mx=0.105, mtop=0.095, mbot=0.085)       # stroke inner edge (48/128)
INNER_SMALL = dict(mx=0.17, mtop=0.16, mbot=0.15)    # thicker stroke (16/32)
OUTER = dict(mx=0.06, mtop=0.05, mbot=0.05)


def in_tile(nx, ny):
    r = TILE_R
    x, y = min(nx, 1 - nx), min(ny, 1 - ny)
    if x >= r or y >= r:
        return True
    return (x - r) ** 2 + (y - r) ** 2 <= r * r


def in_poly(nx, ny, pts):
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > ny) != (yj > ny):
            xint = xj + (ny - yj) * (xi - xj) / (yi - yj)
            if nx < xint:
                inside = not inside
        j = i
    return inside


def cyan(ny):
    r, g, b = mix(CY_TOP, CY_BOT, max(0.0, min(1.0, ny)))
    return (int(r), int(g), int(b))


def sample_v2(nx, ny, small=False):
    """RGBA for one normalised point of the tile icon."""
    if not in_tile(nx, ny):
        return (0, 0, 0, 0)
    if in_poly(nx, ny, BOLT):
        return (*cyan(ny), 255)
    sx = (nx - SH_X0) / SH_W
    sy = (ny - SH_Y0) / SH_H
    if 0 <= sx <= 1 and 0 <= sy <= 1 and in_shield(sx, sy, **OUTER):
        if not in_shield(sx, sy, **(INNER_SMALL if small else INNER)):
            return (*cyan(ny), 255)                       # shield stroke
        if not small:
            r, g, b = mix(TILE, cyan(ny), 0.18)           # faint interior fill
            return (int(r), int(g), int(b), 255)
    return (*TILE, 255)


def sample_v2_small(nx, ny):
    return sample_v2(nx, ny, True)


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
        write_png(os.path.join(icons, f"icon{s}.png"), s, s, render(s, sample_v2_small if s <= 32 else sample_v2))
        print("icon", s)

    # Store icon: the Web Store wants the artwork inside a 96x96 area with 16px of
    # transparent padding on a 128x128 canvas (icons/ stay full-bleed — Chrome scales those).
    inner = render(96, sample_v2)
    padded = bytearray(128 * 128 * 4)
    for y in range(96):
        padded[((y + 16) * 128 + 16) * 4:((y + 16) * 128 + 16 + 96) * 4] = inner[y * 96 * 4:(y + 1) * 96 * 4]
    write_png(os.path.join(store, "store_icon_128.png"), 128, 128, padded)

    w, h = 440, 280
    bg = carbon_bg(w, h)
    bar(bg, w, h, 0, h - 6, w, h, (0, 229, 255))
    composite(bg, w, h, render(200, sample_v2), 200, 200, 40, (h - 200) // 2)
    write_png(os.path.join(store, "promo_small_440x280.png"), w, h, bg)
    print("promo 440x280")

    w, h = 1400, 560
    bg = carbon_bg(w, h)
    bar(bg, w, h, 0, h - 10, w, h, (0, 229, 255))
    composite(bg, w, h, render(380, sample_v2), 380, 380, 130, (h - 380) // 2)
    write_png(os.path.join(store, "marquee_1400x560.png"), w, h, bg)
    print("marquee 1400x560")


if __name__ == "__main__":
    main()
