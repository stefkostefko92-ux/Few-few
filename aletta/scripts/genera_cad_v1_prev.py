# Documento FreeCAD parametrico dell'aletta:
# - 24 sketch di sezione (B-spline periodiche dalla scansione)
# - corpo: superficie B-spline skinning (C2) + tappi, da skin_poles.json
# - perni: sketch di semiprofilo + Part::Revolution
# - fusione finale + export STEP/STL
import json
import numpy as np
import FreeCAD as App
import Part

doc = App.newDocument("Aletta_CAD")

# --- sketch di sezione (riferimento/modifica) ---
SEC = json.load(open('/tmp/sections_final.json'))
rot_yz = App.Rotation(App.Vector(1, 1, 1), 120)
grp = doc.addObject('App::DocumentObjectGroup', 'Sezioni')
sketches = []
for xs in sorted(SEC, key=float):
    sk = doc.addObject('Sketcher::SketchObject',
                       f'Sezione_X{str(xs).replace(".", "_")}')
    sk.Placement = App.Placement(App.Vector(float(xs), 0, 0), rot_yz)
    v = [App.Vector(p[0], p[1], 0) for p in SEC[xs]]
    bs = Part.BSplineCurve()
    bs.interpolate(Points=v, PeriodicFlag=True)
    sk.addGeometry(bs, False)
    grp.addObject(sk)
    sketches.append(sk)
print(f"sketch sezioni: {len(sketches)}", flush=True)

# --- corpo da poli skinning ---
D = json.load(open('/tmp/skin_poles.json'))
poles2 = D['poles']; polesX = D['polesX']
n_u, n_v = len(poles2), len(poles2[0])
poles = [[App.Vector(polesX[i], poles2[i][j][0], poles2[i][j][1])
          for j in range(n_v)] for i in range(n_u)]
surf = Part.BSplineSurface()
surf.buildFromPolesMultsKnots(poles, D['umults'], [1]*(n_v+1),
                              D['uknots'], list(range(n_v+1)),
                              False, True, 3, 3)
skin = surf.toShape()
caps = [Part.Face(Part.Wire([e])) for e in skin.Edges if e.isClosed()]
shell = Part.makeShell([skin] + caps)
solid = Part.makeSolid(shell)
if solid.Volume < 0:
    solid.reverse()
solid.fix(1e-5, 1e-7, 1e-3)
assert solid.isValid()
corpo = doc.addObject('Part::Feature', 'Corpo')
corpo.Shape = solid
print(f"corpo: valido {solid.isValid()}, vol {solid.Volume/1000:.2f} cm3", flush=True)

# --- perni ---
AX = json.load(open('/tmp/studs_axes.json'))

def make_stud(name, p, d, zbase, steps):
    """steps: [(raggio, Z assoluto fine segmento), ...] lungo l'asse."""
    p = np.array(p); d = np.array(d)
    B = p + d * ((zbase - p[2]) / d[2])
    prof = [(steps[0][0], 0.0)] + [(r, (z - zbase) / d[2]) for r, z in steps]
    sk = doc.addObject('Sketcher::SketchObject', f'Profilo_{name}')
    sk.Placement = App.Placement(App.Vector(*B),
                                 App.Rotation(App.Vector(0, 1, 0),
                                              App.Vector(*d)))
    pts = [(0.0, 0.0)] + prof + [(0.0, prof[-1][1])]
    for a, b in zip(pts[:-1], pts[1:]):
        sk.addGeometry(Part.LineSegment(App.Vector(a[0], a[1], 0),
                                        App.Vector(b[0], b[1], 0)), False)
    sk.addGeometry(Part.LineSegment(App.Vector(pts[-1][0], pts[-1][1], 0),
                                    App.Vector(pts[0][0], pts[0][1], 0)), False)
    rev = doc.addObject('Part::Revolution', name)
    rev.Source = sk
    rev.Axis = tuple(d)
    rev.Base = tuple(B)
    rev.Angle = 360
    rev.Solid = True
    return rev

# gradini (raggio, Z assoluto): collare Ø13.7/13.2 prolungato nel corpo,
# gambo Ø8 (M8), punta Ø4.3, smusso finale
steps1 = [(6.85, 192.5), (4.0, 195.0), (4.0, 202.0),
          (2.15, 203.2), (2.15, 209.4), (1.4, 210.4)]
steps2 = [(6.60, 148.3), (4.0, 151.0), (4.0, 157.7),
          (2.20, 159.2), (2.20, 165.3), (1.3, 166.4)]
AXp = AX
rev1 = make_stud('Perno1', AX['p1'], AX['d1'], 144.0, steps1)
rev2 = make_stud('Perno2', AX['p2'], AX['d2'], 116.0, steps2)
doc.recompute()
print(f"perni: {rev1.Shape.isValid()}, {rev2.Shape.isValid()}", flush=True)

# --- fusione ---
sh = corpo.Shape.fuse([rev1.Shape, rev2.Shape], 0.05)
if not sh.isValid():
    sh2 = sh.copy(); sh2.fix(1e-5, 1e-7, 1e-3)
    if sh2.isValid(): sh = sh2
print(f"fusione: valida {sh.isValid()}, solidi {len(sh.Solids)}, vol {sh.Volume/1000:.2f} cm3", flush=True)
assert sh.isValid() and len(sh.Solids) == 1, "fusione non riuscita"
fuse = doc.addObject('Part::Feature', 'Aletta')
fuse.Shape = sh
doc.recompute()

doc.saveAs('/tmp/Aletta_parametrica.FCStd')
import Import
Import.export([fuse], '/tmp/Aletta_parametrica.step')
import MeshPart
mm = MeshPart.meshFromShape(Shape=sh, LinearDeflection=0.05, AngularDeflection=0.3)
mm.write('/tmp/Aletta_parametrica.stl')
print("FATTO: FCStd + STEP + STL", flush=True)
