"""Step S1: sezioni lama robuste -> griglia loft.
- scarta catene interne (ray test), perni, collare staccato (zona fessura)
- stitching TSP esatto, smoothing periodico, ricampionamento
"""
import numpy as np
import trimesh
from itertools import permutations
from scipy.interpolate import splprep, splev
from shapely.geometry import LineString

FULL = trimesh.load('/tmp/Aletta_v1.stl')
FULL.apply_translation([0, 0, 212.0])
RAYMESH = trimesh.load('/tmp/pipeline/aletta_300k.stl')
RAY = trimesh.ray.ray_triangle.RayMeshIntersector(RAYMESH)

FRONT_STUD = np.array([54.84, 18.45])
REAR_STUD = np.array([124.72, 28.63])

def section_chains(z):
    sec = FULL.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
    if sec is None:
        return []
    return [sec.vertices[e.points] for e in sec.entities]

def chain_len(c):
    return np.linalg.norm(np.diff(c[:, :2], axis=0), axis=1).sum()

def is_stud(c):
    cen = c[:, :2].mean(0)
    ext = (c.max(0) - c.min(0))[:2]
    if ext.max() > 16:
        return False
    return (np.linalg.norm(cen - FRONT_STUD) < 10 or
            np.linalg.norm(cen - REAR_STUD) < 10)

def is_internal(c):
    """Campiona 3 punti, spara raggi lungo la normale 2D esterna stimata:
    una catena interna ha materiale sopra di se' in molte direzioni.
    Test: punto +0.8mm lungo la normale del segmento, raggio verso n:
    superficie esterna -> 0 hit; interna -> >=1 hit."""
    n = len(c)
    idx = [n // 4, n // 2, 3 * n // 4]
    votes = 0
    for i in idx:
        i1 = min(i + 5, n - 1)
        t = c[i1] - c[max(i - 5, 0)]
        t2 = t[:2]
        if np.linalg.norm(t2) < 1e-6:
            continue
        t2 = t2 / np.linalg.norm(t2)
        for sgn in (1, -1):
            nrm = np.array([-t2[1] * sgn, t2[0] * sgn, 0.0])
            origin = c[i] + nrm * 0.8
            hit = RAY.intersects_any(origin[None, :], nrm[None, :])
            if not hit[0]:
                # direzione libera trovata: per superficie esterna ok
                break
        else:
            votes += 1
    return votes >= 2

def drop_detached_collar(chains, main):
    """Zona fessura: collare staccato outboard del profilo principale."""
    keep = []
    ls_main = main[:, :2]
    lmain = chain_len(main)
    for c in chains:
        if c is main or chain_len(c) > 0.4 * lmain:
            keep.append(c)
            continue
        cen = c[:, :2].mean(0)
        if 85 < cen[0] < 150:
            m = ls_main[np.abs(ls_main[:, 0] - cen[0]) < 6]
            if len(m) and cen[1] > m[:, 1].max() + 4:
                continue
        keep.append(c)
    return keep

def tsp_stitch(chains):
    """Ordine ciclico + flip che minimizza i gap totali. Esatto per n<=8."""
    n = len(chains)
    if n == 1:
        return chains[0]
    ends = [(c[0, :2], c[-1, :2]) for c in chains]

    def gap(i, fi, j, fj):
        a = ends[i][0 if fi else 1]   # punto finale di i (flippato o no)
        b = ends[j][1 if fj else 0]   # punto iniziale di j
        return np.linalg.norm(a - b)

    best = (None, np.inf)
    others = list(range(1, n))
    perms = permutations(others) if n <= 8 else [tuple(others)]
    for perm in perms:
        order = (0,) + perm
        for flips in range(2 ** n):
            fl = [(flips >> k) & 1 for k in range(n)]
            tot = 0.0
            for k in range(n):
                i, j = order[k], order[(k + 1) % n]
                tot += gap(i, fl[order.index(i)] if False else fl[k], j, fl[(k + 1) % n])
                if tot >= best[1]:
                    break
            if tot < best[1]:
                best = ((order, tuple(fl)), tot)
    (order, fl), _ = best
    parts = []
    for k, i in enumerate(order):
        c = chains[i][::-1] if fl[k] else chains[i]
        parts.append(c)
    return np.vstack(parts)

def smooth_loop(loop, n=240, sigma=0.08):
    pts = loop[:, :2]
    area = 0.0
    p0 = pts.mean(0)
    d = pts - p0
    area = np.sum(d[:-1, 0] * d[1:, 1] - d[1:, 0] * d[:-1, 1])
    if area < 0:
        pts = pts[::-1]
    i0 = np.argmax(pts[:, 0])
    pts = np.roll(pts, -i0, axis=0)
    dd = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)
    pts = pts[dd > 1e-4]
    m = len(pts)
    tck, _ = splprep([pts[:, 0], pts[:, 1]], per=1, s=m * sigma ** 2, k=3)
    u = np.linspace(0, 1, 2400, endpoint=False)
    xy = np.array(splev(u, tck)).T
    seg = np.linalg.norm(np.diff(np.vstack([xy, xy[:1]]), axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    tgt = np.linspace(0, cum[-1], n, endpoint=False)
    res = np.empty((n, 2))
    xy_c = np.vstack([xy, xy[:1]])
    for k in range(2):
        res[:, k] = np.interp(tgt, cum, xy_c[:, k])
    i0 = np.argmax(res[:, 0])
    res = np.roll(res, -i0, axis=0)
    return res

def build_section(z, debug=False):
    chains = [c for c in section_chains(z) if chain_len(c) > 6 and not is_stud(c)]
    if not chains:
        return None, []
    chains_ok = [c for c in chains if not is_internal(c)]
    if not chains_ok:
        return None, []
    main = max(chains_ok, key=chain_len)
    chains_ok = drop_detached_collar(chains_ok, main)
    if len(chains_ok) > 8:
        chains_ok.sort(key=chain_len, reverse=True)
        chains_ok = chains_ok[:8]
    loop = tsp_stitch(chains_ok)
    res = smooth_loop(loop)
    simple = LineString(np.vstack([res, res[:1]])).is_simple
    return res, (chains, chains_ok, simple)

if __name__ == '__main__':
    zs = []
    zs += list(np.arange(-206.5, -198, 1.5))
    zs += list(np.arange(-198, -95, 4.0))
    zs += list(np.arange(-95, -70, 2.0))
    zs += list(np.arange(-70, -49.9, 2.0))
    zs = np.array(zs)
    grid, okz, flags = [], [], []
    for z in zs:
        res, info = build_section(z)
        if res is None:
            print(f'z={z:7.1f}  VUOTA')
            continue
        chains, kept, simple = info
        tag = '' if simple else '  *** SELF-INTERSECT ***'
        print(f'z={z:7.1f}  catene={len(chains)} usate={len(kept)}{tag}')
        grid.append(res)
        okz.append(z)
        flags.append(simple)
    grid = np.array(grid)
    okz = np.array(okz)
    np.savez('grid_v2.npz', grid=grid, z=okz, simple=np.array(flags))
    print('salvato:', grid.shape)
