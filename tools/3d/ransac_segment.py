#!/usr/bin/env python3
"""ransac_segment.py — авто-сегментация на скан в примитиви (3D Maniac v2.0).

Изважда планарни региони чрез RANSAC (Open3D), за да засее параметрични features
преди ръчното surfacing в QuickSurface. Това е „призматичното първо" от потока,
автоматизирано — намира равнините, ти решаваш кои да параметризираш.

Употреба:  python3 ransac_segment.py scan.ply [--max-planes 6] [--dist 0.4]
Изход: брой/уравнения на намерените равнини + (по избор) оцветен износ.
Зависимост: open3d (pip install open3d). Казва ясно, ако липсва.
"""
from __future__ import annotations
import argparse
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--max-planes", type=int, default=6)
    ap.add_argument("--dist", type=float, default=0.4, help="RANSAC distance threshold (mm)")
    ap.add_argument("--out", help="оцветен PLY с намерените равнини")
    a = ap.parse_args()

    try:
        import open3d as o3d
        import numpy as np
    except Exception:
        sys.exit("✘ Липсва open3d. Инсталирай: pip install open3d (виж tools/3d/requirements.txt)")

    geo = o3d.io.read_triangle_mesh(a.input)
    if len(geo.vertices) == 0:
        pcd = o3d.io.read_point_cloud(a.input)
    else:
        pcd = geo.sample_points_uniformly(number_of_points=80000)
    if len(pcd.points) == 0:
        sys.exit(f"✘ Празен/нечетим вход: {a.input}")

    rest = pcd
    print(f"Точки: {len(pcd.points):,} · праг: {a.dist} mm\n── Намерени равнини ──")
    colored = []
    rng = np.random.default_rng(42)
    for i in range(a.max_planes):
        if len(rest.points) < 200:
            break
        model, inliers = rest.segment_plane(distance_threshold=a.dist, ransac_n=3, num_iterations=1000)
        if len(inliers) < 200:
            break
        a_, b_, c_, d_ = model
        plane = rest.select_by_index(inliers)
        col = rng.random(3)
        plane.paint_uniform_color(col)
        colored.append(plane)
        print(f"  #{i+1}: {len(inliers):>6} точки · нормала ({a_:.3f}, {b_:.3f}, {c_:.3f}) · d={d_:.2f}")
        rest = rest.select_by_index(inliers, invert=True)

    print(f"\nОстатък (freeform/органична зона): {len(rest.points):,} точки → ръчно class-A surfacing.")
    print("Следва: констрейннати примитиви по тези равнини + подравняване към смислена CS.")
    if a.out and colored:
        merged = colored[0]
        for p in colored[1:]:
            merged += p
        o3d.io.write_point_cloud(a.out, merged)
        print(f"✔ Оцветен износ → {a.out}")


if __name__ == "__main__":
    main()
