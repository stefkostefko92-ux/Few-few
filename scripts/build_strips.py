"""Step S3: curve di giunzione fianchi/bordi (offset 15mm dai bordi) + strisce 40mm.
Usa la griglia sezioni (grid_v2). Lato A / lato B identificati a posteriori.
"""
import numpy as np
from scipy.interpolate import splprep, splev, interp1d

OFFSET = 15.0   # distanza on-surface dal bordo (LE/TE)
WIDTH = 40.0    # larghezza barriera

d = np.load('grid_v2.npz')
grid2d, zs = d['grid'], d['z']          # (56, 240, 2), z crescente? controlla
order = np.argsort(zs)
zs = zs[order]; grid2d = grid2d[order]
N = grid2d.shape[1]
grid = np.concatenate([grid2d, np.repeat(zs[:, None, None], N, axis=1)], axis=2)

def arclen(pts):
    seg = np.linalg.norm(np.diff(np.vstack([pts, pts[:1]]), axis=0), axis=1)
    return np.concatenate([[0], np.cumsum(seg)])

def walk_from(pts, i0, dist, direction):
    """cammina lungo il loop chiuso da indice i0 per dist mm; direction +1/-1.
    ritorna punto 2D interpolato e indice frazionario."""
    n = len(pts)
    acc = 0.0
    i = i0
    while acc < dist:
        j = (i + direction) % n
        step = np.linalg.norm(pts[j] - pts[i])
        if acc + step >= dist:
            t = (dist - acc) / step
            return pts[i] + t * (pts[j] - pts[i]), (i + direction * t) % n
        acc += step
        i = j
    return pts[i], float(i)

def surf_normal(si, fj):
    """normale 3D esterna della superficie loft in (sezione si, indice frazionario fj)."""
    j0 = int(fj) % N
    # tangente lungo la sezione
    tu = grid[si, (j0+1) % N] - grid[si, (j0-1) % N]
    # tangente tra sezioni
    s0, s1 = max(si-1, 0), min(si+1, len(zs)-1)
    tv = grid[s1, j0] - grid[s0, j0]
    nrm = np.cross(tu, tv)
    nn = np.linalg.norm(nrm)
    if nn < 1e-9: return np.array([0., 0., 1.])
    nrm /= nn
    # orienta esterno: loop CCW -> normale 2D esterna = (ty, -tx)
    t2 = tu[:2] / max(np.linalg.norm(tu[:2]), 1e-9)
    out2 = np.array([t2[1], -t2[0]])
    if np.dot(nrm[:2], out2) < 0:
        nrm = -nrm
    return nrm

# per ogni sezione: estremo posteriore = indice 0 (fase), estremo anteriore = min x
ptsA_LE, ptsB_LE, ptsA_TE, ptsB_TE = [], [], [], []
nrmA_LE, nrmB_LE, nrmA_TE, nrmB_TE = [], [], [], []
zA_LE, zB_LE, zA_TE, zB_TE = [], [], [], []

Z_TE_MAX = -76.0   # le strisce TE si fermano sotto la zona collare
Z_LE_MAX = -52.0
Z_LE_MAX_B = -66.0

for si, z in enumerate(zs):
    pts = grid2d[si]
    i_front = int(np.argmin(pts[:, 0]))
    # lato A = indici crescenti dal fronte (CCW), lato B = decrescenti
    pA, fA = walk_from(pts, i_front, OFFSET, +1)
    pB, fB = walk_from(pts, i_front, OFFSET, -1)
    if z <= Z_LE_MAX:
        ptsA_LE.append([*pA, z]); nrmA_LE.append(surf_normal(si, fA)); zA_LE.append(z)
    if z <= Z_LE_MAX_B:
        ptsB_LE.append([*pB, z]); nrmB_LE.append(surf_normal(si, fB)); zB_LE.append(z)
    # TE: dal punto di fase 0 (estremo posteriore)
    qA, gA = walk_from(pts, 0, OFFSET, -1)   # verso lato A (indici decrescenti dal retro)
    qB, gB = walk_from(pts, 0, OFFSET, +1)
    if z <= Z_TE_MAX:
        ptsA_TE.append([*qA, z]); nrmA_TE.append(surf_normal(si, gA)); zA_TE.append(z)
        ptsB_TE.append([*qB, z]); nrmB_TE.append(surf_normal(si, gB)); zB_TE.append(z)

# NB: "lato A" via +1 dal fronte e "-1 dal retro" devono coincidere:
# il loop CCW: fronte->retro lungo un lato con indici crescenti? verifica con y medio
ptsA_LE = np.array(ptsA_LE); ptsB_LE = np.array(ptsB_LE)
ptsA_TE = np.array(ptsA_TE); ptsB_TE = np.array(ptsB_TE)
nrmA_LE = np.array(nrmA_LE); nrmB_LE = np.array(nrmB_LE)
nrmA_TE = np.array(nrmA_TE); nrmB_TE = np.array(nrmB_TE)
print('media y: A_LE %.1f  B_LE %.1f  A_TE %.1f  B_TE %.1f' % (
    ptsA_LE[:,1].mean(), ptsB_LE[:,1].mean(), ptsA_TE[:,1].mean(), ptsB_TE[:,1].mean()))
