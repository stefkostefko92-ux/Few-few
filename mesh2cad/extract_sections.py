#!/usr/bin/env python3
"""
Parametric section model of the vane.

A freeform vane has no plane/cylinder/fillet features to fit (verified: best
plane/cylinder fits leave >10 mm error). Its natural *parametric* description is
a stack of cross-section profiles along the span -- exactly how blades/vanes are
defined in CAD (loft / blend through sections).

This script slices the solid along its principal (span) axis, fits each section
as a closed B-spline curve, and writes:
  - Aletta_sections.step : the section curves as a STEP wireframe (loft-ready)
  - Aletta_sections.png  : a render of the section stack

Usage:
    python3 extract_sections.py SOLID.stl OUTDIR [--sections 25] [--points 80]
"""
import argparse
import os

import numpy as np
import trimesh

from OCP.gp import gp_Pnt
from OCP.TColgp import TColgp_HArray1OfPnt
from OCP.GeomAPI import GeomAPI_Interpolate
from OCP.BRepBuilderAPI import BRepBuilderAPI_MakeEdge, BRepBuilderAPI_MakeWire
from OCP.TopoDS import TopoDS_Compound
from OCP.BRep import BRep_Builder
from OCP.STEPControl import STEPControl_Writer, STEPControl_AsIs
from OCP.Interface import Interface_Static
from OCP.IFSelect import IFSelect_RetDone


def principal_frame(V):
    c0 = V.mean(0)
    _, _, vt = np.linalg.svd(V - c0, full_matrices=False)
    vt = np.asarray(vt)
    return c0, vt[0], vt[1], vt[2]   # centroid, span axis, e1, e2


def resample_closed(poly, n):
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(poly, axis=0), axis=1))]
    if d[-1] == 0:
        return None
    u = np.linspace(0, d[-1], n, endpoint=False)
    return np.column_stack([np.interp(u, d, poly[:, i]) for i in range(3)])


def section_profiles(mesh, n_sections, n_points):
    V = np.asarray(mesh.vertices)
    c0, axis, e1, e2 = principal_frame(V)
    t = (V - c0) @ axis
    stations = np.linspace(t.min() + 4, t.max() - 4, n_sections)
    profiles = []
    for tv in stations:
        sec = mesh.section(plane_origin=c0 + tv * axis, plane_normal=axis)
        if sec is None:
            continue
        loop = np.asarray(max(sec.discrete, key=lambda d: len(d)))
        if len(loop) < 12:
            continue
        if np.linalg.norm(loop[0] - loop[-1]) > 1e-6:
            loop = np.vstack([loop, loop[0]])
        R = resample_closed(loop, n_points)
        if R is not None:
            profiles.append((tv, R))
    return profiles, (c0, axis, e1, e2)


def closed_bspline_wire(points):
    n = len(points)
    harr = TColgp_HArray1OfPnt(1, n + 1)
    for i in range(n):
        harr.SetValue(i + 1, gp_Pnt(*points[i]))
    harr.SetValue(n + 1, gp_Pnt(*points[0]))
    interp = GeomAPI_Interpolate(harr, False, 1e-3)
    interp.Perform()
    if not interp.IsDone():
        return None
    edge = BRepBuilderAPI_MakeEdge(interp.Curve()).Edge()
    return BRepBuilderAPI_MakeWire(edge).Wire()


def write_step(profiles, path):
    builder = BRep_Builder()
    comp = TopoDS_Compound()
    builder.MakeCompound(comp)
    n = 0
    for _, R in profiles:
        w = closed_bspline_wire(R)
        if w is not None:
            builder.Add(comp, w)
            n += 1
    Interface_Static.SetCVal_s("write.step.schema", "AP214")
    writer = STEPControl_Writer()
    writer.Transfer(comp, STEPControl_AsIs)
    if writer.Write(path) != IFSelect_RetDone:
        raise RuntimeError("STEP write failed")
    return n


def render(profiles, frame, mesh, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    c0, axis, e1, e2 = frame
    fig = plt.figure(figsize=(13, 6))

    ax = fig.add_subplot(121, projection="3d")
    for _, R in profiles:
        Rc = np.vstack([R, R[0]])
        ax.plot(Rc[:, 0], Rc[:, 1], Rc[:, 2], color="#1f6fbf", lw=1.0)
    ax.set_box_aspect(np.array(mesh.extents, dtype=float))
    ax.set_title(f"{len(profiles)} section profiles along span (228 mm)")
    ax.axis("off"); ax.view_init(elev=20, azim=-70)

    ax2 = fig.add_subplot(122)
    for k, (_, R) in enumerate(profiles):
        Rc = np.vstack([R, R[0]])
        u = (Rc - c0) @ e1
        v = (Rc - c0) @ e2
        ax2.plot(u, v, lw=0.9, color=plt.cm.viridis(k / max(1, len(profiles) - 1)))
    ax2.set_aspect("equal")
    ax2.set_title("Section profiles in span-normal plane")
    ax2.set_xlabel("e1 (mm)"); ax2.set_ylabel("e2 (mm)")
    plt.tight_layout()
    plt.savefig(path, dpi=110, bbox_inches="tight")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("solid")
    ap.add_argument("outdir")
    ap.add_argument("--sections", type=int, default=25)
    ap.add_argument("--points", type=int, default=80)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    mesh = trimesh.load(args.solid, process=True)
    profiles, frame = section_profiles(mesh, args.sections, args.points)
    print(f"extracted {len(profiles)} section profiles")

    step = os.path.join(args.outdir, "Aletta_sections.step")
    n = write_step(profiles, step)
    print(f"wrote {step}  ({n} B-spline section curves, "
          f"{os.path.getsize(step)/1e3:.0f} KB)")

    png = os.path.join(args.outdir, "Aletta_sections.png")
    render(profiles, frame, mesh, png)
    print(f"wrote {png}")


if __name__ == "__main__":
    main()
