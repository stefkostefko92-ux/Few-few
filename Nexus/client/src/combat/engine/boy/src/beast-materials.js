// 4b (Nexus порт, НЕ част от оригиналния boy) — TSL материали за процедурните зверове: козина
// с петниста вариация (споделения noise texture на tsl.js, не текстура на плочка), тъмна муцуна/
// лапи, рог/бивна и мокро око. Физически прости нарочно (Standard, не Physical clearcoat стека
// на materials.js — козината няма лак), но НЕ обикновен THREE материал — законът иска TSL.
import * as THREE from 'three/webgpu';
import { vec3, mix, positionWorld, positionLocal, dot, normalWorldGeometry, cameraPosition, normalize, sub, pow, clamp, float, attribute, smoothstep } from 'three/tsl';
import { noise } from './tsl.js';

const Standard = (p) => new THREE.MeshStandardNodeMaterial(p);

// Raw view-fresnel term (0 facing camera, 1 at grazing angles) — loadout.js reuses it for the
// wraith's dark-core/glowing-edge look (opacity AND color both driven by the same term).
export function fresnelTerm(power = 2.2) {
  const n = normalWorldGeometry;
  const v = normalize(sub(cameraPosition, positionWorld));
  return pow(clamp(float(1).sub(dot(n, v)), 0, 1), power);
}

// Rim light so a small dark-furred beast (a rat against night fog) never reads as a flat
// silhouette — cheap view-fresnel, no extra light needed. Exported — loadout.js reuses it for
// the giant reskin (same "never a black silhouette" requirement, same trick).
export function withRim(mat, rimColor, power = 2.2, amount = 0.35) {
  mat.emissiveNode = vec3(...rimColor).mul(fresnelTerm(power)).mul(amount);
  return mat;
}

/** One material set per beast species; `S` = beast-config.js species record. */
export function createBeastMaterials(S) {
  const base = new THREE.Color(S.furColor);
  const dark = new THREE.Color(S.furDark);
  const fur = Standard({ name: `fur-${S.label}`, roughness: S.furRough, metalness: S.metalness ?? 0 });
  // Two independent noise cells (R = fine speckle, G = coarse patch) so the coat reads as an
  // animal hide, not a paint swatch, at both close-up and QA-thumbnail scale.
  const speckle = noise(positionWorld.xz.mul(9.0)).r;
  const patch = noise(positionWorld.xz.mul(2.2).add(positionWorld.y)).g;
  const speckled = mix(vec3(dark.r, dark.g, dark.b), vec3(base.r, base.g, base.b), speckle.mul(0.55).add(patch.mul(0.45)).clamp(0, 1));
  // 4b кръг 3 (spec: "vertex color от позицията... корем=отдолу, гръб=отгоре") — sdf-skin.js
  // addBellyAttribute() пише 'aBelly' (0 гръб..1 корем) на всяка SDF-изваяна геометрия (квадрупед/
  // паяк/змия); липсва ли атрибутът на геометрията (твърдите зъб/бивна/око piece-ове НЕ ползват
  // fur материала), WebGPU node системата подава константна 0 — безопасно, не чупи компилацията.
  // 4b QA-fix (кръг 4): змията (serpent-geo.js) няма SDF/skinning → няма aBelly атрибут, а
  // прегледът поиска "по-светъл корем" и за нея. Универсален fallback — geometry нормала сочеща
  // надолу СЪЩО е "корем" (работи за произволна форма, SDF или твърд piece, без нов атрибут).
  const normBelly = clamp(normalWorldGeometry.y.negate(), 0, 1).mul(0.6);
  const belly = attribute('aBelly', 'float').max(normBelly);
  // 4b QA-fix (кръг 4): по-тъмен/по-слаб коремски тон + по-слаб mix — прегледът докладва "краката
  // получават цвета на корема" като БЯЛА панделка; заедно с прекалено силния fresnel ръб (0.9)
  // и плоския 0.3 под, тънък цилиндричен крак (нормалите му са ПОЧТИ навсякъде близо до grazing
  // спрямо камерата — не само на ръба) се измиваше до плосък бял силует. По-тесни числа тук.
  const bellyTint = vec3(base.r * 0.42 + 0.28, base.g * 0.38 + 0.24, base.b * 0.34 + 0.2);
  const tone = mix(speckled, bellyTint, belly.mul(0.55));
  fur.colorNode = tone;
  // Тънките крака са почти изцяло „на ръба“ спрямо камерата — силен fresnel ги избелваше.
  withRim(fur, [base.r * 0.6 + 0.15, base.g * 0.5 + 0.1, base.b * 0.5 + 0.15], 3.2, 0.22);
  // 4b QA (кръг 2): звярът стои на ръст на кучета/плъхове — под ръста на факлите/key светлината,
  // тъмна козина иначе изчезва в силует на нощния двор (влошава се допълнително за тънки крайници
  // — паяк/змия). Малък константен под (не зависи от ъгъл към камерата) държи формата четлива.
  fur.emissiveNode = fur.emissiveNode.add(tone.mul(0.16));

  const skin = Standard({ name: `skin-${S.label}`, color: dark, roughness: 0.75, metalness: 0 });
  withRim(skin, [0.25, 0.18, 0.14], 2.6, 0.3);

  const tusk = Standard({ name: `tusk-${S.label}`, color: 0xe7ddc6, roughness: 0.32, metalness: 0 });
  const eye = Standard({ name: `eye-${S.label}`, color: 0x140705, roughness: 0.12, metalness: 0 });
  eye.emissiveNode = vec3(0.55, 0.08, 0.02).mul(0.6);
  const pad = Standard({ name: `pad-${S.label}`, color: 0x1a1512, roughness: 0.9, metalness: 0 });

  let wing;
  if (S.wings) {
    // 4b QA-fix (кръг 4): "плосък червен правоъгълник" — ципата беше плътен, тониран към козината
    // цвят, непрозрачен. Сега: по-тъмна мембранна база (не козина тон), тънки СВЕТЛИ жилки (noise
    // лента по позицията в местна рамка — крилото не е скинирано, positionLocal е стабилен) и
    // истинска полупрозрачност между жилките (opacityNode, не плосък .opacity).
    wing = Standard({ name: `wing-${S.label}`, color: dark, roughness: 0.6, metalness: 0, side: THREE.DoubleSide, transparent: true });
    const membrane = new THREE.Color(dark).multiplyScalar(0.55);
    const veinCol = new THREE.Color(base.r * 0.85 + 0.15, base.g * 0.55 + 0.05, base.b * 0.45);
    const veinN = noise(positionLocal.mul(vec3(7, 11, 7))).r;
    const veinBand = smoothstep(0.4, 0.5, veinN).mul(smoothstep(0.64, 0.54, veinN));
    wing.colorNode = mix(vec3(membrane.r, membrane.g, membrane.b), vec3(veinCol.r, veinCol.g, veinCol.b), veinBand.mul(0.85));
    wing.opacityNode = clamp(float(0.4).add(veinBand.mul(0.35)), 0, 1);
    withRim(wing, [base.r * 0.7, base.g * 0.5, base.b * 0.6], 2.2, 0.4);
  }
  return { fur, skin, tusk, eye, pad, wing };
}
