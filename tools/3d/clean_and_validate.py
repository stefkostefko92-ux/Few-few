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
    # Отделни тела: плаваща частица от скана раздува габаритите и обема (3D Maniac, 2026-09-24).
    try:
        bodies = m.body_count
    except Exception:
        bodies = None
    if bodies and bodies > 1:
        print(f"  ⚠ отделни тела: {bodies} — габаритите/обемът включват всички; махни floater-ите преди Mesh→Solid")


def repair(trimesh, m):
    m.remove_infinite_values()
    m.update_faces(m.unique_faces())
    m.update_faces(m.nondegenerate_faces())  # nonzero_faces() не съществува в trimesh 5.x → срив на всеки вход
    m.remove_unreferenced_vertices()
    # multibody=True: иначе обърнато отделно тяло остава обърнато и обемът лъже зад „watertight“.
    trimesh.repair.fix_normals(m, multibody=True)
    trimesh.repair.fix_winding(m)
    try:
        trimesh.repair.fill_holes(m)
    except ModuleNotFoundError as e:
        # Голият `pip install trimesh` няма networkx → срив на основния случай.
        print(f"  ⚠ запълването на дупки пропуснато — липсва {e.name or 'networkx'}; инсталирай: pip install -r tools/3d/requirements.txt")
    return m


def decimate(m, target):
    try:
        # По име: в trimesh 5.x сигнатурата е (percent, face_count, aggression) — позиционно
        # `target` ставаше „процент“ и децимацията или гърмеше, или правеше друго.
        return m.simplify_quadric_decimation(face_count=int(target))
    except Exception as e:
        print(f"  ⚠ децимацията пропусната ({e}); за по-добра ползвай pymeshlab/open3d")
        return m


def deviation(trimesh, m, ref_path, heatmap=None):
    _, ref = load(ref_path)
    # Разстояние от върховете на ref до повърхността на m (proxy за deviation).
    try:
        from trimesh.proximity import closest_point
        import numpy as np
        # Плътна извадка от ПОВЪРХНИНАТА на ref, не само върховете ѝ: груба референция (малко върхове)
        # иначе дава 0.0000 mm отклонение за издутина между върховете.
        pts = np.vstack([ref.vertices, ref.sample(20000)]) if len(ref.faces) else ref.vertices
        _, dist, _ = closest_point(m, pts)
        print("\n── Deviation (ref → mesh) ──")
        print(f"  средно: {dist.mean():.4f} mm · max: {dist.max():.4f} mm · "
              f"95-ти персентил: {np.percentile(dist, 95):.4f} mm")
        good = (dist <= 0.2).mean() * 100
        print(f"  в ±0.2 mm: {good:.1f}% от точките")
        print("  Цел: тяло ±0.1–0.2 mm; пасващи повърхнини ≤0.05–0.1 mm.")
        if heatmap:
            # Цветна карта: зелено ≤0.1, жълто ≤0.2, червено над → PLY за оглед.
            cap = max(0.3, float(np.percentile(dist, 95)))
            t = np.clip(dist / cap, 0, 1)
            colors = np.zeros((len(dist), 4), dtype=np.uint8)
            colors[:, 0] = (t * 255).astype(np.uint8)          # R расте с грешката
            colors[:, 1] = ((1 - t) * 255).astype(np.uint8)    # G пада
            colors[:, 3] = 255
            cloud = trimesh.PointCloud(pts, colors=colors)
            cloud.export(heatmap)
            print(f"  ✔ Heatmap (зелено=добре, червено=отклонение) → {heatmap}")
    except Exception as e:
        print(f"  ⚠ deviation пропуснат: {e}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out")
    ap.add_argument("--target-faces", type=int)
    ap.add_argument("--deviation", metavar="REF")
    ap.add_argument("--heatmap", metavar="OUT.ply", help="цветна карта на отклонението (с --deviation)")
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
        deviation(trimesh, m, a.deviation, heatmap=a.heatmap)

    if a.out:
        m.export(a.out)
        print(f"\n✔ Записан почистен mesh → {a.out}")
    print("\nСледва (в QuickSurface): подравни към смислена CS → сегментирай features → "
          "призматични първо, после class-A freeform → deviation pass.")


if __name__ == "__main__":
    main()
