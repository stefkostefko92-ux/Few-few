// The room around the furniture (the „в стая“ toggle): plank floor, plastered back and side walls, skirting
// boards. Sizes in metres; the back wall stands just behind the furniture, and so do the side walls of a Г or П kitchen
// (left, right: the scene x of the furniture's side against them).
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

export function clearRoom(group) {
  for (const c of [...group.children]) {
    c.geometry?.dispose();
    group.remove(c);
  }
}

export function buildRoom(v, group, { W, D = 0, back, left: atLeft, right: atRight }) {
  clearRoom(group);
  const free = Math.max(4.4, W + 2.6);
  // the furniture is pushed against the skirting boards, the walls are behind them
  const left = atLeft === undefined ? -free / 2 : atLeft - SKIRT_T;
  const right =
    atRight === undefined
      ? atLeft === undefined
        ? free / 2
        : Math.max(left + 4.4, W / 2 + 1.3)
      : atRight + SKIRT_T;
  const width = right - left;
  const cx = (left + right) / 2;
  const depth = Math.max(4.6, D + 1.6);
  const wallZ = back - SKIRT_T;
  const wall = v.mats.wall();
  const floor = new THREE.Mesh(
    metric(new THREE.PlaneGeometry(width, depth), width, depth, 0.3, 0.1),
    v.mats.floor(),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, wallZ + depth / 2);
  const bw = new THREE.Mesh(metric(new THREE.PlaneGeometry(width, ROOM_H), width, ROOM_H), wall);
  bw.position.set(cx, ROOM_H / 2, wallZ);
  const sw = new THREE.Mesh(
    metric(new THREE.PlaneGeometry(depth, ROOM_H), depth, ROOM_H, 0.4),
    wall,
  );
  sw.rotation.y = Math.PI / 2;
  sw.position.set(left, ROOM_H / 2, wallZ + depth / 2);
  const skirt = v.mats.skirting();
  const sb = new THREE.Mesh(new THREE.BoxGeometry(width, SKIRT_H, SKIRT_T), skirt);
  sb.position.set(cx, SKIRT_H / 2, wallZ + SKIRT_T / 2);
  const ss = new THREE.Mesh(new THREE.BoxGeometry(SKIRT_T, SKIRT_H, depth), skirt);
  ss.position.set(left + SKIRT_T / 2, SKIRT_H / 2, wallZ + depth / 2);
  const planes = [floor, bw, sw];
  const skirts = [sb, ss];
  if (atRight !== undefined) {
    const rw = new THREE.Mesh(
      metric(new THREE.PlaneGeometry(depth, ROOM_H), depth, ROOM_H, 0.4),
      wall,
    );
    rw.rotation.y = -Math.PI / 2;
    rw.position.set(right, ROOM_H / 2, wallZ + depth / 2);
    const rs = new THREE.Mesh(new THREE.BoxGeometry(SKIRT_T, SKIRT_H, depth), skirt);
    rs.position.set(right - SKIRT_T / 2, SKIRT_H / 2, wallZ + depth / 2);
    planes.push(rw);
    skirts.push(rs);
  }
  for (const m of planes) m.receiveShadow = true;
  for (const m of skirts) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(...planes, ...skirts);
}
