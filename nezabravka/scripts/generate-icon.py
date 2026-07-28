#!/usr/bin/env python3
"""Рисува иконата на приложението (1024×1024 PNG) — цвете „незабравка“.

Нула зависимости (само стандартната библиотека), детерминистично: пуснато
два пъти, дава байт по байт същия файл. Пусни след промяна на цветовете:

    python3 scripts/generate-icon.py

Изходът се записва в Nezabravka/Resources/Assets.xcassets/AppIcon.appiconset/.
"""

from __future__ import annotations

import math
import pathlib
import struct
import zlib

SIZE = 1024
SUPERSAMPLE = 2  # рисуваме двойно по-голямо и смаляваме → меки ръбове
OUT = (
    pathlib.Path(__file__).resolve().parent.parent
    / "Nezabravka/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
)

BG_TOP = (46, 26, 97)      # тъмно индиго
BG_BOTTOM = (86, 54, 176)  # виолетово
PETAL = (150, 190, 255)    # светло синьо — цветът на незабравката
PETAL_EDGE = (206, 226, 255)
CENTER = (255, 209, 102)   # жълта среда


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def render() -> bytearray:
    n = SIZE * SUPERSAMPLE
    pixels = bytearray(n * n * 3)
    cx = cy = n / 2

    # Пет венчелистчета около центъра.
    petal_distance = n * 0.185
    petal_radius = n * 0.155
    petals = []
    for index in range(5):
        angle = -math.pi / 2 + index * (2 * math.pi / 5)
        petals.append((cx + math.cos(angle) * petal_distance, cy + math.sin(angle) * petal_distance))
    center_radius = n * 0.072

    for y in range(n):
        row = y * n * 3
        bg = lerp(BG_TOP, BG_BOTTOM, y / (n - 1))
        for x in range(n):
            color = bg
            for px, py in petals:
                d = math.hypot(x - px, y - py)
                if d <= petal_radius:
                    color = lerp(PETAL_EDGE, PETAL, min(1.0, d / petal_radius))
                    break
            if math.hypot(x - cx, y - cy) <= center_radius:
                color = CENTER
            offset = row + x * 3
            pixels[offset] = color[0]
            pixels[offset + 1] = color[1]
            pixels[offset + 2] = color[2]
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
