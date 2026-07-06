#!/usr/bin/env python3
"""grade.py — детерминистичен грейдър на deviation: скан-върхове → CAD повърхнина.

Точна point-to-triangle дистанция (trimesh.closest_point, на партиди), по зони:
тяло, вилка/кухина, бос1, бос2, щифт1, щифт2. Печата таблица + по избор PLY heatmap.

Употреба:
  python3 grade.py CAD.stl [--scan SCAN.stl] [--heatmap OUT.ply] [--tag ИМЕ]
"""
from __future__ import annotations
import argparse
import numpy as np
import trimesh
from trimesh.proximity import closest_point

SCAN = '/home/user/Few-few/aletta/scan/Aletta_v1_clean_200k.stl'

# оси на щифтовете (fit от скана)
S1 = dict(pt=np.array([65.884, 45.298, 73.252]), ax=np.array([-0.1037, -0.1183, 0.9875]),
          zlo=188, zhi=212)
S2 = dict(pt=np.array([132.657, 45.029, 48.131]), ax=np.array([-0.0858, -0.0408, 0.9955]),
          zlo=146, zhi=168)


def axial(V, S):
    dp = V - S['pt']
    along = dp @ S['ax']
    perp = np.linalg.norm(dp - np.outer(along, S['ax']), axis=1)
    return along, perp


def zones(V):
    """Връща dict име→булева маска над върховете на скана."""
    z = V[:, 2]
    a1, r1 = axial(V, S1)
    a2, r2 = axial(V, S2)
    stud1 = (r1 < 5.0) & (z > S1['zlo']) & (z < S1['zhi'])
    stud2 = (r2 < 5.0) & (z > S2['zlo']) & (z < S2['zhi'])
    boss1 = (r1 >= 5.0) & (r1 < 12.0) & (z > S1['zlo'] - 6) & (z < S1['zhi']) & ~stud1
    boss2 = (r2 >= 5.0) & (r2 < 12.0) & (z > S2['zlo'] - 6) & (z < S2['zhi']) & ~stud2
    x = V[:, 0]
    fork = (((x >= 40) & (x <= 52)) | ((x >= 98) & (x <= 118)))
    used = stud1 | stud2 | boss1 | boss2 | fork
    body = ~used
    return dict(body=body, fork_cavity=fork, boss1=boss1, boss2=boss2,
                stud1=stud1, stud2=stud2, ALL=np.ones(len(V), bool))


def dist_to_cad(cad, V, batch=20000):
    out = np.empty(len(V))
    for i in range(0, len(V), batch):
        _, d, _ = closest_point(cad, V[i:i+batch])
        out[i:i+batch] = d
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cad')
    ap.add_argument('--scan', default=SCAN)
    ap.add_argument('--heatmap')
    ap.add_argument('--tag', default='v4')
    ap.add_argument('--nsub', type=int, default=45000, help='субсемпъл скан-върхове (0=всички)')
    a = ap.parse_args()

    cad = trimesh.load(a.cad, force='mesh')
    scan = trimesh.load(a.scan, force='mesh')
    V = scan.vertices
    if a.nsub and a.nsub < len(V):
        idx = np.random.default_rng(0).choice(len(V), a.nsub, replace=False)
        V = V[idx]
    print(f'CAD: {len(cad.faces):,} трг · скан върхове: {len(V):,}', flush=True)
    d = dist_to_cad(cad, V)
    Z = zones(V)

    print(f'\n=== Deviation {a.tag} (скан→CAD, mm) ===')
    print(f'{"зона":<12}{"n":>8}{"median":>9}{"mean":>8}{"rms":>8}'
          f'{"p95":>8}{"p99":>8}{"max":>8}{"%<=0.2":>9}')
    order = ['ALL', 'body', 'fork_cavity', 'boss1', 'boss2', 'stud1', 'stud2']
    rows = {}
    for k in order:
        mk = Z[k]
        if mk.sum() == 0:
            continue
        dd = d[mk]
        rms = float(np.sqrt(np.mean(dd**2)))
        row = (int(mk.sum()), float(np.median(dd)), float(dd.mean()), rms,
               float(np.percentile(dd, 95)), float(np.percentile(dd, 99)),
               float(dd.max()), float((dd <= 0.2).mean()*100))
        rows[k] = row
        print(f'{k:<12}{row[0]:>8,}{row[1]:>9.3f}{row[2]:>8.3f}{row[3]:>8.3f}'
              f'{row[4]:>8.3f}{row[5]:>8.3f}{row[6]:>8.3f}{row[7]:>8.1f}')

    if a.heatmap:
        cap = 1.5
        t = np.clip(d / cap, 0, 1)
        col = np.zeros((len(d), 4), np.uint8)
        col[:, 0] = (t*255).astype(np.uint8)
        col[:, 1] = ((1-t)*255).astype(np.uint8)
        col[:, 3] = 255
        trimesh.PointCloud(V, colors=col).export(a.heatmap)
        print(f'\nheatmap → {a.heatmap} (зелено<=0, червено>=1.5mm)')

    import json
    print('\nJSON', json.dumps({k: rows[k] for k in rows}))


if __name__ == '__main__':
    main()
