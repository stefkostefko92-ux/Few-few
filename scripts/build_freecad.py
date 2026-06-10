# -*- coding: utf-8 -*-
"""Costruzione documento FreeCAD 1.1: aletta da scansione -> superfici/curve/barriere.
Eseguire con: freecadcmd build_freecad.py
"""
import numpy as np
import FreeCAD as App
import Part
import Mesh

DIR = '/tmp/pipeline/'
OUT_FCSTD = DIR + 'Aletta_stampo.FCStd'
OUT_STEP = DIR + 'Aletta_stampo.step'

doc = App.newDocument('Aletta_stampo')

def V(p):
    return App.Vector(float(p[0]), float(p[1]), float(p[2]))

def bspline_closed(pts):
    c = Part.BSplineCurve()
    c.interpolate([V(p) for p in pts], PeriodicFlag=True)
    return c

def bspline_open(pts):
    c = Part.BSplineCurve()
    c.interpolate([V(p) for p in pts])
    return c

def add_obj(shape, name, group=None):
    o = doc.addObject('Part::Feature', name)
    o.Shape = shape
    o.Label = name
    if group is not None:
        group.addObject(o)
    return o

def add_group(name):
    g = doc.addObject('App::DocumentObjectGroup', name)
    g.Label = name
    return g

# ---------------- mesh scansione ----------------
m = Mesh.Mesh(DIR + 'aletta_150k.stl')
mo = doc.addObject('Mesh::Feature', 'Scansione_riferimento')
mo.Mesh = m
mo.Label = 'Scansione_riferimento'

# ---------------- sezioni e superficie lama ----------------
d = np.load(DIR + 'grid_smooth.npz')   # griglia gia' lisciata lungo v
grid2d, zs = d['grid'], d['z']
S, N = grid2d.shape[:2]

g_sez = add_group('Sezioni')
for i in range(0, S, 4):
    pts = np.column_stack([grid2d[i], np.full(N, zs[i])])
    c = bspline_closed(pts[::2])
    add_obj(c.toShape(), 'Sezione_z%+04d' % int(round(zs[i])), g_sez)

g_sup = add_group('Superfici')
print('superficie lama (approximate)...')

def grid_rows(g3):
    rows = []
    for r in g3:
        row = [V(p) for p in r]
        row.append(row[0])
        rows.append(row)
    return rows

g3 = np.concatenate([grid2d, np.repeat(zs[:, None, None], N, axis=1)], axis=2)
surf = Part.BSplineSurface()
surf.approximate(Points=grid_rows(g3), DegMin=3, DegMax=5, Continuity=1, Tolerance=0.08)
add_obj(surf.toShape(), 'Lama_superficie', g_sup)

# cappuccio punta: griglia che collassa all'apice
tip_apex = np.array([116.028, -9.736, -207.344])
bot = g3[0]
cap_rows = []
for t in (0.0, 0.45, 0.8, 1.0):
    ring = bot * (1 - t) + tip_apex[None, :] * t
    row = [V(p) for p in ring]
    row.append(row[0])
    cap_rows.append(row)
try:
    csurf = Part.BSplineSurface()
    csurf.approximate(Points=cap_rows, DegMin=3, DegMax=5, Continuity=1, Tolerance=0.15)
    add_obj(csurf.toShape(), 'Punta_cappuccio', g_sup)
except Exception as e:
    print('cap punta fallito:', e)

# superficie scafo di riferimento (estensione tangente dai dati, stabile)
hp = np.load(DIR + 'hull_patch.npz')
gx, gy, Z = hp['gx'], hp['gy'], hp['Z']
rows = []
for iy, yv in enumerate(gy):
    rows.append([V([xv, yv, Z[iy, ix]]) for ix, xv in enumerate(gx)])
hsurf = Part.BSplineSurface()
hsurf.interpolate(rows)
add_obj(hsurf.toShape(), 'Scafo_riferimento', g_sup)

# ---------------- curve di giunzione ----------------
st = np.load(DIR + 'strips.npz')
CA, CA_out, CB, CB_out = st['CA'], st['CA_out'], st['CB'], st['CB_out']
le_sil, te_sil = st['le_sil'], st['te_sil']
rr = np.load(DIR + 'root_ring_final.npz')
ring_in, ring_out = rr['inner'], rr['outer']

g_cur = add_group('Curve_giunzione')
cCA = bspline_open(CA[::2]);      add_obj(cCA.toShape(), 'Giunzione_fianco_concavo', g_cur)
cCB = bspline_open(CB[::2]);      add_obj(cCB.toShape(), 'Giunzione_fianco_convesso', g_cur)
cCAo = bspline_open(CA_out[::2]); add_obj(cCAo.toShape(), 'Giunzione_fianco_concavo_esterno', g_cur)
cCBo = bspline_open(CB_out[::2]); add_obj(cCBo.toShape(), 'Giunzione_fianco_convesso_esterno', g_cur)
cLE = bspline_open(le_sil);       add_obj(cLE.toShape(), 'Silhouette_bordo_entrata', g_cur)
cTE = bspline_open(te_sil);       add_obj(cTE.toShape(), 'Silhouette_bordo_uscita', g_cur)
cRI = bspline_closed(ring_in[::2]);  add_obj(cRI.toShape(), 'Perimetro_livello_scafo', g_cur)
cRO = bspline_closed(ring_out[::2]); add_obj(cRO.toShape(), 'Perimetro_barriera_radice_esterno', g_cur)

# ---------------- barriere (superfici rigate) ----------------
g_bar = add_group('Barriere_superfici')

def ruled(c1, c2, name):
    f = Part.makeRuledSurface(c1.toShape(), c2.toShape())
    return add_obj(f, name, g_bar)

bA = ruled(cCA, cCAo, 'Barriera_fianco_concavo')
bB = ruled(cCB, cCBo, 'Barriera_fianco_convesso')
bR = ruled(cRI, cRO, 'Barriera_radice')

# piastra giunzione bordi in punta (piano YZ all'apice)
apx = np.array([116.028, -9.736, -207.344])
pl = Part.makePlane(65, 45, App.Vector(float(apx[0]), float(apx[1]-40), float(apx[2]-22)),
                    App.Vector(1, 0, 0), App.Vector(0, 1, 0))
# makePlane(length,width,pos,normal,xdir): verifica orientamento dopo
add_obj(pl, 'Piastra_giunzione_punta', g_bar)

# ---------------- barriere solide 3mm ----------------
g_sol = add_group('Barriere_solide_3mm')
for src, nm in ((bA, 'Barriera_fianco_concavo_solida'),
                (bB, 'Barriera_fianco_convesso_solida'),
                (bR, 'Barriera_radice_solida'),):
    try:
        sol = src.Shape.makeOffsetShape(3.0, 1e-3, fill=True)
        add_obj(sol, nm, g_sol)
    except Exception as e:
        print('thicken fallito per', nm, ':', e)

doc.recompute()
doc.saveAs(OUT_FCSTD)
print('FCStd salvato')

# STEP export (tutto tranne mesh)
shapes = [o for o in doc.Objects if o.isDerivedFrom('Part::Feature')]
Part.export(shapes, OUT_STEP)
print('STEP salvato')

# STL barriere per stampa 3D
import MeshPart
for o in doc.Objects:
    if o.Label.endswith('_solida'):
        mm = MeshPart.meshFromShape(Shape=o.Shape, LinearDeflection=0.15, AngularDeflection=0.3)
        mm.write(DIR + o.Label + '.stl')
        print('stl:', o.Label)
print('FATTO')
