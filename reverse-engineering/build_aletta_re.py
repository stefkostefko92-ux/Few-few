# -*- coding: utf-8 -*-
"""
Reverse engineering "Aletta scannerizzata" — FreeCAD 1.1 (headless)
===================================================================
Workflow (equivalente scriptato di quello richiesto in GUI):
  1. Ambiente Mesh   : sezioni trasversali della mesh scansionata (piani Z)
  2. Curves          : interpolazione BSpline delle polilinee di sezione
                       (equivalente di Curves -> Interpolate / freehand bspline)
  3. Ambiente Surface: superfici dalle curve di contorno (Surface::Sections,
                       equivalente di "fill boundary curves" / Sections)

La feritoia di ventilazione centrale (louver) divide le sezioni in due pelli
separate: vengono loftate separatamente, quindi I FORI/LA FERITOIA A META'
DEL PEZZO RESTANO APERTI per far entrare l'aria.

Uso:  freecadcmd build_aletta_re.py  (con aletta.stl in /tmp/aletta.stl)
"""
import math
import Mesh, Part, FreeCAD as App
from FreeCAD import Base

STL = '/tmp/aletta.stl'
OUT_DIR = '/home/user/Few-few/reverse-engineering'

# ---------------------------------------------------------------- utilità

def stitch_chains(polys, tol=3.5):
    """Unisce polilinee aperte i cui estremi distano meno di tol (mm)."""
    chains = [list(p) for p in polys]
    merged = True
    while merged:
        merged = False
        for i in range(len(chains)):
            for j in range(i + 1, len(chains)):
                a, b = chains[i], chains[j]
                combos = [
                    ((a[-1] - b[0]).Length,  lambda: a + b),
                    ((a[-1] - b[-1]).Length, lambda: a + b[::-1]),
                    ((a[0] - b[0]).Length,   lambda: a[::-1] + b),
                    ((a[0] - b[-1]).Length,  lambda: b + a),
                ]
                d, make = min(combos, key=lambda c: c[0])
                if d < tol:
                    chains[i] = make()
                    del chains[j]
                    merged = True
                    break
            if merged:
                break
    return chains

def chain_length(pts):
    return sum((pts[k + 1] - pts[k]).Length for k in range(len(pts) - 1))

def resample(pts, spacing=2.5, nmin=14, nmax=110):
    """Ricampionamento uniforme per lunghezza d'arco (riduce il rumore di
    scansione prima dell'interpolazione, come si farebbe scegliendo i punti
    a mano con Curves->Interpolate)."""
    L = chain_length(pts)
    n = max(nmin, min(nmax, int(L / spacing)))
    cum = [0.0]
    for k in range(len(pts) - 1):
        cum.append(cum[-1] + (pts[k + 1] - pts[k]).Length)
    out, k = [], 0
    for i in range(n):
        t = L * i / (n - 1)
        while k < len(cum) - 2 and cum[k + 1] < t:
            k += 1
        seg = cum[k + 1] - cum[k]
        f = 0.0 if seg < 1e-9 else (t - cum[k]) / seg
        out.append(pts[k] + (pts[k + 1] - pts[k]) * f)
    # elimina punti consecutivi coincidenti
    clean = [out[0]]
    for p in out[1:]:
        if (p - clean[-1]).Length > 1e-3:
            clean.append(p)
    return clean

def orient_closed(pts):
    """Verso antiorario (XY) e nessun punto doppio in coda."""
    if (pts[0] - pts[-1]).Length < 0.5:
        pts = pts[:-1]
    area = 0.0
    for k in range(len(pts)):
        p, q = pts[k], pts[(k + 1) % len(pts)]
        area += p.x * q.y - q.x * p.y
    return pts if area > 0 else pts[::-1]

def align_start(pts, ref):
    """Ruota la sequenza chiusa perché parta vicino a ref (evita twist nel loft)."""
    if ref is None:
        return pts
    i = min(range(len(pts)), key=lambda k: (pts[k] - ref).Length)
    return pts[i:] + pts[:i]

