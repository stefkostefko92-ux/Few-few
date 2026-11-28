// Частите на 3D сцената със семената (seeds3d.ts): стаята за отраженията, формата на семето като
// мрежа, власинките плесен и зрънцето за вариациите. Без състояние — рендерерът ги сглобява.
import {
  BackSide,
  BoxGeometry,
  Color,
  type ConeGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import { smoothstep } from './noise.js';
import { seedPoint, type ShapeParams } from './seed-shape.js';
import { masksAt } from './seed-textures.js';

export interface MoldSpec {
  type: string;
  decay: number;
  dead: boolean;
}

// Какво се отразява в лъскавото семе: тъмна стая със софтбокс отгоре и светла лента вляво.
export function studio(): Scene {
  const env = new Scene();
  env.add(
    new Mesh(
      new BoxGeometry(12, 12, 12),
      new MeshBasicMaterial({ color: 0x0b0d0c, side: BackSide }),
    ),
  );
  const panel = (
    w: number,
    h: number,
    color: number,
    power: number,
    at: [number, number, number],
  ) => {
    const m = new Mesh(
      new PlaneGeometry(w, h),
      new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), side: BackSide }),
    );
    m.position.set(...at);
    m.lookAt(0, 0, 0);
    m.rotateY(Math.PI);
    env.add(m);
  };
  panel(5, 3, 0xfff3e2, 5, [-1.5, 5.6, 1.5]);
  panel(1.2, 7, 0xffffff, 2.5, [-5.6, 1, 1.5]);
  panel(1, 6, 0xdde9ff, 1.4, [5.6, 1, -1]);
  return env;
}

// Нормалите по шева на сферата се смятат отделно от двете страни — след деформацията шевът би се
// видял като линия. Осредняваме нормалите на върхове на едно и също място.
function weldNormals(g: SphereGeometry): void {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  if (!pos || !nor) return;
  const acc = new Map<string, [number, number, number, number[]]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    const a = acc.get(key) ?? [0, 0, 0, []];
    a[0] += nor.getX(i);
    a[1] += nor.getY(i);
    a[2] += nor.getZ(i);
    a[3].push(i);
    acc.set(key, a);
  }
  for (const [x, y, z, ids] of acc.values()) {
    if (ids.length < 2) continue;
    const l = Math.hypot(x, y, z) || 1;
    for (const i of ids) nor.setXYZ(i, x / l, y / l, z / l);
  }
}

export function seedGeometry(p: ShapeParams): SphereGeometry {
  const g = new SphereGeometry(1, 80, 56);
  g.rotateZ(-Math.PI / 2); // полюсите — по дългата ос x
  const pos = g.attributes.position;
  if (pos) {
    for (let i = 0; i < pos.count; i++) {
      const [x, y, z] = seedPoint(pos.getX(i), pos.getY(i), pos.getZ(i), p);
      pos.setXYZ(i, x, y, z);
    }
  }
  g.computeVertexNormals();
  weldNormals(g);
  return g;
}

export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Власинки плесен там, където текстурата има плесен — същата маска, значи петната съвпадат.
export function moldFuzz(
  geo: SphereGeometry,
  spec: MoldSpec,
  rnd: () => number,
  cone: ConeGeometry,
  material: MeshStandardMaterial,
): InstancedMesh | null {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !nor || !uv) return null;
  const density = spec.dead ? 0.35 : 0.9 * smoothstep(0.6, 1, spec.decay);
  if (density <= 0) return null;
  const spots: Array<[number, number, number, number, number, number, number]> = [];
  for (let i = 0; i < pos.count; i++) {
    const m = masksAt(spec.type, uv.getX(i), uv.getY(i), spec.decay, spec.dead).mold;
    if (m < 0.35 || rnd() > density * m) continue;
    spots.push([pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), m]);
    if (spots.length >= 1400) break;
  }
  if (spots.length === 0) return null;
  const mesh = new InstancedMesh(cone, material, spots.length);
  const mat = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const up = new Vector3(0, 1, 0);
  const dir = new Vector3();
  spots.forEach(([x, y, z, nx, ny, nz, m], i) => {
    // по нормалата, леко разрошена; височина 0,02–0,07, дебелина ~0,004
    dir
      .set(nx + (rnd() - 0.5) * 0.9, ny + (rnd() - 0.5) * 0.9, nz + (rnd() - 0.5) * 0.9)
      .normalize();
    q.setFromUnitVectors(up, dir);
    const len = (0.03 + rnd() * 0.06) * (0.5 + m * 0.7);
    const thick = 0.0045 + rnd() * 0.0035;
    p.set(x, y, z);
    s.set(thick, len, thick);
    mesh.setMatrixAt(i, mat.compose(p, q, s));
  });
  return mesh;
}
