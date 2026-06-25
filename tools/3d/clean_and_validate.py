#!/usr/bin/env python3
"""clean_and_validate.py — подготовка и проверка на скан-mesh за reverse engineering.

„Ръцете" на агента 3D Maniac за частта, която QuickSurface (GUI) не покрива:
почистване на суров скан и обективна проверка преди да тръгне Mesh→Solid.

Стъпки: зареди mesh → поправи (запълни дупки, махни dubli/degenerate) →
(по избор) децимирай → провери watertight/manifold → отчет (+ по избор
deviation спрямо референтен mesh/CAD-export).

Употреба:
  python3 clean_and_validate.py IN.stl [--out OUT.stl] [--target-faces N]
                                [--deviation REF.stl]
Изход: отчет на stdout; почистеният mesh се записва, ако е подаден --out.

Зависимости (виж requirements.txt): trimesh (задължително), pymeshlab/open3d
(по избор, за по-силно почистване и deviation). Скриптът казва ясно какво липсва.
"""
from __future__ import annotations
import argparse
import sys


def _try_import(name):
    try:
        return __import__(name)
    except Exception:
        return None


def load(path):
    trimesh = _try_import("trimesh")
    if trimesh is None:
        sys.exit("✘ Липсва trimesh. Инсталирай: pip install trimesh (виж requirements.txt)")
    m = trimesh.load(path, force="mesh")
    if m.is_empty:
        sys.exit(f"✘ Празен/нечетим mesh: {path}")
    return trimesh, m


def report(tag, m):
    print(f"\n── {tag} ──")
    print(f"  върхове: {len(m.vertices):,} · триъгълници: {len(m.faces):,}")
    print(f"  watertight: {m.is_watertight} · winding consistent: {m.is_winding_consistent}")
    try:
        print(f"  обем: {m.volume:.2f} mm³ · площ: {m.area:.2f} mm²")
    except Exception:
        pass
    bb = m.bounds
    if bb is not None:
        d = bb[1] - bb[0]
        print(f"  габарити (mm): {d[0]:.1f} × {d[1]:.1f} × {d[2]:.1f}")


def repair(trimesh, m):
    m.remove_infinite_values()
    m.update_faces(m.unique_faces())
    m.update_faces(m.nonzero_faces())
    m.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(m)
    trimesh.repair.fix_winding(m)
    trimesh.repair.fill_holes(m)
    return m


def decimate(m, target):
    try:
        return m.simplify_quadric_decimation(target)
    except Exception as e:
        print(f"  ⚠ децимацията пропусната ({e}); за по-добра ползвай pymeshlab/open3d")
        return m


def deviation(trimesh, m, ref_path):
    _, ref = load(ref_path)
    # Разстояние от върховете на ref до повърхността на m (proxy за deviation).
    try:
        from trimesh.proximity import closest_point
        _, dist, _ = closest_point(m, ref.vertices)
        import numpy as np
        print("\n── Deviation (ref → mesh) ──")
        print(f"  средно: {dist.mean():.4f} mm · max: {dist.max():.4f} mm · "
              f"95-ти персентил: {np.percentile(dist, 95):.4f} mm")
        good = (dist <= 0.2).mean() * 100
        print(f"  в ±0.2 mm: {good:.1f}% от точките")
        print("  Цел: тяло ±0.1–0.2 mm; пасващи повърхнини ≤0.05–0.1 mm.")
    except Exception as e:
        print(f"  ⚠ deviation пропуснат: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out")
    ap.add_argument("--target-faces", type=int)
    ap.add_argument("--deviation", metavar="REF")
    a = ap.parse_args()

    trimesh, m = load(a.input)
    report("Вход", m)
    m = repair(trimesh, m)
    if a.target_faces:
        m = decimate(m, a.target_faces)
    report("След почистване", m)

    # Присъда за готовност към Mesh→Solid.
    print("\n── Присъда ──")
    if m.is_watertight and m.is_winding_consistent:
        print("  ✔ Watertight + consistent → готов за подравняване и повърхнини.")
    else:
        print("  ✘ НЕ е watertight/consistent → запълни дупки/поправи преди surfacing.")
        print("    (за тежки случаи: pymeshlab Screened Poisson или ръчно в QuickSurface mesh repair)")

    if a.deviation:
        deviation(trimesh, m, a.deviation)

    if a.out:
        m.export(a.out)
        print(f"\n✔ Записан почистен mesh → {a.out}")
    print("\nСледва (в QuickSurface): подравни към смислена CS → сегментирай features → "
          "призматични първо, после class-A freeform → deviation pass.")


if __name__ == "__main__":
    main()
