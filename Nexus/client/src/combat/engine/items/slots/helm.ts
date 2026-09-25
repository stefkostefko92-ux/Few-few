// Шлемове: отворен барбют / затворен велик шлем / затворен с гребен (T6+) / качулка (cloth).
import * as THREE from 'three/webgpu';
import { lathe, merge, mesh, xf } from '../geoHelpers';
import type { ItemTheme } from '../theme';
import type { Rand } from '../rng';
import type { Role } from '../materials';

const TAU = Math.PI * 2;

function silhouette(theme: ItemTheme, tier: number, rand: Rand): 'hood' | 'open' | 'closed' | 'crest' {
  if (theme.family === 'cloth') return 'hood';
  if (tier >= 6 && rand() > 0.35) return 'crest';
  if (tier >= 3 || theme.family === 'plate' || theme.family === 'mail') return 'closed';
  return 'open';
}

// Т-образен визьор (две вертикални цепки + хоризонтална лента) — единственият надежден сигнал
// „това е шлем" при малък размер на иконата; винаги в M.trim (контрастен спрямо купола).
function visor(M: Record<Role, THREE.Material>, z: number): THREE.Object3D {
  return mesh(merge([
    xf(new THREE.BoxGeometry(0.01, 0.045, 0.014), [-0.024, 0.085, z]),
    xf(new THREE.BoxGeometry(0.01, 0.045, 0.014), [0.024, 0.085, z]),
    xf(new THREE.BoxGeometry(0.1, 0.014, 0.014), [0, 0.1, z]),
  ]), M.trim, { cast: false });
}

function openHelm(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.1, -0.02], [0.108, 0.03], [0.105, 0.09], [0.09, 0.15], [0.06, 0.19], [0.0, 0.2]];
  g.add(mesh(lathe(P as [number, number][], 32, -0.9, TAU - 1.8), M.primary));
  g.add(mesh(xf(new THREE.TorusGeometry(0.1, 0.008, 8, 32, 1.9), [0, -0.02, 0], [Math.PI / 2, 0, -0.45]), M.trim));
  g.add(visor(M, 0.098));
  return g;
}

function closedHelm(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.117, -0.075], [0.124, -0.04], [0.127, 0.03], [0.127, 0.09], [0.122, 0.14], [0.1, 0.19], [0.05, 0.22], [0.0, 0.23]];
  g.add(mesh(lathe(P as [number, number][], 40), M.primary));
  g.add(mesh(merge([
    lathe([[0.1305, 0.06], [0.1308, 0.079]] as [number, number][], 28, -1.55, 3.1),
    lathe([[0.1255, 0.128], [0.12, 0.15]] as [number, number][], 40),
  ]), M.trim));
  g.add(visor(M, 0.121));
  return g;
}

function crestFin(M: Record<Role, THREE.Material>, rand: Rand): THREE.Object3D {
  const g = closedHelm(M) as THREE.Group;
  const n = 5 + Math.floor(rand() * 4);
  const fins: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const y = 0.19 + t * 0.06;
    const h = 0.05 * Math.sin(Math.PI * t) + 0.02;
    fins.push(xf(new THREE.ConeGeometry(0.006, h, 4), [0, y + h / 2, 0], [Math.PI / 2, 0, 0]));
  }
  g.add(mesh(merge(fins), M.trim, { cast: false }));
  return g;
}

function hood(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.1, -0.02], [0.105, 0.05], [0.09, 0.13], [0.05, 0.2], [0.0, 0.26]];
  g.add(mesh(lathe(P as [number, number][], 24, -1.4, TAU - 1.0), M.primary));
  return g;
}

export function buildHelm(M: Record<Role, THREE.Material>, theme: ItemTheme, tier: number, rand: Rand): THREE.Object3D {
  const kind = silhouette(theme, tier, rand);
  if (kind === 'hood') return hood(M);
  if (kind === 'crest') return crestFin(M, rand);
  if (kind === 'closed') return closedHelm(M);
  return openHelm(M);
}
