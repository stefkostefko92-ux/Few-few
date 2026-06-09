# Mesh → CAD conversion: "Aletta" scan

Converts the 3D-scanned triangle mesh `Aletta v1 (1).stl` (received via
WeTransfer, ~1.84 M triangles, ~189 × 61 × 210 mm, open/non-watertight scan)
into a CAD model.

## Pipeline

Two complementary routes are provided:

### 1. `mesh_to_cad.py` — spline-surface reconstruction (gmsh)
Re-engineers the scan into analytic CAD surfaces:
1. Clean the raw scan (merge vertices, drop degenerate/duplicate faces, fix normals).
2. Decimate to a tractable triangle budget.
3. `gmsh` re-parametrization: detect feature edges by dihedral angle, split the
   surface into patches, fit a spline surface to each patch.
4. Export **BREP** (and **STEP** when the geometry is closeable).

```
python3 mesh_to_cad.py "Aletta v1 (1).stl" output --faces 80000 --angle 40
```

### 2. `mesh_to_step_occ.py` — faceted B-rep solid (OpenCASCADE / OCP)
The robust, portable route that always yields a STEP that opens in any CAD tool:
1. Sew the triangles into a B-rep shell.
2. `ShapeUpgrade_UnifySameDomain` merges coplanar facets into single planar faces.
3. Promote to a solid and write **STEP** (AP214).

```
python3 mesh_to_step_occ.py output/Aletta_clean.stl output/Aletta_faceted.step
```

## Outputs (in `output/`)
- `Aletta_clean.stl`   — cleaned + decimated mesh (intermediate)
- `Aletta.brep` / `Aletta.step` — spline-surface CAD model
- `Aletta_faceted.step` — faceted B-rep solid

## Dependencies
```
pip install trimesh numpy numpy-stl scipy networkx fast-simplification gmsh cadquery-ocp
# system: libglu1-mesa (for gmsh)
```

## Note on "mesh to CAD"
A scan is dense, faceted geometry with no design intent. These scripts produce
valid, openable CAD geometry (analytic surfaces / a solid). Full *parametric*
feature reconstruction (sketches, extrudes, fillets with editable dimensions)
is an interactive reverse-engineering task best finished in a dedicated tool
(SolidWorks/Geomagic, Fusion 360 Mesh workspace, Ansys SpaceClaim) starting
from the STEP produced here.
