#!/usr/bin/env python3
"""Рисува иконата на приложението (1024×1024 PNG) в палитрата на Carbon Stealth.

Мотив: **отворен пръстен със засечка** — циферблат, чийто прорез сочи часа, за
който си насрочил напомняне. Геометрия, не илюстрация: марката е въглерод
(#00020A) и циан (#00E5FF), а иконата трябва да се чете и на 60 px в дока.

Нула зависимости (само стандартната библиотека), детерминистично: пуснато два
пъти, дава байт по байт същия файл. Пусни след промяна на цветовете:

    python3 scripts/generate-icon.py

Изходът се записва в Karakochev/Resources/Assets.xcassets/AppIcon.appiconset/.
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib

SIZE = 1024
SUPERSAMPLE = 3  # рисуваме тройно по-голямо и смаляваме → чисти дъги без назъбване
OUT = (
    pathlib.Path(__file__).resolve().parent.parent
    / "Karakochev/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
)

# Палитрата е на Carbon Stealth (виж agents-dashboard/index.html).
CARBON_TOP = (0, 6, 18)  # #000612 — въглерод
CARBON_BOTTOM = (10, 22, 34)  # #0A1622 — едва доловим наклон надолу
CYAN = (0, 229, 255)  # #00E5FF — брандовият акцент
CYAN_DIM = (0, 118, 137)  # затихващата част на пръстена
GLOW = (0, 229, 255)


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def render() -> bytearray:
    n = SIZE * SUPERSAMPLE
    pixels = bytearray(n * n * 3)
    cx = cy = (n - 1) / 2

    ring_radius = n * 0.300
    ring_half = n * 0.030  # половин дебелина на пръстена
    gap_center = -math.pi / 2  # прорезът гледа нагоре (12 часа)
    gap_half = math.radians(26)
    tick_inner = n * 0.020  # тръгва от самата точка — стрелка, не удивителен знак
    tick_outer = n * 0.256
    tick_half = n * 0.024
    dot_radius = n * 0.047
    halo_span = (ring_radius + ring_half) * 0.62

    for y in range(n):
        row = y * n * 3
        base = lerp(CARBON_TOP, CARBON_BOTTOM, y / (n - 1))
        dy = y - cy
        for x in range(n):
            dx = x - cx
            distance = math.hypot(dx, dy)
            color = base

            # Ореол: цианът се разлива меко около пръстена — дълбочина без размиване.
            spread = abs(distance - ring_radius)
            if spread < halo_span:
                falloff = 1.0 - spread / halo_span
                color = lerp(color, GLOW, 0.14 * falloff * falloff)

            # Пръстенът, прекъснат горе.
            if abs(distance - ring_radius) <= ring_half:
                angle = math.atan2(dy, dx)
                delta = abs((angle - gap_center + math.pi) % (2 * math.pi) - math.pi)
                if delta > gap_half:
                    # Затихва към прореза — окото тръгва оттам.
                    t = min(1.0, (delta - gap_half) / math.radians(150))
                    color = lerp(CYAN_DIM, CYAN, t)

            # Засечката: къс лъч от центъра към прореза, със заоблени краища.
            if dy < 0 and tick_inner <= distance <= tick_outer and abs(dx) <= tick_half:
                color = CYAN
            elif math.hypot(dx, dy + tick_inner) <= tick_half or math.hypot(dx, dy + tick_outer) <= tick_half:
                color = CYAN

            # Центърът — самият момент.
            if distance <= dot_radius:
                color = CYAN

            offset = row + x * 3
            pixels[offset] = round(color[0])
            pixels[offset + 1] = round(color[1])
            pixels[offset + 2] = round(color[2])
    return pixels


def downsample(pixels: bytearray) -> bytearray:
    n = SIZE * SUPERSAMPLE
    factor = SUPERSAMPLE
    out = bytearray(SIZE * SIZE * 3)
    samples = factor * factor
    for y in range(SIZE):
        for x in range(SIZE):
            totals = [0, 0, 0]
            for dy in range(factor):
                base = ((y * factor + dy) * n + x * factor) * 3
                for dx in range(factor):
                    offset = base + dx * 3
                    totals[0] += pixels[offset]
                    totals[1] += pixels[offset + 1]
                    totals[2] += pixels[offset + 2]
            target = (y * SIZE + x) * 3
            out[target] = totals[0] // samples
            out[target + 1] = totals[1] // samples
            out[target + 2] = totals[2] // samples
    return out


def write_png(path: pathlib.Path, pixels: bytearray) -> None:
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)  # филтър „None“ за реда
        raw += pixels[y * SIZE * 3 : (y + 1) * SIZE * 3]

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)  # 8 бита, truecolor
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png)


if __name__ == "__main__":
    write_png(OUT, downsample(render()))
    print(f"готово: {OUT} ({OUT.stat().st_size // 1024} KB)")
