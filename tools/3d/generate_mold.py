#!/usr/bin/env python3
"""generate_mold.py — параметрична форма за карбон от solid (3D Maniac v2.0).

Взема готовия solid на ЧАСТТА (STEP) и генерира заготовка за ФОРМА: offset с
дебелината на ламината (ply), черупка (shell) за кухина и draft за изваждане.
Това е скриптовата страна на „композитната стъпка" от потока. Резултатът е
ЧЕРНОВА за инспекция — никога не режи форма без deviation/draft проверка.

Употреба:
  python3 generate_mold.py part.step --ply 1.2 --draft 3 --flange 8 --out mold.step
Зависимост: cadquery (pip install cadquery). Казва ясно, ако липсва.
"""
from __future__ import annotations
import argparse
import sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="STEP на частта (class-A страна)")
    ap.add_argument("--ply", type=float, default=1.0, help="дебелина на ламината (mm) → offset")
    ap.add_argument("--draft", type=float, default=3.0, help="draft ъгъл (°) — информативно")
    ap.add_argument("--flange", type=float, default=8.0, help="trim-allowance фланец (mm) — информативно")
    ap.add_argument("--out", default="mold.step")
    a = ap.parse_args()

    try:
        import cadquery as cq
    except Exception:
        sys.exit("✘ Липсва cadquery. Инсталирай: pip install cadquery (виж tools/3d/requirements.txt)")

    try:
        part = cq.importers.importStep(a.input)
    except Exception as e:
        sys.exit(f"✘ Не мога да заредя STEP: {e}")

    # Offset навън с дебелината на ламината → работната повърхнина на формата.
    try:
        shell = part.shell(a.ply)  # положителна дебелина = навън
    except Exception:
        # резервен вариант: външен offset solid
        shell = part.faces().shell(a.ply)

    cq.exporters.export(shell, a.out)
    print(f"✔ Заготовка за форма → {a.out}")
    print(f"  ply offset: {a.ply} mm · целеви draft: ≥{a.draft}° · trim фланец: {a.flange} mm")
    print("\nРъчно/проверка след това (QuickSurface или CAD):")
    print("  • draft analysis ≥ зададения ъгъл; завърти ориентацията за премахване на undercut")
    print("  • parting line + разделяне на половини; водещи щифтове 75–100 mm стъпка")
    print("  • spring-in компенсация при prepreg/автоклав; seal land при вакуум инфузия")
    print("  • deviation pass срещу частта ПРЕДИ да обявиш формата за готова — това е ЧЕРНОВА")


if __name__ == "__main__":
    main()
