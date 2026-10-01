// The travelling cable: a flat cable from under the car down to its loop and up to its fixed point on the wall at
// mid travel, then fixed along the wall to the top. The loop hangs where the cable's length puts it, so it rides
// at half the car's speed. On a free side wall by the back corner, clear of the governor's rope. Loaded only through
// boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import type { Layout } from '@/shaft';
import type { Section } from '@/shaft/section';
import { P } from './geom';
import { freeSides, type GovernorSpot } from './governor';
import type { LiftMaterials } from './materials';

export interface CableModel {
  group: THREE.Group;
  /** car floor [m] */
  set(s: number): void;
}

// the flat cable's width and thickness [mm]; its loop's lowest point over the pit floor with the car at the bottom
const WIDE = 50, THICK = 6, CLEAR = 350;

export function buildCable(L: Layout, S: Section, M: LiftMaterials, gov: GovernorSpot | null): CableModel | null {
  const side = freeSides(L)[0], c = L.car, V = L.inputs.vertical, W = L.inputs.W;
  if (!side) return null;
  const gap = side === 'left' ? c.x : W - (c.x + c.w), y = c.y + c.h - 130;
  if (gap < 90 || y > L.inputs.D - 60 || (gov?.side === side && y > gov.y1 - 120 && y < gov.y2 + 260)) return null;
  // the wall leg and the car leg [mm], the loop between them
  const xw = side === 'left' ? 30 : W - 30, xc = side === 'left' ? c.x + 70 : c.x + c.w - 70, r = Math.abs(xc - xw) / 2;
  const below = V.platform + 40, levels = S.levels, zw = (levels[0] + levels[levels.length - 1]) / 2 + 1000;
  const zcMin = levels[0] - below, zlMin = S.pitFloor + CLEAR + r, length = zcMin + zw - 2 * zlMin + Math.PI * r;
  const group = new THREE.Group();
  const unit = new THREE.BoxGeometry(THICK / 1000, 1, WIDE / 1000).translate(0, 0.5, 0);
  const leg = (x: number): THREE.Mesh => {
    const m = new THREE.Mesh(unit, M.rubber);
    m.position.copy(P(x, y, 0));
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const wallLeg = leg(xw), carLeg = leg(xc);
  // the loop: half a ring in the plane across the wall, flattened to the cable's section
  const pts = Array.from({ length: 17 }, (_, i) => {
    const a = (i / 16) * Math.PI;
    return new THREE.Vector3((Math.cos(a) * r) / 1000, (-Math.sin(a) * r) / 1000, 0);
  });
  const loop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, THICK / 2000, 6).scale(1, 1, WIDE / THICK), M.rubber);
  loop.castShadow = true;
  group.add(loop);
  // fixed along the wall from its clamp to the top of the shaft
  const fixed = new THREE.Mesh(new THREE.BoxGeometry(THICK / 1000, (S.ceiling - zw) / 1000, WIDE / 1000), M.rubber);
  fixed.position.copy(P(side === 'left' ? 10 : W - 10, y, (zw + S.ceiling) / 2));
  group.add(fixed);
  return {
    group,
    set(s) {
      const zc = s * 1000 - below, zl = (zc + zw + Math.PI * r - length) / 2;
      wallLeg.position.y = zl / 1000;
      wallLeg.scale.y = Math.max(zw - zl, 1) / 1000;
      carLeg.position.y = zl / 1000;
      carLeg.scale.y = Math.max(zc - zl, 1) / 1000;
      loop.position.copy(P((xw + xc) / 2, y, zl));
    },
  };
}
