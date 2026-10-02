// The room around the furniture (the „в стая“ toggle): plank floor, plastered back and side walls, skirting
// boards. Sizes in metres; the back wall stands just behind the furniture.
import * as THREE from 'three';

const ROOM_H = 2.7;

// UVs in metres (the baked textures are sized in metres), with a shift so the floor boards start anywhere
function metric(geo, w, h, du = 0, dv = 0) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + du, uv.getY(i) * h + dv);
  return geo;
}
const SKIRT_H = 0.07;
const SKIRT_T = 0.014;

export function buildRoom(v, group, { W, back }) {
  for (const c of [...group.children]) {
    c.geometry?.dispose();
    group.remove(c);
  }
  const width = Math.max(4.4, W + 2.6);
  const depth = 4.6;
  const left = -width / 2;
  // the furniture is pushed against the skirting board, the wall is behind the board
  const wallZ = back - SKIRT_T;
  const wall = v.mats.wall();
  const floor = new THREE.Mesh(
    metric(new THREE.PlaneGeometry(width, depth), width, depth, 0.3, 0.1),
    v.mats.floor(),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, wallZ + depth / 2);
  const bw = new THREE.Mesh(metric(new THREE.PlaneGeometry(width, ROOM_H), width, ROOM_H), wall);
  bw.position.set(0, ROOM_H / 2, wallZ);
  const sw = new THREE.Mesh(
    metric(new THREE.PlaneGeometry(depth, ROOM_H), depth, ROOM_H, 0.4),
    wall,
  );
  sw.rotation.y = Math.PI / 2;
  sw.position.set(left, ROOM_H / 2, wallZ + depth / 2);
  for (const m of [floor, bw, sw]) m.receiveShadow = true;
  const skirt = v.mats.skirting();
  const sb = new THREE.Mesh(new THREE.BoxGeometry(width, SKIRT_H, SKIRT_T), skirt);
  sb.position.set(0, SKIRT_H / 2, wallZ + SKIRT_T / 2);
  const ss = new THREE.Mesh(new THREE.BoxGeometry(SKIRT_T, SKIRT_H, depth), skirt);
  ss.position.set(left + SKIRT_T / 2, SKIRT_H / 2, wallZ + depth / 2);
  for (const m of [sb, ss]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(floor, bw, sw, sb, ss);
}