def bspline_edge(pts, closed):
    bs = Part.BSplineCurve()
    bs.interpolate(Points=pts, PeriodicFlag=closed)
    return bs.toShape()

def add_curve(doc, group, name, pts, closed):
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = Part.Wire([bspline_edge(pts, closed)])
    group.addObject(obj)
    return obj

def surface_sections(doc, group, name, curve_objs):
    """Surface::Sections (ambiente Surface) con fallback Part.makeLoft."""
    obj = doc.addObject('Surface::Sections', name)
    obj.NSections = [(c, ('Edge1',)) for c in curve_objs]
    doc.recompute()
    if obj.Shape.isNull() or not obj.Shape.Faces:
        doc.removeObject(obj.Name)
        loft = Part.makeLoft([c.Shape for c in curve_objs], False, False)
        obj = doc.addObject('Part::Feature', name)
        obj.Shape = loft
    group.addObject(obj)
    return obj

# ---------------------------------------------------------------- mesh

mesh = Mesh.Mesh(STL)
print('Mesh:', mesh.CountFacets, 'facce, BB', mesh.BoundBox)

def sections_at(zs):
    planes = [(Base.Vector(0, 0, z), Base.Vector(0, 0, 1)) for z in zs]
    return mesh.crossSections(planes, 0.01)

doc = App.newDocument('Aletta_RE')
g_sez = doc.addObject('App::DocumentObjectGroup', 'Sezioni')
g_sez.Label = 'Sezioni (BSpline interpolate)'
g_sup = doc.addObject('App::DocumentObjectGroup', 'Superfici')
g_sup.Label = 'Superfici (Sections / fill)'

# ------------------------------------------------ ZONA A: base (sez. chiuse)
ZA = [-418.5, -414, -409, -404, -399, -394, -389, -384, -380, -378.2]
curves_A, prev_start = [], None
for z, sec in zip(ZA, sections_at(ZA)):
    chains = stitch_chains(sec, 3.5)
    chains.sort(key=chain_length, reverse=True)
    pts = orient_closed(resample(chains[0]))
    pts = align_start(pts, prev_start)
    prev_start = pts[0]
    curves_A.append(add_curve(doc, g_sez, 'SezA_z%d' % round(-z), pts, True))

# --------------------------------- ZONA B: feritoia (due pelli, sez. APERTE)
ZB = [-377.2, -374, -370, -365, -360, -355, -350, -345, -340, -335, -330,
      -325, -320, -315, -310, -305, -300, -296, -292]
curves_R, curves_L = [], []
ref_R, ref_L = None, None
for z, sec in zip(ZB, sections_at(ZB)):
    chains = stitch_chains(sec, 3.5)
    chains = [c for c in chains if chain_length(c) > 40]
    chains.sort(key=chain_length, reverse=True)
    if len(chains) < 2:
        print('  zona B: salto z=%.1f (catene=%d)' % (z, len(chains)))
        continue
    two = chains[:2]
    right = max(two, key=lambda c: max(p.x for p in c))
    left = two[0] if two[1] is right else two[1]
    for pts_raw, store, ref_name in ((right, curves_R, 'R'), (left, curves_L, 'L')):
        pts = resample(pts_raw)
        ref = ref_R if ref_name == 'R' else ref_L
        if ref is not None and (pts[0] - ref).Length > (pts[-1] - ref).Length:
            pts = pts[::-1]
        if ref_name == 'R':
            ref_R = pts[0]
        else:
            ref_L = pts[0]
        store.append(add_curve(doc, g_sez, 'SezB_%s_z%d' % (ref_name, round(-z)), pts, False))

# ------------------------------------------- ZONA C: sopra la feritoia
ZC = [-287, -283, -279, -275, -271, -267, -263, -259, -255, -251,
      -247, -243, -239, -235, -232]
