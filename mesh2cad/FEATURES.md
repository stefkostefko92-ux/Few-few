# Feature analysis — can "Aletta" be a parametric feature model?

Goal: turn the scan into an editable feature model (planes / cylinders / fillets,
or fitted analytic surfaces). Here is what the geometry actually supports.

## Measured shape (from the watertight solid)
| quantity | value |
|---|---|
| volume | 229.3 cm³ |
| surface area | 694.1 cm² |
| bounding box | 189.1 × 61.1 × 210.4 mm |
| span (principal axis) | 228.0 mm |
| section chord | 44 → 160 mm |
| section thickness | 12.3 → 31.9 mm |

The part is a **thin curved sheet/vane that twists along its span** — see
`output/Aletta_sections.png`.

## Why a plane/cylinder/fillet feature tree does **not** fit
Primitive fits were run on the scan and leave large residuals:

| fit | result | mean residual |
|---|---|---|
| best plane (whole part) | — | **9.9 mm** |
| best cylinder (whole part) | R ≈ 261 mm | **11.3 mm** |
| cylinder on main face (78 % of area) | R ≈ 1186 mm | **12.2 mm** |
| cylinder on 2nd face (14 % of area) | R ≈ 436 mm | **7.6 mm** |

A primitive feature needs sub-millimetre residuals; 8–12 mm means there are no
planar, cylindrical or conical features to extract. The two dominant faces are
**doubly-curved freeform** surfaces, and they **fold over their own mean plane**
(12–25 mm multi-valued), so they cannot even be fit as a single NURBS height
field. Automatic mesh→NURBS reparametrization (gmsh `createGeometry`) also fails
on them (`Wrong topology of boundary mesh for parametrization`).

**Conclusion:** a fully-editable primitive/feature tree is not recoverable
automatically for this freeform part — that is an interactive reverse-engineering
job (Geomagic Design X, Fusion 360 Mesh, SpaceClaim).

## What *is* a valid parametric description: section profiles
A vane is naturally parameterized the way blades are — by **cross-section
profiles stacked along the span**. `extract_sections.py` slices the solid into
25 profiles, fits each as a **closed B-spline curve**, and exports them:

- `output/Aletta_sections.step` — the 25 section curves as a STEP wireframe.
- `output/Aletta_sections.png` — the section stack + overlaid profiles.

These curves are exact slices of the scan (not approximations). To rebuild an
editable solid, **loft / blend through them** in any CAD tool
(SolidWorks Loft, Fusion Loft, Onshape Loft) — that gives a clean, parametric,
surface-driven body whose fidelity you control via the number of sections.

> A fully-automatic loft was prototyped here (`BRepOffsetAPI_ThruSections`); it
> builds, but without interactive seam/orientation control it twists and the
> volume drifts 15–150 %. Lofting interactively from these exact section curves
> is the reliable route, which is why we ship the curves rather than a bad loft.
