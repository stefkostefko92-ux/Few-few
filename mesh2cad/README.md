# Mesh → CAD: "Aletta scannerizzata"

Reverse-engineers the 3D-scanned triangle mesh **`Aletta v1 (1).stl`** (received
via WeTransfer — see `SOURCE.md`) into a watertight **CAD solid** in STEP format.

![raw scan vs reconstructed solid](output/comparison.png)

## What the input is
A raw optical scan of a curved vane/flap ("aletta"):
- 1,842,602 triangles, 921,950 vertices
- bounding box ≈ 189 × 61 × 210 mm
- an **almost-closed** surface — the scan covers the whole part but has **8
  holes** (largest ≈ 452-edge loop), so it is not yet watertight. A mesh carries
  no design intent, so it is not CAD.

## Pipeline — `scan_to_cad.py`
```
python3 scan_to_cad.py "Aletta v1 (1).stl" output --faces 20000
```
1. **Clean** — drop duplicate/null faces, repair non-manifold edges & vertices.
2. **Fill holes** — patch only the 8 holes, **keeping every original scanned
   triangle**, to get a **watertight manifold**. (No global resampling, no
   smoothing, no invented back side — so the solid stays true to the mesh.)
3. **Decimate** — quadric edge collapse to ~20 k faces, shape/feature
   preserving, so it is CAD-friendly rather than a 1.8 M-facet blob.
4. **OpenCASCADE (OCP)** — sew the triangles into a closed shell, promote to a
   `TopoDS_Solid`, merge coplanar faces, and write **STEP AP214** as a
   `MANIFOLD_SOLID_BREP`.

**Fidelity:** mean deviation from the raw scan ≈ **0.01 mm** (RMS 0.015 mm,
max 0.13 mm) over a ~290 mm part — i.e. the solid is geometrically the scan.

## Outputs (`output/`)
| file | what |
|------|------|
| `Aletta_solid.step` | **the solid deliverable** — closed solid B-rep, opens as a solid body in SolidWorks / Fusion 360 / Onshape / FreeCAD / CATIA (volume ≈ 229 cm³) |
| `Aletta_watertight.stl` | the cleaned, watertight, decimated mesh (intermediate / preview) |
| `comparison.png` | raw scan vs reconstructed solid |
| `Aletta_sections.step` | **parametric section model** — 25 closed B-spline cross-section curves (loft-ready); see `FEATURES.md` |
| `Aletta_sections.png` | the section-profile stack |

## Parametric / feature model — `extract_sections.py`
```
python3 extract_sections.py output/Aletta_watertight.stl output --sections 25
```
This vane is freeform (no plane/cylinder/fillet features fit — see
**`FEATURES.md`** for the measured residuals). Its natural parametric form is a
stack of **section profiles**: the script slices the solid along its span and
writes the sections as B-spline curves you can **loft** into an editable solid
in any CAD tool.

## Dependencies
```
pip install numpy trimesh numpy-stl scipy networkx fast-simplification pymeshlab cadquery-ocp
```

## Scope note — faceted vs parametric
This produces a **tessellated solid**: a faithful, watertight B-rep of the
scanned shape that any CAD package imports as a solid body. It is the correct
automated end point for "mesh → CAD".

It is **not** a feature tree (editable sketches / extrudes / fillets with
dimensions). True parametric reverse-engineering of a freeform scanned part is
an interactive job: import this STEP into a dedicated reverse-engineering tool
(Geomagic Design X, Fusion 360 Mesh/Shape workspace, Ansys SpaceClaim,
SolidWorks ScanTo3D) and fit analytic surfaces to taste. The clean watertight
solid here is the ideal starting point for that.

An experimental spline-surface route via gmsh `classifySurfaces` /
`createGeometry` was evaluated; it proved unreliable on this noisy open scan
(`Wrong topology of boundary mesh for parametrization`), so the robust
OpenCASCADE solid route above is the shipped pipeline.
