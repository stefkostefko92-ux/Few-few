#!/usr/bin/env python3
"""Generate a 3D-printable STL of a QR code.

Builds a flat base plate (including the quiet zone) with the dark QR modules
raised as solid boxes on top. Output is a watertight binary STL that slices
cleanly in any common slicer (Cura, PrusaSlicer, Bambu Studio, ...).

Usage:
    python3 qr_to_stl.py "https://carbonstealth.eu" output/carbonstealth_qr.stl
"""
import struct
import sys
import os

import qrcode
from qrcode.constants import ERROR_CORRECT_H

# --- Print geometry (millimetres) ----------------------------------------
MODULE_MM = 2.0          # size of a single QR "pixel" in X/Y
BASE_THICKNESS = 1.6     # height of the solid base plate
QR_HEIGHT = 1.6          # how far the dark modules rise above the base
BORDER_MODULES = 4       # quiet zone (required for reliable scanning)


def build_matrix(data: str):
    qr = qrcode.QRCode(
        error_correction=ERROR_CORRECT_H,  # robust against print artefacts
        box_size=1,
        border=BORDER_MODULES,
    )
    qr.add_data(data)
    qr.make(fit=True)
    # matrix[row][col] == True for dark modules
    return qr.get_matrix()


def box_triangles(x0, y0, z0, x1, y1, z1):
    """Return the 12 triangles (each: normal + 3 vertices) of an axis-aligned box."""
    # 8 corners
    v = [
        (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),  # bottom 0-3
        (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),  # top    4-7
    ]
    # faces as quads (outward winding) with their normal
    faces = [
        ((0, 0, -1), (0, 1, 2, 3)),  # bottom
        ((0, 0, 1), (4, 5, 6, 7)),   # top
        ((0, -1, 0), (0, 1, 5, 4)),  # front
        ((1, 0, 0), (1, 2, 6, 5)),   # right
        ((0, 1, 0), (2, 3, 7, 6)),   # back
        ((-1, 0, 0), (3, 0, 4, 7)),  # left
    ]
    tris = []
    for n, (a, b, c, d) in faces:
        tris.append((n, v[a], v[b], v[c]))
        tris.append((n, v[a], v[c], v[d]))
    return tris


def main():
    data = sys.argv[1] if len(sys.argv) > 1 else "https://carbonstealth.eu"
    out = sys.argv[2] if len(sys.argv) > 2 else "output/qr.stl"
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)

    matrix = build_matrix(data)
    n = len(matrix)
    span = n * MODULE_MM

    tris = []
    # Base plate (covers everything, including quiet zone)
    tris += box_triangles(0, 0, 0, span, span, BASE_THICKNESS)

    # Raised dark modules. Flip Y so the STL orientation matches the printed
    # image when viewed from +Z (QR row 0 is the top).
    for row in range(n):
        for col in range(n):
            if not matrix[row][col]:
                continue
            x0 = col * MODULE_MM
            y0 = (n - 1 - row) * MODULE_MM
            tris += box_triangles(
                x0, y0, BASE_THICKNESS,
                x0 + MODULE_MM, y0 + MODULE_MM, BASE_THICKNESS + QR_HEIGHT,
            )

    # Write binary STL
    with open(out, "wb") as f:
        f.write(b"\0" * 80)               # 80-byte header
        f.write(struct.pack("<I", len(tris)))
        for nrm, a, b, c in tris:
            f.write(struct.pack("<3f", *nrm))
            f.write(struct.pack("<3f", *a))
            f.write(struct.pack("<3f", *b))
            f.write(struct.pack("<3f", *c))
            f.write(struct.pack("<H", 0))

    # PNG preview for sanity checking
    try:
        img = qrcode.make(data, error_correction=ERROR_CORRECT_H,
                          border=BORDER_MODULES, box_size=10)
        png = os.path.splitext(out)[0] + "_preview.png"
        img.save(png)
    except Exception:
        png = None

    print(f"Data:        {data}")
    print(f"Modules:     {n} x {n} (incl. {BORDER_MODULES}-module quiet zone)")
    print(f"Footprint:   {span:.1f} x {span:.1f} mm")
    print(f"Total height:{BASE_THICKNESS + QR_HEIGHT:.1f} mm "
          f"(base {BASE_THICKNESS} + relief {QR_HEIGHT})")
    print(f"Triangles:   {len(tris)}")
    print(f"STL:         {out}")
    if png:
        print(f"Preview:     {png}")


if __name__ == "__main__":
    main()
