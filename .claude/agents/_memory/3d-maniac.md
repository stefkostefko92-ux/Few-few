# Памет на агента „3d-maniac" (v4.0)

Трайно файлово „учене" между извикванията (Claude Code субагентите са stateless).
**Прочети това в началото на всяка задача.** Накрая допиши само **проверена** поука
(с дата + източник). Без тайни/лични данни. Подреждай най-новото отгоре.

## Поуки (verified)
- **2026-06-26 (Aletta перка):** Силно усукана/контортирана тънка перка (PCA spine завой ~643°, дебелина ~13mm) НЕ се повърхностни с глобален автоматичен метод в headless FreeCAD 1.1: loft на перпендикулярни сечения балонира (self-intersect 5000-51000 cm³ дори с LE/TE seam-подравняване), ruled loft дава верен ОБЕМ но грешна форма (измамен), structured BSpline от мрежа сечения се препокрива, two-face height-field над PCA(long,mid) дава ВАЛИДЕН watertight solid но медиана ~1.4mm (height-field не лови curl-а). За class-A <0.2mm на такава геометрия ТРЯБВА интерактивно multi-patch surfacing (QuickSurface Mesh Selection + ръчни quad G2 / Geomagic Autosurface) — както реф. v3 (28 лица, 0.22mm). Източник: собствени измервания /tmp/aletta_maniac_v2_report.txt.
- **2026-06-26 (поток):** Щифтове = чисти аналит. примитиви: фитни САМО band-а на M8 стеблото с фиксирана ос (PCA) → least-squares circle (Stud2 r=3.94, rms 0.039mm = M8). Не фитвай цял щифт с един cilindro (collare Ø~14 → стебло Ø8 → връх Ø4 не са един радиус). Boss(конус)+stem(cyl)+tip(конус), boss удължен ~25mm за гарантирана пенетрация при fuse. removeSplitter() след fuse → чисти лица.
- **2026-06-26 (грейдър):** trimesh.proximity.closest_point на BRep-тесел. с >1M трг е OOM/timeout (>2min). За deviation: тесел. груба + cKDTree върху ~400k sample_surface точки на CAD, заявка от скан-върховете. Бързо и стабилно.
- **2026-06-25:** QuickSurface 2026 е на Parasolid kernel (G2 lofts, surface flattening); metrology скан цели ~0.02 mm.
