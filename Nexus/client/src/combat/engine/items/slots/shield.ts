// Щит — heater/kite/кръгъл/тарч, лице с мотив декал, дървен гръб, стоманен кант.
import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { heaterShape, SHIELD_BOUNDS } from '../../boy/src/heraldry.js';
import { mesh, merge, xf } from '../geoHelpers';
import { decalMaterial } from '../materials';
import { buildMotifTexture } from '../motifTexture';
import type { ItemTheme } from '../theme';
import type { Rand } from '../rng';
import type { Role } from '../materials';

export type ShieldKind = 'heater' | 'kite' | 'round' | 'tarch';

function bendPlane(shape: THREE.Shape, curve: number, z0: number): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setZ(i, z0 - x * x * curve);
  }
  g.computeVertexNormals();
  return g;
}

function heaterFace(scaleY = 1): { face: THREE.BufferGeometry; back: THREE.BufferGeometry; bounds: typeof SHIELD_BOUNDS } {
  const shape = heaterShape(new THREE.Shape());
  const face = bendPlane(shape, 0.55, 0.012);
  const back = bendPlane(shape, 0.55, -0.012);
  face.scale(1, scaleY, 1);
  back.scale(1, scaleY, 1);
  return { face, back, bounds: SHIELD_BOUNDS };
}

function roundFace(): { face: THREE.BufferGeometry; back: THREE.BufferGeometry } {
  const shape = new THREE.Shape().absarc(0, 0, 0.3, 0, Math.PI * 2, false);
  return { face: bendPlane(shape, 0.5, 0.012), back: bendPlane(shape, 0.5, -0.012) };
}

export function buildShield(M: Record<Role, THREE.Material>, theme: ItemTheme, tier: number, rand: Rand): THREE.Object3D {
  const kind: ShieldKind = tier >= 8 ? 'tarch' : tier >= 5 ? 'kite' : tier >= 2 ? 'heater' : (rand() > 0.5 ? 'heater' : 'round');
  const g = new THREE.Group();
  const decalTex = buildMotifTexture(theme, rand, tier);
  const decalMat = decalMaterial(theme, decalTex);

  if (kind === 'round') {
    const { face, back } = roundFace();
    g.add(mesh(face, M.primary));
    g.add(mesh(back, M.secondary));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.015, 8, 40), M.trim));
    g.add(mesh(new THREE.CircleGeometry(0.28, 40, 0, Math.PI * 2), decalMat));
  } else {
    const scaleY = kind === 'kite' ? 1.35 : kind === 'tarch' ? 0.85 : 1;
    const { face, back, bounds } = heaterFace(scaleY);
    g.add(mesh(face, M.primary));
    g.add(mesh(back, M.secondary));
    const outline = heaterShape(new THREE.Shape()).getPoints(48).map((p: THREE.Vector2) => new THREE.Vector3(p.x, p.y * scaleY, -p.x * p.x * 0.55));
    g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(outline, true), 96, 0.012, 8, true), M.trim));
    const decalGeo = new THREE.PlaneGeometry((bounds.x1 - bounds.x0) * 0.72, (bounds.y1 - bounds.y0) * scaleY * 0.72);
    decalGeo.translate(0, (bounds.y0 + bounds.y1) * scaleY * 0.35, 0.014);
    g.add(mesh(decalGeo, decalMat));
  }

  g.add(mesh(merge([
    xf(new RoundedBoxGeometry(0.03, 0.1, 0.014, 2, 0.004), [-0.1, 0.08, -0.028]),
    xf(new RoundedBoxGeometry(0.03, 0.1, 0.014, 2, 0.004), [0.14, 0.08, -0.028]),
    xf(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), [-0.172, 0.08, -0.05]),
  ]), M.secondary));
  g.userData.decalTexture = decalTex;
  return g;
}
