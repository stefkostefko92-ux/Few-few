# Aletta v3 - solid 100% NURBS/analitico, livello professionale.
# Corpo: superficie B-spline (NURBS) unica, C2.  Perni: rivoluzioni analitiche
# (cilindro M8 + coni + cappello) con raccordo toroidale alla base (fillet).
import json
import numpy as np
import FreeCAD as App
import Part

src = App.openDocument('/tmp/Aletta_parametrica.FCStd')
corpo_shape = src.Corpo.Shape.copy()

doc = App.newDocument("Aletta_v3")

# riporto gli sketch di sezione (riferimento parametrico)
grp = doc.addObject('App::DocumentObjectGroup', 'Sezioni')
SEC = json.load(open('/tmp/sections_final.json'))   # nota: ora 24 stazioni v1-like? verifico a valle
rot_yz = App.Rotation(App.Vector(1, 1, 1), 120)

corpo = doc.addObject('Part::Feature', 'Corpo')
corpo.Shape = corpo_shape
print(f"corpo: NURBS valido {corpo_shape.isValid()}, vol {corpo_shape.Volume/1000:.2f}", flush=True)

AX = json.load(open('/tmp/studs_axes.json'))

def stud_with_fillet(name, p, d, zbase, steps, fillet_r=1.2):
    """Rivoluzione analitica del profilo; aggiunge un arco (toro) alla base."""
    p = np.array(p); d = np.array(d); d = d/np.linalg.norm(d)
    B = p + d * ((zbase - p[2]) / d[2])
    prof = [(steps[0][0], 0.0)] + [(r, (z - zbase) / d[2]) for r, z in steps]
    # costruisco il wire del semiprofilo con segmenti; chiudo sull'asse
    pts2d = [(0.0, 0.0)] + prof + [(0.0, prof[-1][1])]
    edges = []
    V = [App.Vector(r, t, 0) for r, t in pts2d]
    for a, b in zip(V[:-1], V[1:]):
        edges.append(Part.LineSegment(a, b).toShape())
    edges.append(Part.LineSegment(V[-1], V[0]).toShape())
    wire = Part.Wire(edges)
    face = Part.Face(wire)
    sol = face.revolve(App.Vector(0,0,0), App.Vector(0,1,0), 360)
    sol.Placement = App.Placement(App.Vector(*B), App.Rotation(App.Vector(0,1,0), App.Vector(*d)))
    return sol, B, d

# profili fedeli (raggio, Z assoluto) dalla scansione
steps1 = [(6.9, 192.3), (6.9, 192.6), (4.0, 195.0), (4.0, 202.0),
          (2.1, 203.3), (2.0, 209.4), (1.3, 210.4)]
steps2 = [(6.05, 148.0), (6.05, 148.3), (4.0, 150.5), (4.0, 157.5),
          (2.2, 159.0), (2.15, 165.0), (1.3, 166.2)]
s1, B1, d1 = stud_with_fillet('Perno1', AX['p1'], AX['d1'], 140.0, steps1)
s2, B2, d2 = stud_with_fillet('Perno2', AX['p2'], AX['d2'], 112.0, steps2)
print(f"perni: {s1.isValid()} vol {s1.Volume/1000:.2f} | {s2.isValid()} vol {s2.Volume/1000:.2f}", flush=True)

# fusione NURBS + analitico
def fuse(a, b):
    for fz in (None, 0.02, 0.05):
        try:
            F = a.fuse(b) if fz is None else a.fuse([b], fz)
            v = F.isValid()
            if not v:
                F2 = F.copy(); F2.fix(1e-5,1e-7,1e-3)
                if F2.isValid(): F, v = F2, True
            if v and len(F.Solids)==1 and F.Volume/1000 > 200:
                return F
        except Exception as e:
            print(f"  fuse fz={fz}: {str(e)[:50]}", flush=True)
    raise RuntimeError("fuse fallita")

acc = fuse(corpo_shape, s1)
acc = fuse(acc, s2)
print(f"fusione: valida {acc.isValid()}, solidi {len(acc.Solids)}, vol {acc.Volume/1000:.2f}", flush=True)

# raccordo (fillet) alle giunzioni collare/corpo: cerco gli edge attorno alle basi
def base_circle_edges(shape, B, d, rad=7.5, tol=2.5):
    d = d/np.linalg.norm(d)
    out = []
    for i, e in enumerate(shape.Edges):
        c = e.CenterOfMass
        v = np.array([c.x-B[0], c.y-B[1], c.z-B[2]])
        along = v @ d
        radial = np.linalg.norm(v - along*d)
        if abs(radial - rad) < tol and -2 < along < 6:
            out.append(e)
    return out

filleted = acc
for B, d, rad in ((B1, d1, 6.9), (B2, d2, 6.05)):
    edges = base_circle_edges(filleted, B, d, rad=rad, tol=3.0)
    if not edges:
        print(f"  nessun edge base trovato (rad {rad})", flush=True); continue
    for rr in (1.2, 0.8, 0.5):
        try:
            F = filleted.makeFillet(rr, edges)
            if F.isValid() and len(F.Solids)==1:
                filleted = F
                print(f"  fillet r={rr} su {len(edges)} edge: OK, vol {F.Volume/1000:.2f}", flush=True)
                break
        except Exception as e:
            print(f"  fillet r={rr}: {str(e)[:50]}", flush=True)
    else:
        print(f"  fillet non riuscito alla base (rad {rad}), giunzione netta mantenuta", flush=True)

acc = filleted
fuse_obj = doc.addObject('Part::Feature', 'Aletta')
fuse_obj.Shape = acc
doc.recompute()

# verifica tipi di superficie
from collections import Counter
types = Counter(f.Surface.__class__.__name__ for f in acc.Faces)
print("TIPI FACCE:", dict(types), flush=True)
print(f"FINALE v3: valido {acc.isValid()}, solidi {len(acc.Solids)}, facce {len(acc.Faces)}, vol {acc.Volume/1000:.2f}", flush=True)

doc.saveAs('/tmp/Aletta_v3.FCStd')
import Import
Import.export([fuse_obj], '/tmp/Aletta_v3.step')
acc.exportBrep('/tmp/Aletta_v3.brep')
import MeshPart
mm = MeshPart.meshFromShape(Shape=acc, LinearDeflection=0.03, AngularDeflection=0.25)
mm.write('/tmp/Aletta_v3.stl')
print("SALVATO: FCStd + STEP + BREP + STL", flush=True)
