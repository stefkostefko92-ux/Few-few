# -*- coding: utf-8 -*-
"""
Reverse engineering "Aletta scannerizzata" — FreeCAD 1.1 (headless)
===================================================================
Workflow (equivalente scriptato di quello richiesto in GUI):
  1. Ambiente Mesh   : sezioni trasversali della mesh scansionata (piani Z)
  2. Curves          : interpolazione BSpline delle polilinee di sezione
                       (equivalente di Curves -> Interpolate / freehand bspline)
  3. Ambiente Surface: superfici dalle curve di contorno per interpolazione
                       di griglia BSpline (skinning delle sezioni, stesso
                       risultato di Surface -> Sections / fill boundary curves
                       ma immune da twist/esplosioni del loft OCC)

La feritoia di ventilazione centrale (louver) divide le sezioni in due pelli
separate: vengono rivestite separatamente, quindi I FORI/LA FERITOIA A META'
DEL PEZZO RESTANO APERTI per far entrare l'aria.

Uso:  freecadcmd build_aletta_re.py  (con aletta.stl in /tmp/aletta.stl)
"""
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

def resample_n(pts, n):
    """Ricampionamento a n punti uniformi per lunghezza d'arco (filtra anche
    il rumore di scansione, come scegliere i punti a mano in
    Curves->Interpolate)."""
    L = chain_length(pts)
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
    return out

def resample_spacing(pts, spacing=2.5, nmin=14, nmax=110):
    n = max(nmin, min(nmax, int(chain_length(pts) / spacing)))
    out = resample_n(pts, n)
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

def split_closed(pts, n_arc):
    """Divide un profilo chiuso in due archi ai punti di x minima e massima
    (i 'vertici' geometrici: il taglio è identico su tutte le sezioni, quindi
    lo skinning non può attorcigliarsi). Ritorna (arco_sup, arco_inf), ognuno
    ricampionato a n_arc punti e orientato da x-min a x-max."""
    i_min = min(range(len(pts)), key=lambda k: pts[k].x)
    i_max = max(range(len(pts)), key=lambda k: pts[k].x)
    a, b = sorted((i_min, i_max))
    arc1 = pts[a:b + 1]
    arc2 = pts[b:] + pts[:a + 1]
    if arc1[0].x > arc1[-1].x:
        arc1 = arc1[::-1]
    if arc2[0].x > arc2[-1].x:
        arc2 = arc2[::-1]
    y1 = sum(p.y for p in arc1) / len(arc1)
    y2 = sum(p.y for p in arc2) / len(arc2)
    top, bot = (arc1, arc2) if y1 >= y2 else (arc2, arc1)
    return resample_n(top, n_arc), resample_n(bot, n_arc)

def bspline_wire(pts, closed):
    bs = Part.BSplineCurve()
    bs.interpolate(Points=pts, PeriodicFlag=closed)
    return Part.Wire([bs.toShape()])

def add_curve(doc, group, name, pts, closed):
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = bspline_wire(pts, closed)
    group.addObject(obj)
    return obj

def grid_surface(doc, group, name, rows):
    """Superficie BSpline interpolata su una griglia di punti
    (righe = sezioni, colonne = punti lungo la sezione)."""
    surf = Part.BSplineSurface()
    # parametrizzazione uniforme: l'interpolazione chord-length OCC è mal
    # condizionata sulle sezioni di scansione e fa esplodere i poli;
    # la tolleranza 0,2 mm smussa anche il rumore dello scanner
    surf.approximate(Points=[[p for p in row] for row in rows],
                     DegMin=3, DegMax=3, Tolerance=0.2, ParamType='Uniform')
    obj = doc.addObject('Part::Feature', name)
    obj.Shape = surf.toShape()
    group.addObject(obj)
    span = abs(rows[-1][0].z - rows[0][0].z)
    est = sum(chain_length(r) for r in rows) / len(rows) * span
    print('  %-24s area %8.0f mm2 (attesa ~%.0f)' % (name, obj.Shape.Area, est))
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
g_sup.Label = 'Superfici (skinning sezioni)'

# ------------------------------------------------ ZONA A: base (sez. chiuse)
ZA = [-418.5, -414, -409, -404, -399, -394, -389, -384, -380, -378.2]
rows_A_top, rows_A_bot = [], []
for z, sec in zip(ZA, sections_at(ZA)):
    chains = stitch_chains(sec, 3.5)
    chains.sort(key=chain_length, reverse=True)
    pts = orient_closed(chains[0])
    add_curve(doc, g_sez, 'SezA_z%d' % round(-z), resample_spacing(pts), True)
    top, bot = split_closed(pts, 80)
    rows_A_top.append(top)
    rows_A_bot.append(bot)

# --------------------------------- ZONA B: feritoia (due pelli, sez. APERTE)
ZB = [-377.2, -374, -370, -365, -360, -355, -350, -345, -340, -335, -330,
      -325, -320, -315, -310, -305, -300, -296, -292]
