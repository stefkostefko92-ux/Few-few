// Фабрика на PBR материали (MeshPhysicalNodeMaterial) по план (plan.ts): стомана с драскотини и
// патина (триплана́рни карти от pbrSets.ts), кожа с пори, плат с тъкан и sheen, кост, кристал с
// трансмисия/дисперсия, емайл с лак. Светещите завършеци са 3D жили (nodes.ts veinMask) →
// emissive. Връща „M" в договора на boy builders (steelA/steelB/goldB/brass/blade/...).
import * as THREE from 'three/webgpu';
import { color, cos, dot, float, materialColor, materialRoughness, mix, normalView, positionLocal, positionViewDirection, smoothstep, uniform, vec3 } from 'three/tsl';
import type { PbrSets } from './pbrSets';
import type { Plan, Surface } from './plan';
import { triNormal, triSample, veinMask } from './nodes';

const Phys = (p: THREE.MeshPhysicalNodeMaterialParameters): THREE.MeshPhysicalNodeMaterial => new THREE.MeshPhysicalNodeMaterial(p);

function withGlow(m: THREE.MeshPhysicalNodeMaterial, plan: Plan, k: number): void {
  if (plan.glowStrength <= 0.01) return;
  m.emissiveNode = color(plan.glow.clone()).mul(veinMask(0.055)).mul(plan.glowStrength * k);
}

function metal(S: PbrSets, s: Surface, plan: Plan, glow: number): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: s.color, metalness: 1, roughness: s.rough, clearcoat: s.coat, clearcoatRoughness: s.coatRough, side: THREE.DoubleSide });
  const a = triSample(S.metal.albedo, S.metal.tile).rgb;
  const o = triSample(S.metal.orm, S.metal.tile);
  const wear = float(0.55 + plan.patina * 0.6);
  m.colorNode = materialColor.mul(mix(vec3(1), a, wear));
  m.roughnessNode = materialRoughness.mul(o.g.mul(1.5)).clamp(0.06, 1);
  m.metalnessNode = o.b;
  m.aoNode = mix(float(1), o.r, 0.8);
  m.normalNode = triNormal(S.metal.normal, S.metal.tile, 0.55);
  withGlow(m, plan, glow);
  return m;
}

function leather(S: PbrSets, s: Surface): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: s.color, metalness: 0, roughness: s.rough, clearcoat: 0.35, clearcoatRoughness: 0.32, sheen: 0.25, sheenRoughness: 0.6, sheenColor: s.color.clone().lerp(new THREE.Color(1, 1, 1), 0.4), side: THREE.DoubleSide });
  const a = triSample(S.leather.albedo, S.leather.tile).rgb;
  const o = triSample(S.leather.orm, S.leather.tile);
  m.colorNode = materialColor.mul(dot(a, vec3(0.333)).mul(5));
  m.roughnessNode = materialRoughness.mul(o.g.mul(1.0)).clamp(0.2, 1);
  m.aoNode = o.r;
  m.normalNode = triNormal(S.leather.normal, S.leather.tile, 0.45);
  return m;
}

function cloth(S: PbrSets, s: Surface, sheen: THREE.Color): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: s.color, metalness: 0, roughness: 0.9, sheen: 1, sheenRoughness: 0.4, sheenColor: sheen, side: THREE.DoubleSide });
  const a = triSample(S.fabric.albedo, S.fabric.tile).rgb;
  const o = triSample(S.fabric.orm, S.fabric.tile);
  m.colorNode = materialColor.mul(a.mul(1.25));
  m.aoNode = o.r;
  m.normalNode = triNormal(S.fabric.normal, S.fabric.tile, 0.8);
  return m;
}

function bone(S: PbrSets, s: Surface): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: s.color, metalness: 0, roughness: s.rough, clearcoat: s.coat, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color('#ffe9c8'), side: THREE.DoubleSide });
  const a = triSample(S.wood.albedo, S.wood.tile).rgb;
  m.colorNode = materialColor.mul(dot(a, vec3(0.333)).mul(3.2).clamp(0.55, 1.15));
  m.normalNode = triNormal(S.wood.normal, S.wood.tile, 0.35);
  return m;
}

function crystal(s: Surface): THREE.MeshPhysicalNodeMaterial {
  return Phys({ color: s.color, metalness: 0, roughness: s.rough, transmission: 0.92, thickness: 0.05, ior: 1.7, attenuationColor: s.color.clone().multiplyScalar(0.9), attenuationDistance: 0.12, dispersion: 0.35, specularIntensity: 1, clearcoat: 0.5, side: THREE.DoubleSide });
}

function enamel(S: PbrSets, s: Surface, plan: Plan, glow: number): THREE.MeshPhysicalNodeMaterial {
  const m = metal(S, { ...s, coat: 1, coatRough: 0.03 }, plan, glow);
  m.metalness = 0.85;
  m.iridescence = 0.25;
  return m;
}

export interface VesselMaterials { glass: THREE.Material; liquid: THREE.Material; cork: THREE.Material; wax: THREE.Material }

export function surfaceMaterial(S: PbrSets, s: Surface, plan: Plan, glow = 1): THREE.MeshPhysicalNodeMaterial {
  switch (s.kind) {
    case 'leather': return leather(S, s);
    case 'cloth': return cloth(S, s, plan.clothSheen);
    case 'bone': return bone(S, s);
    case 'crystal': { const m = crystal(s); withGlow(m, plan, glow * 0.7); return m; }
    case 'enamel': return enamel(S, s, plan, glow);
    default: return metal(S, s, plan, glow);
  }
}

