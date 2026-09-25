# tools/3d — подготовка и проверка на скан (3D Maniac)

Това е скриптуемата част от reverse-engineering потока — почистване и **обективна
проверка** на скан-mesh, преди да тръгне ръчният Mesh→Solid в QuickSurface Pro.

## Употреба

```bash
pip install -r tools/3d/requirements.txt

# почисти + провери готовност за surfacing:
python3 tools/3d/clean_and_validate.py scan.stl --out clean.stl --target-faces 200000

# + deviation спрямо референтен mesh/CAD-export (STL/OBJ/PLY):
python3 tools/3d/clean_and_validate.py clean.stl --deviation reference.stl
```

## Какво прави

- Зарежда mesh (STL/OBJ/PLY), поправя (нормали, winding, дупки, degenerate/dubli).
- По избор децимира до целеви брой триъгълници.
- Проверява **watertight / manifold** и дава присъда „готов / не“ за повърхнини.
- По избор смята **deviation** (ref → mesh): средно, max, 95-ти персентил, % в ±0.2 mm.

Целите за deviation (тяло ±0.1–0.2 mm; пасващи повърхнини ≤0.05–0.1 mm) идват от
системния промпт на агента. QuickSurface остава GUI — тук вършим само prep/verify.
