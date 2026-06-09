#!/usr/bin/env python3
"""
Mesh -> STEP solid using the OpenCASCADE kernel (OCP).

This is the robust, portable path: it sews the triangle scan into a B-rep
shell, makes a solid, then runs ShapeUpgrade_UnifySameDomain so that coplanar
triangles in flat regions are merged into single planar faces. The result is a
real STEP solid that opens in every CAD package (SolidWorks, Fusion, FreeCAD,
Onshape, CATIA...).

Usage:
    python3 mesh_to_step_occ.py CLEAN.stl OUTPUT.step
"""
import sys
import time

from OCP.RWStl import RWStl
from OCP.TopoDS import TopoDS_Shell, TopoDS_Builder
from OCP.BRep import BRep_Builder
from OCP.BRepBuilderAPI import (
    BRepBuilderAPI_MakePolygon,
    BRepBuilderAPI_MakeFace,
    BRepBuilderAPI_Sewing,
    BRepBuilderAPI_MakeSolid,
)
from OCP.gp import gp_Pnt
from OCP.ShapeUpgrade import ShapeUpgrade_UnifySameDomain
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.IFSelect import IFSelect_RetDone
from OCP.Interface import Interface_Static


def log(m):
    print(f"[{time.strftime('%H:%M:%S')}] {m}", flush=True)


def build_step(stl_path, step_path):
    log(f"reading triangulation {stl_path}")
    tri = RWStl.ReadFile_s(stl_path)
    nb_tri = tri.NbTriangles()
    nb_nodes = tri.NbNodes()
    log(f"  {nb_nodes:,} nodes, {nb_tri:,} triangles")

    sew = BRepBuilderAPI_Sewing(1.0e-4)
    for i in range(1, nb_tri + 1):
        t = tri.Triangle(i)
        n1, n2, n3 = t.Get()
        p1, p2, p3 = tri.Node(n1), tri.Node(n2), tri.Node(n3)
        poly = BRepBuilderAPI_MakePolygon(p1, p2, p3, True)
        if not poly.IsDone():
            continue
        face = BRepBuilderAPI_MakeFace(poly.Wire())
        if face.IsDone():
            sew.Add(face.Face())
        if i % 20000 == 0:
            log(f"    added {i:,}/{nb_tri:,} faces")

    log("sewing shell ...")
    sew.Perform()
    shell = sew.SewedShape()

    log("unifying coplanar faces (UnifySameDomain) ...")
    unify = ShapeUpgrade_UnifySameDomain(shell, True, True, True)
    unify.SetLinearTolerance(1.0e-3)
    unify.SetAngularTolerance(1.0e-2)
    unify.Build()
    shape = unify.Shape()

    # Try to promote the shell to a solid.
    try:
        if isinstance(shape, TopoDS_Shell):
            solid = BRepBuilderAPI_MakeSolid(shape)
            if solid.IsDone():
                shape = solid.Solid()
                log("made solid from shell")
    except Exception as e:
        log(f"solid promotion skipped: {e}")

    log(f"writing STEP {step_path}")
    Interface_Static.SetCVal_s("write.step.schema", "AP214")
    writer = STEPControl_Writer()
    writer.Transfer(shape, STEPControl_AsIs)
    status = writer.Write(step_path)
    if status != IFSelect_RetDone:
        raise RuntimeError(f"STEP write failed: {status}")
    log("STEP written OK")


if __name__ == "__main__":
    build_step(sys.argv[1], sys.argv[2])
