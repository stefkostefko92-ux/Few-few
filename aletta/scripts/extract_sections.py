#!/usr/bin/env python3
"""extract_sections.py — извлича адаптивни X=const сечения на тялото (външна примка)
с консистентна кореспонденция за чист loft, + вътрешните (кухина) примки отделно,
+ фитнати оси/профили на двата M8 щифта. Записва sections.npz.

Изход (npz):
  X            (n_sec,)          позиции на сеченията
  outer        (n_sec, N, 3)     ресемплирани външни примки (кореспондентни точки)
  inner_X      (m,)              X където има вътрешна (кухина) примка
  inner        (m, M, 3)         вътрешни примки (ресемплирани)
  stud1/stud2  dict в json sidecar
"""
from __future__ import annotations
import json, sys
import numpy as np
import trimesh

SCAN = sys.argv[1] if len(sys.argv) > 1 else \
    '/home/user/Few-few/aletta/scan/Aletta_v1_clean_200k.stl'
OUT = sys.argv[2] if len(sys.argv) > 2 else \
    '/home/user/Few-few/aletta/scripts/sections.npz'

N_OUTER = 160     # точки/външна примка
N_INNER = 80      # точки/вътрешна примка

m = trimesh.load(SCAN, force='mesh')


def loops_at(x):
    sec = m.section(plane_origin=[x, 0, 0], plane_normal=[1, 0, 0])
    if sec is None:
        return []
    out = []
    for L in sec.discrete:
        if len(L) < 8:
            continue
        per = np.linalg.norm(np.diff(L, axis=0), axis=1).sum()
        if per < 5:
            continue
        out.append(L)              # Nx3 (world), closed
    return out


def to2d(L):
    return L[:, 1:3].copy()        # YZ


def signed_area(P):
    x, y = P[:, 0], P[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def resample_closed(P3, N, seam_pt=None):
    """P3: Nx3 closed loop (world). Връща N кореспондентни 3D точки:
    ориентирани CCW в YZ, ресемплирани по дължина, започвайки от seam."""
    P = to2d(P3)
    if not np.allclose(P[0], P[-1]):
        P = np.vstack([P, P[0]])
        P3 = np.vstack([P3, P3[0]])
    # ориентация CCW
    if signed_area(P[:-1]) < 0:
        P = P[::-1].copy()
        P3 = P3[::-1].copy()
    # дължина по контура
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    # избор на seam
    if seam_pt is None:
        i0 = int(np.argmin(P[:-1, 1]))     # най-ниска Z → долен ръб
    else:
        d = np.linalg.norm(P[:-1] - seam_pt[None, :], axis=1)
        i0 = int(np.argmin(d))
    s0 = s[i0]
    # ресемплиране равномерно по дължина от s0
    targ = (s0 + np.linspace(0, total, N, endpoint=False)) % total
    xs = np.interp(targ, s, P3[:, 0])
    ys = np.interp(targ, s, P3[:, 1])
    zs = np.interp(targ, s, P3[:, 2])
    R = np.column_stack([xs, ys, zs])
    return R, P[i0]


def adaptive_X():
    xs = []
    # x∈[6,185] е ЕДИНСТВЕНАТА тествана плътност, при която единичната усукана
    # BSpline повърхнина остава BOP-валидна (fuse на щифтовете дава valid solid).
    # По-широко (x5/x186) или по-рядко (22 сечения) → самопресичане/невалиден fuse.
    # Затова validity има приоритет пред покриването на крайните върхове.
    x = 6.0
    while x <= 185.0:
        xs.append(round(x, 2))
        if x < 22 or x > 172:
            step = 2.0
        elif 38 <= x <= 52 or 98 <= x <= 118:
            step = 2.0
        else:
            step = 3.5
        x += step
    return xs


# --- външни примки с propagate seam ---
Xs = adaptive_X()
outer = []
Xk = []
seam = None
for x in Xs:
    Ls = loops_at(x)
    if not Ls:
        continue
    main = max(Ls, key=lambda L: np.linalg.norm(np.diff(L, axis=0), axis=1).sum())
    R, seam2 = resample_closed(main, N_OUTER, seam_pt=(seam if seam is not None else None))
    # seam в YZ (2D) за следващата станция
    seam = seam2
    outer.append(R)
    Xk.append(x)
outer = np.array(outer)
Xk = np.array(Xk)
print(f'външни сечения: {len(Xk)} (X {Xk.min()}..{Xk.max()})', flush=True)

# --- вътрешни (кухина) примки ---
inner = []
inner_X = []
iseam = None
for x in np.arange(99, 118, 2.0):
    Ls = loops_at(x)
    if len(Ls) < 2:
        continue
    Ls = sorted(Ls, key=lambda L: np.linalg.norm(np.diff(L, axis=0), axis=1).sum(),
                reverse=True)
    cand = Ls[1]   # втора по дължина = вътрешна
    per = np.linalg.norm(np.diff(cand, axis=0), axis=1).sum()
    if per < 60:   # прескочи слаб/шумов
        continue
    R, iseam2 = resample_closed(cand, N_INNER, seam_pt=(iseam if iseam is not None else None))
    iseam = iseam2
    inner.append(R)
    inner_X.append(round(x, 2))
inner = np.array(inner) if inner else np.zeros((0, N_INNER, 3))
inner_X = np.array(inner_X)
print(f'вътрешни (кухина) сечения: {len(inner_X)} X={inner_X.tolist()}', flush=True)

np.savez(OUT, X=Xk, outer=outer, inner_X=inner_X, inner=inner)
print(f'записано → {OUT}', flush=True)
