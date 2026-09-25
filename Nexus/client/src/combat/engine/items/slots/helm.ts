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

// Винаги тъмен, матов материал за визьора — НЕ M.trim (при топли/тъмни теми trim се слива с
// купола и процепите изчезват). Очните дупки на истински шлем са тъмни независимо от метала.
// Свеж инстанс на всяко строене (НЕ споделен singleton — buildItem().dispose() маха материала
// на всяка мрежа безусловно; споделен инстанс би се развалил след първия dispose()).
function visorMaterial(): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({ color: 0x0a0908, roughness: 0.85, metalness: 0.1 });
}

// Т-образен визьор (две вертикални цепки + хоризонтална лента), леко вдаден напред — единственият
// надежден сигнал „това е шлем" при малък размер на иконата.
function visor(z: number): THREE.Object3D {
  return mesh(merge([
    xf(new THREE.BoxGeometry(0.013, 0.06, 0.02), [-0.028, 0.08, z]),
    xf(new THREE.BoxGeometry(0.013, 0.06, 0.02), [0.028, 0.08, z]),
    xf(new THREE.BoxGeometry(0.115, 0.018, 0.02), [0, 0.098, z]),
  ]), visorMaterial(), { cast: false });
}

// Овоиден профил — тясна шийна отвор → издутина на бузата → стесняване към темето. Предишен
// почти цилиндричен профил четеше се като буркан/кутия; сега силуетът е недвусмислено шлем.
function openHelm(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.07, -0.05], [0.095, -0.01], [0.105, 0.05], [0.09, 0.12], [0.06, 0.17], [0.0, 0.2]];
  g.add(mesh(lathe(P as [number, number][], 32, -0.9, TAU - 1.8), M.primary));
  g.add(mesh(xf(new THREE.TorusGeometry(0.08, 0.009, 8, 32, 1.9), [0, -0.03, 0], [Math.PI / 2, 0, -0.45]), M.trim));
  g.add(visor(0.08));
  return g;
}

function closedHelm(M: Record<Role, THREE.Material>): THREE.Object3D {
  const g = new THREE.Group();
  const P = [[0.078, -0.1], [0.108, -0.06], [0.125, 0.0], [0.12, 0.06], [0.105, 0.12], [0.08, 0.18], [0.045, 0.22], [0.0, 0.235]];
  g.add(mesh(lathe(P as [number, number][], 40), M.primary));
  g.add(mesh(merge([
    lathe([[0.128, 0.02], [0.13, 0.04]] as [number, number][], 28, -1.55, 3.1),
    lathe([[0.107, 0.11], [0.098, 0.14]] as [number, number][], 40),
  ]), M.trim));
  g.add(visor(0.115));
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
