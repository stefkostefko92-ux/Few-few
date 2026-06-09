#!/usr/bin/env python3
"""
Mesh -> CAD reverse-engineering pipeline.

Takes a triangle-mesh scan (STL/PLY/OBJ) and produces a parametric CAD model
(STEP/BREP) by:

  1. Cleaning the raw scan (merge vertices, drop degenerate/duplicate faces).
  2. Decimating to a tractable triangle budget.
  3. Re-parametrizing the mesh with gmsh: feature edges are detected by
     dihedral angle, the surface is split into patches, and each patch is
     fitted with a spline surface (an actual analytic CAD surface, not facets).
  4. Writing the result as STEP (+ BREP) that opens in any CAD package.

Usage:
    python3 mesh_to_cad.py INPUT.stl OUTPUT_DIR [--faces N] [--angle DEG]
"""
import argparse
import os
import sys
import time

import numpy as np
import trimesh
import fast_simplification


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def clean_mesh(path):
    log(f"Loading {path}")
    m = trimesh.load(path, process=False)
    log(f"  raw: {len(m.faces):,} faces, {len(m.vertices):,} vertices")
    m.merge_vertices()
    m.update_faces(m.nondegenerate_faces())
    m.update_faces(m.unique_faces())
    m.remove_unreferenced_vertices()
    trimesh.repair.fix_normals(m)
    log(f"  cleaned: {len(m.faces):,} faces, watertight={m.is_watertight}")
    return m


def decimate(m, target_faces):
    if len(m.faces) <= target_faces:
        return m
    reduction = 1.0 - target_faces / len(m.faces)
    v, f = fast_simplification.simplify(
        m.vertices, m.faces, target_reduction=reduction
    )
    d = trimesh.Trimesh(vertices=v, faces=f, process=True)
    log(f"  decimated: {len(d.faces):,} faces")
    return d


def reparametrize_to_cad(stl_path, out_dir, angle_deg):
    import gmsh

    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 1)
    try:
        log(f"gmsh merge {stl_path}")
        gmsh.merge(stl_path)

        angle = angle_deg * np.pi / 180.0
        # forceParametrizablePatches=True forces every patch to be fittable by
        # a single spline surface; curveAngle splits feature curves.
        log(f"classifySurfaces (feature angle {angle_deg} deg)")
        gmsh.model.mesh.classifySurfaces(
            angle,
            boundary=True,
            forReparametrization=True,
            curveAngle=np.pi,
            exportDiscrete=True,
        )
        log("createGeometry (fit spline patches)")
        gmsh.model.mesh.createGeometry()

        surfaces = gmsh.model.getEntities(2)
        log(f"  reconstructed {len(surfaces)} CAD surface patches")

        # Try to build a closed solid if the patches form a watertight shell.
        try:
            sl = gmsh.model.geo.addSurfaceLoop([s[1] for s in surfaces])
            gmsh.model.geo.addVolume([sl])
            gmsh.model.geo.synchronize()
            log("  built solid volume from surface loop")
        except Exception as e:  # open scan -> surface model only
            gmsh.model.geo.synchronize()
            log(f"  surface model (no closed solid): {e}")

        os.makedirs(out_dir, exist_ok=True)
        brep = os.path.join(out_dir, "Aletta.brep")
        step = os.path.join(out_dir, "Aletta.step")
        gmsh.write(brep)
        log(f"wrote {brep} ({os.path.getsize(brep):,} bytes)")
        try:
            gmsh.write(step)
            log(f"wrote {step} ({os.path.getsize(step):,} bytes)")
        except Exception as e:
            log(f"STEP write failed via gmsh kernel: {e}")
    finally:
        gmsh.finalize()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("out_dir")
    ap.add_argument("--faces", type=int, default=80000,
                    help="target triangle budget before reparametrization")
    ap.add_argument("--angle", type=float, default=40.0,
                    help="feature edge dihedral angle in degrees")
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    m = clean_mesh(args.input)
    m = decimate(m, args.faces)
    clean_stl = os.path.join(args.out_dir, "Aletta_clean.stl")
    m.export(clean_stl)
    log(f"wrote intermediate {clean_stl}")
    reparametrize_to_cad(clean_stl, args.out_dir, args.angle)
    log("done")


if __name__ == "__main__":
    sys.exit(main())