print('media ny: A_LE %.2f  B_LE %.2f  A_TE %.2f  B_TE %.2f' % (
    nrmA_LE[:,1].mean(), nrmB_LE[:,1].mean(), nrmA_TE[:,1].mean(), nrmB_TE[:,1].mean()))

# chiusura in punta: collega A_LE<->A_TE lungo la sezione piu' bassa
pts_bot = grid2d[0]; z_bot = zs[0]
i_front = int(np.argmin(pts_bot[:, 0]))
_, fA = walk_from(pts_bot, i_front, OFFSET, +1)
_, gA = walk_from(pts_bot, 0, OFFSET, -1)
_, fB = walk_from(pts_bot, i_front, OFFSET, -1)
_, gB = walk_from(pts_bot, 0, OFFSET, +1)

def arc_between(pts, f0, f1, direction, nsteps=24):
    """punti lungo il loop da indice fraz f0 a f1 nella direzione data."""
    n = len(pts)
    i0, i1 = int(np.ceil(f0)) % n if direction>0 else int(np.floor(f0)) % n, None
    out = []
    i = i0
    # cammina finche' non superi f1
    for _ in range(n):
        out.append(pts[i % n])
        nxt = (i + direction) % n
        # stop quando passiamo f1
        if direction > 0:
            if (i % n) <= f1 <= ((i + 1) % n if (i+1)%n> (i%n) else f1):
                pass
        i = nxt
        if abs((i % n) - f1) < 1.0:
            break
    return np.array(out)

# semplice: indices interi tra fA e gA andando con +1 (lato A dal fronte al retro)
def indices_path(n, f0, f1, direction):
    i = int(round(f0)) % n
    j = int(round(f1)) % n
    out = [i]
    while i != j:
        i = (i + direction) % n
        out.append(i)
    return out

idxA = indices_path(N, fA, gA, +1)
idxB = indices_path(N, fB, gB, -1)
print('tip bridge: lato A %d punti, lato B %d punti' % (len(idxA), len(idxB)))
bridgeA = np.column_stack([pts_bot[idxA], np.full(len(idxA), z_bot)])
bridgeB = np.column_stack([pts_bot[idxB], np.full(len(idxB), z_bot)])
nrm_bA = np.array([surf_normal(0, j) for j in idxA])
nrm_bB = np.array([surf_normal(0, j) for j in idxB])

def build_side(le_pts, le_nrm, te_pts, te_nrm, bridge, bridge_n):
    """curva continua: LE (dall'alto in basso) + ponte punta + TE (dal basso in alto)"""
    P = np.vstack([le_pts[::-1], bridge, te_pts])
    Nrm = np.vstack([le_nrm[::-1], bridge_n, te_nrm])
    # smoothing spline 3D aperta
    d = np.linalg.norm(np.diff(P, axis=0), axis=1)
    keep = np.concatenate([[True], d > 1e-6])
    P, Nrm = P[keep], Nrm[keep]
    m = len(P)
    tck, u = splprep(P.T, s=m * 0.3**2, k=3)
    uu = np.linspace(0, 1, 220)
    C = np.array(splev(uu, tck)).T
    # normali: interpola per u
    fn = interp1d(u, Nrm, axis=0, bounds_error=False, fill_value=(Nrm[0], Nrm[-1]))
    Cn = fn(uu)
    Cn /= np.linalg.norm(Cn, axis=1, keepdims=True)
    # lisciatura pesante delle direzioni (le barriere devono essere pareti dolci)
    from scipy.signal import savgol_filter
    Cn = savgol_filter(Cn, 81, 2, axis=0, mode='nearest')
    # in alto (vicino radice) parete verticale: nz -> 0; verso la punta libera
    zc = C[:, 2]
    scale = np.clip((-80.0 - zc) / 100.0, 0.0, 1.0)   # 0 sopra z=-80, 1 sotto z=-180
    Cn[:, 2] *= scale
    Cn /= np.linalg.norm(Cn, axis=1, keepdims=True)
    Cn = savgol_filter(Cn, 41, 2, axis=0, mode='nearest')
    Cn /= np.linalg.norm(Cn, axis=1, keepdims=True)
    outer = C + WIDTH * Cn
    return C, outer, Cn

CA, CA_out, _ = build_side(ptsA_LE, nrmA_LE, ptsA_TE, nrmA_TE, bridgeA, nrm_bA)
CB, CB_out, _ = build_side(ptsB_LE, nrmB_LE, ptsB_TE, nrmB_TE, bridgeB, nrm_bB)

# curve silhouette bordo entrata / uscita (estremi delle sezioni)
le_sil = np.array([[*grid2d[i][np.argmin(grid2d[i][:,0])], zs[i]] for i in range(len(zs))])
te_sil = np.array([[*grid2d[i][0], zs[i]] for i in range(len(zs))])

np.savez('strips.npz', CA=CA, CA_out=CA_out, CB=CB, CB_out=CB_out,
         le_sil=le_sil, te_sil=te_sil)
print('strips salvate. CA z:', CA[:,2].min(), CA[:,2].max())
