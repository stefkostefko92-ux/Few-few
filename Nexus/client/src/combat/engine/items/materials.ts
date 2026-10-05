// Декал-материал за мотив плочите (нитове/филигран/шипове/руни/пера/люспи/тръни/звезди/пламъци)
// върху шлем/броня — motifTexture.ts я рисува, тук само материята. Геометрията/тонирането на
// самия предмет вече идва от boy (виж boy-materials.ts + slots/*.ts) — старият „по роля"
// материален пакет (primary/secondary/trim за процедурния генератор) е премахнат оттук; boy
// няма понятие за тези роли, той тонира plate/trim/blade директно (loadout.js tintedMaterials).
import * as THREE from 'three/webgpu';
import { color, sin, time } from 'three/tsl';
import type { ItemTheme } from './theme';

export function decalMaterial(theme: ItemTheme, map: THREE.Texture): THREE.MeshPhysicalNodeMaterial {
  const m = new THREE.MeshPhysicalNodeMaterial({
    name: 'item-decal', map, transparent: true, roughness: 0.5, metalness: 0.1,
    side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  if (theme.finish === 'glowing' && theme.emissive) {
    m.emissive = new THREE.Color(theme.emissive);
    m.emissiveMap = map;
    const pulse = sin(time.mul(1.4)).mul(0.3).add(0.7).clamp(0, 1);
    m.emissiveNode = color(new THREE.Color(theme.emissive)).mul(pulse).mul(1.4);
  }
  return m;
}