export function mailMaterial(S: PbrSets, plan: Plan): THREE.MeshPhysicalNodeMaterial {
  const base: Surface = { kind: 'metal', color: plan.plate.color.clone().lerp(new THREE.Color('#8e949c'), 0.5), rough: 0.5, coat: 0, coatRough: 0.2 };
  const m = Phys({ color: base.color, metalness: 1, roughness: 0.5, side: THREE.DoubleSide });
  const a = triSample(S.mail.albedo, S.mail.tile).rgb;
  const o = triSample(S.mail.orm, S.mail.tile);
  m.colorNode = materialColor.mul(a.mul(1.2));
  m.roughnessNode = o.g.mul(1.2).clamp(0.2, 1);
  m.aoNode = o.r;
  m.normalNode = triNormal(S.mail.normal, S.mail.tile, 1.4);
  return m;
}

export function woodMaterial(S: PbrSets, plan: Plan): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: plan.woodColor, metalness: 0, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
  const a = triSample(S.wood.albedo, S.wood.tile).rgb;
  const o = triSample(S.wood.orm, S.wood.tile);
  m.colorNode = materialColor.mul(dot(a, vec3(0.333)).mul(4.2));
  m.roughnessNode = materialRoughness.mul(o.g.mul(1.5)).clamp(0.2, 1);
  m.aoNode = o.r;
  m.normalNode = triNormal(S.wood.normal, S.wood.tile, 0.8);
  return m;
}

/** Фасетен „вътрешен огън": емисията расте към ръба на всяка фасета (фреснел по плоската нормала) —
 *  всяка стена има различна яркост, камъкът чете като дълбок шлифован кристал, не плоско оцветяване. */
function facetFire(c: THREE.Color, k: number) {
  const rim = float(1).sub(normalView.dot(positionViewDirection).abs()).pow(1.8);
  const facet = normalView.dot(vec3(0.35, 0.55, 0.76).normalize()).clamp(0, 1).pow(2.2);
  // дисперсия: всяка стена получава различен спектрален нюанс (косинусова палитра), най-силен по ръба
  const hue = normalView.x.mul(0.9).add(normalView.y.mul(0.5)).add(vec3(0, 0.33, 0.67)).mul(6.283);
  const spectral = vec3(0.5).add(cos(hue).mul(0.5));
  const base = mix(color(c.clone()), spectral, rim.mul(0.45));
  return base.mul(rim.mul(0.8).add(facet.mul(0.9)).add(0.08)).mul(k);
}

/** Скъпоценен камък / ядро: плътен наситен диелектрик с високо IOR отражение + фасетен огън. */
export function gemMaterial(plan: Plan): THREE.MeshPhysicalNodeMaterial {
  const g = plan.gem;
  const m = Phys({ color: g.clone().multiplyScalar(0.3), metalness: 0, roughness: 0.03, ior: 2.2, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.35, side: THREE.DoubleSide });
  m.emissiveNode = facetFire(g, 0.55 + Math.min(1, plan.glowStrength) * 0.35);
  return m;
}

/** Лакирана боядисана повърхност (лице на щит): диелектрик с дървесна структура и дебел лак. */
export function lacquer(S: PbrSets, c: THREE.Color, plan: Plan): THREE.MeshPhysicalNodeMaterial {
  const m = Phys({ color: c, metalness: 0.15, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.12, side: THREE.DoubleSide });
  const a = triSample(S.wood.albedo, S.wood.tile).rgb;
  m.colorNode = materialColor.mul(dot(a, vec3(0.333)).mul(2.2).add(0.35).clamp(0.5, 1.2));
  m.normalNode = triNormal(S.wood.normal, S.wood.tile, 0.5);
  withGlow(m, plan, 0.4);
  return m;
}

/** Стъкло (френелов ръб: почти прозрачно в центъра, плътно по краищата), течност с вертикален
 *  градиент и вътрешен огън, корк, восък. */
export function vesselMaterials(plan: Plan): VesselMaterials {
  const fres = float(1).sub(normalView.dot(positionViewDirection).abs()).pow(2.2);
  const glass = Phys({ color: 0xe6f0f8, metalness: 0, roughness: 0.015, transparent: true, ior: 1.5, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.01, depthWrite: false, side: THREE.DoubleSide });
  glass.opacityNode = fres.mul(0.75).add(0.07);
  const dark = plan.gem.clone().multiplyScalar(0.18);
  const liquid = Phys({ color: 0xffffff, metalness: 0, roughness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.04, side: THREE.DoubleSide });
  const grad = smoothstep(float(0.0), float(0.11), positionLocal.y);
  liquid.colorNode = mix(color(plan.gem.clone().multiplyScalar(0.8)), color(dark), grad);
  liquid.emissiveNode = mix(color(plan.gem.clone().multiplyScalar(0.75)), color(plan.gem.clone().multiplyScalar(0.12)), grad).add(color(plan.gem.clone()).mul(fres.mul(0.9)));
  const cork = Phys({ color: 0x8a6a46, metalness: 0, roughness: 0.85 });
  const wax = Phys({ color: plan.gem.clone().multiplyScalar(0.5), metalness: 0, roughness: 0.35, clearcoat: 0.6 });
  return { glass, liquid, cork, wax };
}
