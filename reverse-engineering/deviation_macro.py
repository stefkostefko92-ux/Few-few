# -*- coding: utf-8 -*-
"""
Macro FreeCAD — Mappa di deviazione superfici vs scansione
==========================================================
Riproduce nella vista 3D di FreeCAD la mappa colorata di deviazione tra le
superfici ricostruite (Sup_*) e la mesh della scansione.

FreeCAD NON ha un comando nativo di deviazione a colori, quindi questa macro
lo fa via script: per ogni superficie la tassella, calcola la distanza di
ogni vertice dalla scansione e colora la mesh risultante (verde = dentro
tolleranza, rosso = fuori).

USO (ambiente / workbench: Mesh Design)
---------------------------------------
1. Apri  reverse-engineering/Aletta_RE.FCStd
2. Menu  Macro -> Macro... -> seleziona questo file -> Esegui
   (oppure incollalo nella console Python:  Vista -> Pannelli -> Console Python)

Per la massima precisione la macro usa la scansione PIENA se trova
SCAN_STL su disco; altrimenti usa la mesh decimata salvata nel documento.
"""
import os
import numpy as np
import FreeCAD as App
import Mesh, MeshPart

# ---- parametri ----------------------------------------------------------
SCAN_STL  = '/tmp/aletta.stl'   # scansione piena; se manca, usa la mesh nel doc
TOL_MM    = 1.0                 # fondo scala della colorbar (rosso pieno)
DEFLECT   = 0.4                 # finezza tassellatura superfici [mm]
# -------------------------------------------------------------------------

doc = App.ActiveDocument
if doc is None:
    raise RuntimeError("Apri prima Aletta_RE.FCStd")

# --- scansione di riferimento (nuvola di punti) --------------------------
if os.path.exists(SCAN_STL):
    scan_pts = np.array(Mesh.Mesh(SCAN_STL).Topology[0])
    App.Console.PrintMessage("Riferimento: %s (%d punti)\n" % (SCAN_STL, len(scan_pts)))
else:
    ref = [o for o in doc.Objects if o.isDerivedFrom('Mesh::Feature')]
    if not ref:
        raise RuntimeError("Nessuna mesh di riferimento nel documento")
    scan_pts = np.array(ref[0].Mesh.Topology[0])
    App.Console.PrintMessage("Riferimento: mesh nel doc (%d punti, decimata)\n" % len(scan_pts))

# --- ricerca del punto piu' vicino (scipy se c'e', altrimenti a blocchi) -
try:
    from scipy.spatial import cKDTree
    _tree = cKDTree(scan_pts)
    def nearest(pts):
        d, _ = _tree.query(pts, workers=-1)
        return d
except Exception:
    def nearest(pts):
        out = np.empty(len(pts))
        for i in range(0, len(pts), 2000):
            blk = pts[i:i + 2000]
            dif = scan_pts[None, :, :] - blk[:, None, :]
            out[i:i + 2000] = np.sqrt((dif * dif).sum(-1)).min(1)
        return out

def colormap(t):
    """t in [0,1] -> RGB verde(0) -> giallo(0.5) -> rosso(1) (stile RdYlGn_r)."""
    t = np.clip(t, 0.0, 1.0)
    r = np.where(t < 0.5, 2 * t, 1.0)
    g = np.where(t < 0.5, 1.0, 2 * (1 - t))
    b = np.zeros_like(t)
    return np.stack([r, g, b], axis=1)

# --- elabora ogni superficie --------------------------------------------
sups = [o for o in doc.Objects if o.Name.startswith('Sup_')]
grp = doc.getObject('Deviazione') or doc.addObject('App::DocumentObjectGroup', 'Deviazione')
grp.Label = 'Deviazione (mappa colori)'

all_d = []
for o in sups:
    m = MeshPart.meshFromShape(Shape=o.Shape, LinearDeflection=DEFLECT,
                               AngularDeflection=0.5)
    pts = np.array(m.Topology[0])
    d = nearest(pts)
    all_d.append(d)

    dev = doc.getObject('Dev_' + o.Name[4:]) or \
          doc.addObject('Mesh::Feature', 'Dev_' + o.Name[4:])
    dev.Mesh = m
    grp.addObject(dev)
    if o.ViewObject:
        o.ViewObject.Visibility = False

    # colorazione per-vertice via scenegraph Coin (GUI)
    try:
        from pivy import coin
        cols = [tuple(c) for c in colormap(d / TOL_MM)]
        node = dev.ViewObject.RootNode
        mat = coin.SoMaterial()
        mat.diffuseColor.setValues(0, len(cols), cols)
        binding = coin.SoMaterialBinding()
        binding.value = coin.SoMaterialBinding.PER_VERTEX_INDEXED
        node.insertChild(binding, 0)
        node.insertChild(mat, 0)
    except Exception as e:
        App.Console.PrintWarning("Colore non applicato a %s: %s\n" % (o.Name, e))

    App.Console.PrintMessage("  %-22s media %.3f  max %.3f mm\n"
                             % (o.Name, d.mean(), d.max()))

all_d = np.concatenate(all_d)
App.Console.PrintMessage(
    "TOTALE  media %.3f  p95 %.3f  max %.3f mm  (fondo scala %.1f mm)\n"
    % (all_d.mean(), np.percentile(all_d, 95), all_d.max(), TOL_MM))
doc.recompute()
try:
    import FreeCADGui as Gui
    Gui.activeDocument().activeView().viewIsometric()
    Gui.SendMsgToActiveView("ViewFit")
except Exception:
    pass
