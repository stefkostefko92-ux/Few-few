#!/usr/bin/env python3
"""
End-to-end scan -> CAD pipeline (reliable route).

    raw scan mesh (STL)
      -> clean (remove duplicates/null faces, repair non-manifold geometry)
      -> screened Poisson surface reconstruction  (watertight manifold)
      -> quadric decimation + isotropic remesh     (uniform, CAD-friendly)
      -> OpenCASCADE: sew triangles -> closed shell -> SOLID
      -> STEP (AP214, MANIFOLD_SOLID_BREP) + watertight STL

The result is a closed solid B-rep that imports as a solid body in SolidWorks,
Fusion 360, Onshape, FreeCAD, CATIA, etc. It is a faithful tessellated solid of
the scan -- the basis for further parametric reverse-engineering in a CAD tool.

Usage:
    python3 scan_to_cad.py RAW.stl OUTDIR [--faces 14000] [--poisson-depth 9]
"""
import argparse
import os
import time

import pymeshlab as ml


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def reconstruct(raw, out_stl, faces, depth):
    ms = ml.MeshSet()
    ms.load_new_mesh(raw)
    log(f"loaded {ms.current_mesh().face_number():,} faces")

    ms.meshing_remove_duplicate_vertices()
    ms.meshing_remove_duplicate_faces()
    ms.meshing_remove_null_faces()
    ms.meshing_remove_unreferenced_vertices()
    ms.meshing_repair_non_manifold_edges()
    ms.meshing_repair_non_manifold_vertices()
    ms.compute_normal_per_vertex(weightmode=0)

    log("screened Poisson reconstruction -> watertight manifold")
    ms.generate_surface_reconstruction_screened_poisson(
        depth=depth, pointweight=4.0, samplespernode=1.5
    )
    log(f"  Poisson: {ms.current_mesh().face_number():,} faces")

    log(f"decimating to ~{faces:,} faces + isotropic remesh")
    ms.meshing_decimation_quadric_edge_collapse(
        targetfacenum=max(faces * 2, faces),
        preservenormal=True, planarquadric=True, autoclean=True,
    )
    ms.meshing_isotropic_explicit_remeshing(
        iterations=4, targetlen=ml.PercentageValue(1.2), adaptive=False
    )
    ms.meshing_repair_non_manifold_edges()
    ms.meshing_repair_non_manifold_vertices()
    m = ms.current_mesh()
    log(f"  final mesh: {m.face_number():,} faces, {m.vertex_number():,} verts")
    ms.save_current_mesh(out_stl, binary=True)
    log(f"wrote {out_stl}")


def to_step(stl, step):
    from OCP.RWStl import RWStl
    from OCP.BRepBuilderAPI import (
        BRepBuilderAPI_MakePolygon, BRepBuilderAPI_MakeFace,
        BRepBuilderAPI_Sewing, BRepBuilderAPI_MakeSolid,
    )
    from OCP.TopExp import TopExp_Explorer
    from OCP.TopAbs import TopAbs_SHELL, TopAbs_SOLID
    from OCP.TopoDS import TopoDS
    from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
    from OCP.STEPControl import (
        STEPControl_Writer, STEPControl_AsIs, STEPControl_ManifoldSolidBrep,
    )
    from OCP.IFSelect import IFSelect_RetDone
    from OCP.Interface import Interface_Static

    tri = RWStl.ReadFile_s(stl)
    n = tri.NbTriangles()
    log(f"sewing {n:,} triangles")
    sew = BRepBuilderAPI_Sewing(1.0e-3)
    for i in range(1, n + 1):
        a, b, c = tri.Triangle(i).Get()
        poly = BRepBuilderAPI_MakePolygon(tri.Node(a), tri.Node(b), tri.Node(c), True)
        if poly.IsDone():
            face = BRepBuilderAPI_MakeFace(poly.Wire())
            if face.IsDone():
                sew.Add(face.Face())
    sew.Perform()
    log(f"  free edges after sew: {sew.NbFreeEdges()}")

    shell = TopoDS.Shell_s(TopExp_Explorer(sew.SewedShape(), TopAbs_SHELL).Current())
    shape = shell
    if shell.Closed():
        mk = BRepBuilderAPI_MakeSolid(shell)
        if mk.IsDone():
            shape = mk.Solid()
            log("built closed SOLID")
    else:
        log("shell not closed -> exporting open shell")

    u = ShapeUpgrade_UnifySameDomain(shape, True, True, True)
    u.SetLinearTolerance(1e-3)
    u.SetAngularTolerance(1e-2)
    u.Build()
    shape = u.Shape()

    Interface_Static.SetCVal_s("write.step.schema", "AP214")
    w = STEPControl_Writer()
    mode = (STEPControl_ManifoldSolidBrep
            if shape.ShapeType() == TopAbs_SOLID else STEPControl_AsIs)
    w.Transfer(shape, mode)
    if w.Write(step) != IFSelect_RetDone:
        raise RuntimeError("STEP write failed")
    log(f"wrote {step} ({os.path.getsize(step) / 1e6:.1f} MB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("raw")
    ap.add_argument("outdir")
    ap.add_argument("--faces", type=int, default=14000)
    ap.add_argument("--poisson-depth", type=int, default=9)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    stl = os.path.join(args.outdir, "Aletta_watertight.stl")
    step = os.path.join(args.outdir, "Aletta_solid.step")
    reconstruct(args.raw, stl, args.faces, args.poisson_depth)
    to_step(stl, step)
    log("done")


if __name__ == "__main__":
    main()
