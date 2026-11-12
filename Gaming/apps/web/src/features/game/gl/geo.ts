/**
 * Малък геометричен инструментариум (порт на boy/src/geo.js): трансформиране, сливане по
 * материал и UV в световни единици, за да пази зидарията една и съща плътност на текстурата
 * върху стени с различен размер.
 */
import { BufferAttribute, type BufferGeometry, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();

/** Премества/завърта/мащабира геометрията на място и я връща. */
export function xf<G extends BufferGeometry>(g: G, p: [number, number, number] = [0, 0, 0], r: [number, number, number] = [0, 0, 0], s: [number, number, number] = [1, 1, 1]): G {
  _e.set(r[0], r[1], r[2]);
  _q.setFromEuler(_e);
  _m.compose(new Vector3(...p), _q, new Vector3(...s));
  g.applyMatrix4(_m);
  return g;
}

/** Слива произволна смес от индексирани/неиндексирани геометрии с position, normal и uv. */
export function merge(list: BufferGeometry[]): BufferGeometry {
  const prepared = list.map((g) => {
    const q = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(q.attributes)) {
      if (name !== "position" && name !== "normal" && name !== "uv") q.deleteAttribute(name);
    }
    if (!q.attributes.uv) q.setAttribute("uv", new BufferAttribute(new Float32Array(q.attributes.position!.count * 2), 2));
    if (!q.attributes.normal) q.computeVertexNormals();
    q.morphAttributes = {};
    return q;
  });
  const out = mergeGeometries(prepared, false);
  if (!out) throw new Error("Geometry merge failed");
  for (const g of list) g.dispose();
  return out;
}

/** Планарни UV в световни единици по доминантната нормала; `ou/ov` отместват шарката. */
export function worldUV<G extends BufferGeometry>(g: G, tile: number, ou = 0, ov = 0): G {
  const pos = g.attributes.position!;
  const nor = g.attributes.normal!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ny >= nx && ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / tile + ou;
    uv[i * 2 + 1] = v / tile + ov;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  return g;
}

/** Цилиндрични UV за кули: редовете камък остават хоризонтални. */
export function cylUV<G extends BufferGeometry>(g: G, radius: number, tile: number, ou = 0, ov = 0): G {
  const pos = g.attributes.position!;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getX(i), pos.getZ(i));
    uv[i * 2] = ((a + Math.PI) * radius) / tile + ou;
    uv[i * 2 + 1] = pos.getY(i) / tile + ov;
  }
  g.setAttribute("uv", new BufferAttribute(uv, 2));
  return g;
}