curves_C, prev_start = [], None
for z, sec in zip(ZC, sections_at(ZC)):
    chains = stitch_chains(sec, 4.0)
    chains = [c for c in chains if chain_length(c) > 80]
    if not chains:
        print('  zona C: salto z=%.1f' % z)
        continue
    chains.sort(key=chain_length, reverse=True)
    pts = orient_closed(resample(chains[0]))
    pts = align_start(pts, prev_start)
    prev_start = pts[0]
    curves_C.append(add_curve(doc, g_sez, 'SezC_z%d' % round(-z), pts, True))

# ------------------------------------------------ PERNI di fissaggio
ZS = [round(-262 + 2 * k, 1) for k in range(27)]   # -262 .. -210
stud_secs = []   # (z, centro, punti)
for z, sec in zip(ZS, sections_at(ZS)):
    for chains in [stitch_chains(sec, 2.0)]:
        for c in chains:
            L = chain_length(c)
            if not (8 < L < 65):
                continue
            if (c[0] - c[-1]).Length > 4:
                continue
            xs = [p.x for p in c]; ys = [p.y for p in c]
            if max(xs) - min(xs) > 22 or max(ys) - min(ys) > 22:
                continue
            ctr = Base.Vector(sum(xs) / len(xs), sum(ys) / len(ys), z)
            stud_secs.append((z, ctr, c))
# raggruppa per posizione XY
clusters = []
for z, ctr, c in stud_secs:
    for cl in clusters:
        if (Base.Vector(ctr.x, ctr.y, 0) - Base.Vector(cl[-1][1].x, cl[-1][1].y, 0)).Length < 7:
            cl.append((z, ctr, c))
            break
    else:
        clusters.append([(z, ctr, c)])
clusters = [cl for cl in clusters if len(cl) >= 3]
print('Perni trovati:', len(clusters))

stud_curve_groups = []
for si, cl in enumerate(clusters):
    cl.sort(key=lambda t: t[0])
    objs, prev_start = [], None
    for z, ctr, c in cl:
        pts = orient_closed(resample(c, spacing=1.2, nmin=10, nmax=48))
        pts = align_start(pts, prev_start)
        prev_start = pts[0]
        objs.append(add_curve(doc, g_sez, 'Perno%d_z%d' % (si + 1, round(-z)), pts, True))
    stud_curve_groups.append(objs)

doc.recompute()

# ------------------------------------------------ SUPERFICI
print('Superfici...')
surf_objs = []
surf_objs.append(surface_sections(doc, g_sup, 'Sup_Base', curves_A))
surf_objs.append(surface_sections(doc, g_sup, 'Sup_PelleEsterna_DX', curves_R))
surf_objs.append(surface_sections(doc, g_sup, 'Sup_PelleInterna_SX', curves_L))
surf_objs.append(surface_sections(doc, g_sup, 'Sup_Sommita', curves_C))
for si, objs in enumerate(stud_curve_groups):
    surf_objs.append(surface_sections(doc, g_sup, 'Sup_Perno%d' % (si + 1), objs))
doc.recompute()

for o in surf_objs:
    print(' ', o.Name, 'facce:', len(o.Shape.Faces), 'area: %.0f mm2' % o.Shape.Area)

# mesh decimata di riferimento nel documento
dm = Mesh.Mesh(STL)
dm.decimate(0.5, 0.92)
mobj = doc.addObject('Mesh::Feature', 'ScansioneRiferimento')
mobj.Mesh = dm
mobj.Label = 'Scansione (decimata, riferimento)'
print('Mesh decimata:', dm.CountFacets, 'facce')

doc.recompute()
doc.saveAs(OUT_DIR + '/Aletta_RE.FCStd')

shapes = [o.Shape for o in surf_objs if not o.Shape.isNull()]
Part.export(shapes and [Part.makeCompound(shapes)] or [], OUT_DIR + '/Aletta_RE.step')

# STL delle superfici per la verifica visiva
out_mesh = Mesh.Mesh()
for s in shapes:
    out_mesh.addMesh(Mesh.Mesh(s.tessellate(0.25)))
out_mesh.write('/tmp/aletta_re_surfaces.stl')
print('FATTO')
