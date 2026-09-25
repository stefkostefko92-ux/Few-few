// Physically based material library on the baked texture sets: wet polished steel, blackened
// plate, mail, cloth, leather, stone and wood. Rain beads and runs on steel and stone.
import * as THREE from 'three/webgpu';
import { uv, vec2, normalMap, texture, sin, materialEmissive, positionWorld } from 'three/tsl';
import { applySet, applyGrime, rainOnSteel, wetStone } from './surface.js';
import { noise, U } from './tsl.js';

const Physical = (p) => new THREE.MeshPhysicalNodeMaterial(p);
const Standard = (p) => new THREE.MeshStandardNodeMaterial(p);

// Plate steel: baked hammered metal, grime at the feet, rain on a clear coat of water. Isotropic
// only: the meshes carry no tangents, and three's anisotropic GGX without a tangent frame turns a
// blade near the lens into a glowing bar.
function steel(S, name, color, { metalness = 1, roughness, clearcoat, clearcoatRoughness = 0.08, normal = 0.6, wear = 1, grime = true, rain = 1, uvScale = [1, 1] }) {
  const m = Physical({ name, color, metalness, roughness, clearcoat, clearcoatRoughness, side: THREE.DoubleSide });
  applySet(m, S.metal, { uvNode: uv().mul(vec2(...uvScale)), normalScale: normal, wear });
  if (grime) applyGrime(m);
  if (rain > 0) m.clearcoatNormalNode = rainOnSteel(S.drops, { scale: 0.55 * rain });
  return m;
}

// Glowing coals: slow heat waves crawl through the bed, story-time driven.
function coals() {
  const m = Standard({ name: 'coal', color: 0x120b08, roughness: 0.9, emissive: new THREE.Color(1.0, 0.28, 0.05), emissiveIntensity: 1.3 });
  const w = positionWorld;
  const heat = noise(w.xz.mul(1.9).add(vec2(U.time.mul(0.05), U.time.mul(-0.03)))).r.mul(1.6).sub(0.3).clamp(0.08, 1.2);
  const pulse = sin(U.time.mul(2.3).add(w.x.mul(7))).mul(0.12).add(0.88);
  m.emissiveNode = materialEmissive.mul(heat).mul(pulse);
  return m;
}

export function createMaterials(S, T) {
  const steelA = steel(S, 'steelA', 0xc6cad0, { roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.06, normal: 0.5, wear: 0.3 });
  const steelB = steel(S, 'steelB', 0x1f1e22, { metalness: 0.92, roughness: 0.52, clearcoat: 0.5, clearcoatRoughness: 0.1, normal: 0.8 });
  const brass = steel(S, 'brass', 0xc9a25a, { roughness: 0.3, clearcoat: 0.4, clearcoatRoughness: 0.1, normal: 0.3, wear: 0.45, grime: false, rain: 0.6 });
  const goldB = steel(S, 'goldB', 0xa77a30, { roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.1, normal: 0.3, wear: 0.6, grime: false, rain: 0.6 });
  const blade = steel(S, 'blade', 0xd9dde2, { roughness: 0.24, clearcoat: 0.15, clearcoatRoughness: 0.05, normal: 0.25, wear: 0.15, grime: false, rain: 0.5, uvScale: [1, 5] });
  const bladeDark = steel(S, 'bladeDark', 0x9da1a8, { roughness: 0.24, clearcoat: 0.15, clearcoatRoughness: 0.05, normal: 0.25, wear: 0.4, grime: false, rain: 0.5, uvScale: [1, 5] });
  const iron = steel(S, 'iron', 0x2b2724, { metalness: 0.85, roughness: 0.6, clearcoat: 0.25, normal: 1, grime: false, rain: 0.8 });

  const mail = Standard({ name: 'mail', color: 0x8e949c, metalness: 1, roughness: 1, side: THREE.DoubleSide });
  applySet(mail, S.mail, { normalScale: 1.1 });
  applyGrime(mail);

  const leather = Standard({ name: 'leather', color: 0xffffff, roughness: 1 });
  applySet(leather, S.leather, { tint: false, normalScale: 0.8 });
  applyGrime(leather);

  const gambeson = Physical({ name: 'gambeson', color: 0x4a3e2f, roughness: 1, sheen: 0.6, sheenColor: 0x7a6a50, sheenRoughness: 0.6 });
  applySet(gambeson, S.fabric, { uvNode: uv().mul(6), normalScale: 1 });

  const fabricNormal = (x, y, s) => normalMap(texture(S.fabric.normal, uv().mul(vec2(x, y))), vec2(s));
  const capeA = Physical({ name: 'capeA', map: T.capeA, roughness: 0.86, sheen: 1, sheenColor: 0x5b78c8, sheenRoughness: 0.45, side: THREE.DoubleSide });
  capeA.normalNode = fabricNormal(8, 12, 0.8);
  const capeB = Physical({ name: 'capeB', map: T.capeB, alphaTest: 0.5, roughness: 0.88, sheen: 1, sheenColor: 0xa22a34, sheenRoughness: 0.5, side: THREE.DoubleSide });
  capeB.normalNode = fabricNormal(8, 12, 0.8);
  const banner = Physical({ name: 'banner', map: T.banner, alphaTest: 0.5, roughness: 0.85, sheen: 1, sheenColor: 0xa22a34, side: THREE.DoubleSide });
  banner.normalNode = fabricNormal(10, 20, 0.6);

  const shieldFace = Physical({ name: 'shieldFace', map: T.shield.map, roughness: 0.9, roughnessMap: T.shield.roughnessMap, clearcoat: 0.55, clearcoatRoughness: 0.14, side: THREE.DoubleSide });
  shieldFace.clearcoatNormalNode = rainOnSteel(S.drops, { scale: 0.5, flow: 0.6 });

  const wood = Standard({ name: 'wood', roughness: 1, side: THREE.DoubleSide });
  applySet(wood, S.wood, { tint: false, normalScale: 1 });

  const stone = Standard({ name: 'stone', roughness: 1 });
  applySet(stone, S.wall, { tint: false, normalScale: 1.2 });
  wetStone(stone, S.drops);

  const roof = Standard({ name: 'roof', color: 0x2a2d33, roughness: 0.55, metalness: 0.1 });
  roof.normalNode = normalMap(texture(S.wall.normal, uv().mul(3)), vec2(0.8));

  const slit = new THREE.MeshBasicNodeMaterial({ name: 'slit', color: 0x010101, side: THREE.DoubleSide });
  const windowGlow = new THREE.MeshBasicNodeMaterial({ name: 'window', color: new THREE.Color(1.5, 0.66, 0.2) });
  return { steelA, steelB, brass, goldB, mail, gambeson, leather, slit, blade, bladeDark, capeA, capeB, shieldFace, wood, iron, stone, roof, banner, coal: coals(), windowGlow };
}