rows_R, rows_L = [], []
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
    for raw, rows, tag in ((right, rows_R, 'R'), (left, rows_L, 'L')):
        pts = resample_n(raw, 110)
        if rows and (pts[0] - rows[-1][0]).Length > (pts[-1] - rows[-1][0]).Length:
            pts = pts[::-1]
        rows.append(pts)
        add_curve(doc, g_sez, 'SezB_%s_z%d' % (tag, round(-z)), pts, False)

# ------------------------------------------- ZONA C: sopra la feritoia
ZC = [-287, -283, -279, -275, -271, -267, -263, -259, -255, -251,
      -247, -243, -239, -235, -232]
rows_C_top, rows_C_bot = [], []
for z, sec in zip(ZC, sections_at(ZC)):
    chains = stitch_chains(sec, 4.0)
    chains = [c for c in chains if chain_length(c) > 80]
    if not chains:
        print('  zona C: salto z=%.1f' % z)
        continue
    chains.sort(key=chain_length, reverse=True)
    pts = orient_closed(chains[0])
    add_curve(doc, g_sez, 'SezC_z%d' % round(-z), resample_spacing(pts), True)
    top, bot = split_closed(pts, 80)
    rows_C_top.append(top)
    rows_C_bot.append(bot)

# ------------------------------------------------ PERNI di fissaggio
ZS = [round(-262 + 2 * k, 1) for k in range(27)]   # -262 .. -210
stud_secs = []
for z, sec in zip(ZS, sections_at(ZS)):
    for c in stitch_chains(sec, 2.0):
        L = chain_length(c)
        if not (8 < L < 65):
            continue
        if (c[0] - c[-1]).Length > 4:
            continue
        xs = [p.x for p in c]
        ys = [p.y for p in c]
        if max(xs) - min(xs) > 22 or max(ys) - min(ys) > 22:
            continue
        ctr = Base.Vector(sum(xs) / len(xs), sum(ys) / len(ys), 0)
        stud_secs.append((z, ctr, c))
clusters = []
for z, ctr, c in stud_secs:
    for cl in clusters:
        if (ctr - cl[-1][1]).Length < 7:
            cl.append((z, ctr, c))
            break
    else:
        clusters.append([(z, ctr, c)])
clusters = [cl for cl in clusters if len(cl) >= 3]
print('Perni trovati:', len(clusters))

stud_grids = []   # (indice, righe_top, righe_bot)
for si, cl in enumerate(clusters):
    cl.sort(key=lambda t: t[0])
    r_top, r_bot = [], []
    for z, ctr, c in cl:
        pts = orient_closed(c)
        add_curve(doc, g_sez, 'Perno%d_z%d' % (si + 1, round(-z)),
                  resample_spacing(pts, spacing=1.2, nmin=10, nmax=48), True)
        top, bot = split_closed(pts, 28)
        r_top.append(top)
        r_bot.append(bot)
    stud_grids.append((si + 1, r_top, r_bot))

doc.recompute()

# ------------------------------------------------ SUPERFICI (skinning)
print('Superfici...')
surf_objs = [
    grid_surface(doc, g_sup, 'Sup_Base_Esterna', rows_A_top),
    grid_surface(doc, g_sup, 'Sup_Base_Interna', rows_A_bot),
    grid_surface(doc, g_sup, 'Sup_PelleEsterna_DX', rows_R),
    grid_surface(doc, g_sup, 'Sup_PelleInterna_SX', rows_L),
    grid_surface(doc, g_sup, 'Sup_Sommita_Esterna', rows_C_top),
    grid_surface(doc, g_sup, 'Sup_Sommita_Interna', rows_C_bot),
]
for si, r_top, r_bot in stud_grids:
    surf_objs.append(grid_surface(doc, g_sup, 'Sup_Perno%d_A' % si, r_top))
    surf_objs.append(grid_surface(doc, g_sup, 'Sup_Perno%d_B' % si, r_bot))
doc.recompute()

# mesh decimata di riferimento nel documento
dm = Mesh.Mesh(STL)
dm.decimate(0.5, 0.92)
mobj = doc.addObject('Mesh::Feature', 'ScansioneRiferimento')
mobj.Mesh = dm
mobj.Label = 'Scansione (decimata, riferimento)'
print('Mesh decimata:', dm.CountFacets, 'facce')

doc.recompute()
doc.saveAs(OUT_DIR + '/Aletta_RE.FCStd')

Part.export([o for o in surf_objs if not o.Shape.isNull()],
            OUT_DIR + '/Aletta_RE.step')

# campionamento UV per la verifica visiva (niente tessellazione OCC: lenta)
try:
    import numpy as np
    samples = []
    for o in surf_objs:
        f = o.Shape.Faces[0]
        u0, u1, v0, v1 = f.ParameterRange
        for u in [u0 + (u1 - u0) * i / 199.0 for i in range(200)]:
            for v in [v0 + (v1 - v0) * j / 79.0 for j in range(80)]:
                p = f.Surface.value(u, v)
                samples.append((p.x, p.y, p.z))
    np.save('/tmp/re_points.npy', np.array(samples))
    print('campioni superfici:', len(samples))
except Exception as e:
    print('campionamento saltato:', e)
print('FATTO')
