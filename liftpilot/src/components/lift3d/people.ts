// The people of the load: plain figures (legs, body, arms, head), one every 75 kg, standing in the car facing the
// main entrance, filling it from the back; each with its own clothes, skin tone, height and a slight turn.
// Loaded only through boot.ts (lazy).
// Motion: none until the user plays a run; under prefers-reduced-motion the camera jumps instead of gliding (LiftStage.tsx).
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Layout } from '@/shaft';
import { KV } from '@/shaft/norme';
import type { LiftMaterials, Side } from './materials';

export interface People {
  group: THREE.Group;
  /** load in the car [kg] */
  set(kg: number): void;
}

const CLOTHES = ['#34506e', '#6d4537', '#4b6656', '#80858d', '#2c323b', '#8f6248', '#56496a', '#9a9c84', '#3a4a57', '#6a2f39'];
const SKIN = ['#e3bf9f', '#c99c78', '#8f5d40', '#f1d2b8', '#ac7756'];
// a person's footprint in a full car [mm]
const PITCH = 400;

/** A figure 1.75 m tall facing +Z, standing on y = 0 [m]: clothes (legs, body, arms) and skin (neck, head). */
function figure(): { body: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(new THREE.CapsuleGeometry(0.062, 0.72, 4, 10).translate(s * 0.085, 0.43, 0));
    parts.push(new THREE.CapsuleGeometry(0.045, 0.5, 4, 8).translate(s * 0.215, 1.13, 0.01));
  }
  const torso = [[0, 0.8], [0.15, 0.82], [0.16, 0.95], [0.145, 1.06], [0.17, 1.26], [0.205, 1.39], [0.17, 1.47], [0.06, 1.51], [0, 1.51]];
  parts.push(new THREE.LatheGeometry(torso.map(([r, y]) => new THREE.Vector2(r, y)), 18).scale(1, 1, 0.62));
  const body = mergeGeometries(parts, false);
  const head = mergeGeometries([new THREE.CylinderGeometry(0.048, 0.052, 0.1, 10).translate(0, 1.53, 0), new THREE.SphereGeometry(0.098, 16, 12).scale(0.92, 1.12, 1).translate(0, 1.645, 0.005)], false);
  for (const p of parts) p.dispose();
  return { body, head };
}

/** A repeatable number in [0, 1) for the k-th person. */
const rand = (k: number, salt: number): number => {
  const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export function buildPeople(L: Layout, M: LiftMaterials): People {
  const ci = L.carInner, door: Side = L.doors.find((d) => d.side === 'A')?.wall ?? 'front';
  const group = new THREE.Group(), { body, head } = figure();
  // places on a grid, the back rows first and from the middle out
  const cols = Math.max(1, Math.floor(ci.w / PITCH)), rows = Math.max(1, Math.floor(ci.h / PITCH));
  const toward = { front: [0, -1], rear: [0, 1], left: [-1, 0], right: [1, 0] }[door];
  const spots: { x: number; y: number; key: number }[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = ci.x + (ci.w * (i + 0.5)) / cols, y = ci.y + (ci.h * (j + 0.5)) / rows;
      const depth = (x - (ci.x + ci.w / 2)) * toward[0] + (y - (ci.y + ci.h / 2)) * toward[1];
      spots.push({ x, y, key: depth * 10 + Math.abs(i - (cols - 1) / 2) });
    }
  }
  spots.sort((p, q) => p.key - q.key);
  const yaw = { front: 0, rear: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 }[door];
  const bodies = new THREE.InstancedMesh(body, M.person, spots.length), heads = new THREE.InstancedMesh(head, M.skin, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  spots.forEach((p, k) => {
    const h = 0.93 + rand(k, 1) * 0.13, jitter = (rand(k, 2) - 0.5) * 0.09;
    q.setFromAxisAngle(up, yaw + (rand(k, 3) - 0.5) * 0.7);
    m4.compose(new THREE.Vector3(p.x / 1000 + jitter, 0.012, -p.y / 1000 - jitter), q, new THREE.Vector3(h, h, h));
    bodies.setMatrixAt(k, m4);
    heads.setMatrixAt(k, m4);
    bodies.setColorAt(k, color.set(CLOTHES[Math.floor(rand(k, 4) * CLOTHES.length)]));
    heads.setColorAt(k, color.set(SKIN[Math.floor(rand(k, 5) * SKIN.length)]));
  });
  for (const m of [bodies, heads]) {
    // bounds over every place, before the count drops: three computes them once, from the instances counted then
    m.computeBoundingSphere();
    m.count = 0;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return {
    group,
    set(kg) {
      const n = Math.min(spots.length, Math.max(0, Math.round(kg / KV.personMass)));
      bodies.count = n;
      heads.count = n;
    },
  };
}
