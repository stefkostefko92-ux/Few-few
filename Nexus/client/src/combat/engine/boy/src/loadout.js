// 4a.4 (Nexus порт, НЕ част от оригиналния boy) — клас-специфично оръжие/броня.
// (кръг 2): weaponKit() решава ФОРМАТА на оръжието (меч/къс меч/жезъл/лък/боздуган) — далечните
// китове (жезъл/лък) НЕ минават през choreo-gen.js AIM reach системата изобщо (виж
// choreo-gen-attack.js buildRangedRound — контактът е момент на попадение на снаряд, не IK),
// затова смяна на формата за тях е безопасна. Близките китове (меч/къс меч/боздуган) продължават
// да ползват СЪЩИЯ IK/AIM reach механизъм като оригинала — само силует/дължина/тон се менят,
// не позите/контактната логика — вижте bladeBase/bladeLen в тези builders (weapons.js/
// weapons-ranged.js) остават в разумен диапазон на оригинала, проверено с fight-gen тестовете.
// Пълно "предмет-точен" reach (от buildItem() генератора) е отложено за 4a.6.
//
// tintedMaterials(): взима СЪЩИЯ M пакет от materials.js и връща плитко копие с клонирани (не
// мутирани — другият боец/сцената пазят оригинала) steelA/steelB/goldB/brass/blade/bladeDark
// материали. undefined тон = без клониране = базовият вид на оригиналното демо (нулев риск за
// класове/теми, които не са изрично оцветени).
import * as THREE from 'three/webgpu';
import { vec3, mix, positionWorld, smoothstep, sin } from 'three/tsl';
import { isActiveBeast, isGiantSprite } from './beast-config.js';
import { noise, U } from './tsl.js';
import { withRim, fresnelTerm } from './beast-materials.js';

export const CLASS_LOADOUT = {
  // warrior пази оригиналния ярко-стоманен вид на boy демото — базовата линия, нулев риск.
  warrior: null,
  ranger: { plate: 0x8a9a7c, trim: 0x5a7a3c, blade: 0x9fd9a0 },
  mage: { plate: 0x7480a0, trim: 0x4a5fa0, blade: 0x9fc4ff },
  rogue: { plate: 0x3a3a42, trim: 0x2a2a30, blade: 0xb8bcc4 },
};

// Ключувано по region (data-region в combat.css) — най-грубата тема, с която CombatScene
// вече разполага без нов сървърен модел на "вид звяр"; фина настройка по вид враг остава
// за 4a.5/4b, когато бестиарият носи собствена тема.
export const FOE_LOADOUT = {
  whispering_woods: { plate: 0x3f4a34, trim: 0x6a7c3a, blade: 0x9fae7a },
  mistmoor_hills: { plate: 0x3a4048, trim: 0x6a7484, blade: 0xaeb8c4 },
  crystal_caverns: { plate: 0x2a3a52, trim: 0x4a6fa0, blade: 0x8fd0ff },
  ashen_wastes: { plate: 0x3a1f14, trim: 0x8a4a24, blade: 0xd98f5a },
  shadowfell: { plate: 0x241436, trim: 0x5a2a8a, blade: 0xb08fd9 },
};

export function classLoadout(cls) {
  return CLASS_LOADOUT[cls] || null;
}
export function foeLoadout(region) {
  return FOE_LOADOUT[region] || null;
}

// 4a.4 (кръг 2) / 4b: weaponKit — единен източник на "какво оръжие държи този боец", четен и от
// choreo-gen.js (хореография) и от world.js (мрежа/щит), за да не могат двете да се разминат.
// name = hero.class ('warrior'|'ranger'|'mage'|'rogue') ИЛИ свободния текст на foe.name —
// sprite (4b, foe.sprite от сървъра) е ПЪРВОстепенен, когато го има: истински звяр (rat/boar/
// wolf — beast-config.js) кита СЪВПАДА със sprite-а (BeastFighter чете kit==species име директно,
// виж choreo-gen-attack.js beastAimTable) и едрите хуманоиди (golem/titan/troll) винаги 'heavy'
// (юмрук/боздуган, без щит — виж world.js isGiantSprite). Без sprite пада на разпознаване по
// свободен текст (обратна съвместимост за QA/наследени викания).
const NAME_KIT = [
  [/witch|shadow lord|sorcer|warlock|hex|coven/i, 'staff'],
  [/bandit|goblin|thief|footpad/i, 'shortsword'],
  [/orc|troll|ogre|brute|golem|titan/i, 'heavy'],
  [/archer|hunter|scout/i, 'bow'],
];
const CLASS_KIT = { warrior: 'sword', rogue: 'shortsword', mage: 'staff', ranger: 'bow' };

export function weaponKit(name, sprite) {
  if (sprite && isActiveBeast(sprite)) return sprite;
  if (sprite && isGiantSprite(sprite)) return 'heavy';
  if (!name) return 'sword';
  if (CLASS_KIT[name]) return CLASS_KIT[name];
  for (const [re, kit] of NAME_KIT) if (re.test(name)) return kit;
  return 'sword';
}
export const isRangedKit = (kit) => kit === 'staff' || kit === 'bow';
// Щитът е ЕДИНСТВЕНО за слот B (foe) — виж choreo.js бележката за оригиналната асиметрия A/B;
// 'shortsword'/'staff'/'bow' foe-ове нямат щит, точно както rogue/mage/ranger герой никога няма.
export const hasShieldKit = (kit) => kit === 'sword' || kit === 'heavy';

function tintMat(mat, hex) {
  const clone = mat.clone();
  clone.color = new THREE.Color(hex);
  return clone;
}

/** M: пакетът от createMaterials(); tint: {plate?,trim?,blade?} или null/undefined (без промяна). */
export function tintedMaterials(M, tint) {
  if (!tint) return M;
  return {
    ...M,
    steelA: tint.plate !== undefined ? tintMat(M.steelA, tint.plate) : M.steelA,
    steelB: tint.plate !== undefined ? tintMat(M.steelB, tint.plate) : M.steelB,
    goldB: tint.trim !== undefined ? tintMat(M.goldB, tint.trim) : M.goldB,
    brass: tint.trim !== undefined ? tintMat(M.brass, tint.trim) : M.brass,
    blade: tint.blade !== undefined ? tintMat(M.blade, tint.blade) : M.blade,
    bladeDark: tint.blade !== undefined ? tintMat(M.bladeDark, tint.blade) : M.bladeDark,
  };
}

// 4b кръг 3: прегледът отхвърли кръг 2 golem-а — "бежов пъстър, като кора на хляб" (широки меки
// петна от ниска noise честота четат като тесто, не камък). Поправка: ДВЕ noise честоти за самата
// КАМЪННА повърхност (не само вените) — груба (грапавина/петна между плочи) + фина (зърнеста
// текстура) — плюс по-тесен/остър праг за жилите (по-фина мрежа пукнатини, не размазани петна).
function crackyMat(base, stoneHex, veinHex, { scale = 9, glow = 1.6, pulse = 0.3, thresh = 0.56, light = 0 } = {}) {
  const m = base.clone();
  m.metalness = 0;
  m.roughness = 0.92;
  const stone = new THREE.Color(stoneHex);
  const stoneLo = new THREE.Color(stoneHex).multiplyScalar(0.62);
  m.color = stone;
  const coarse = noise(positionWorld.mul(1.6)).g; // грапавина/сянка между "плочи" камък
  const fine = noise(positionWorld.mul(scale)).r; // фина зърнеста текстура + основа за жилите
  const rockTone = mix(vec3(stoneLo.r, stoneLo.g, stoneLo.b), vec3(stone.r, stone.g, stone.b), coarse.mul(0.7).add(fine.mul(0.3)).clamp(0, 1));
  const edge = 0.012; // по-тесен процеп от кръг 2 (0.025) — мрежа от НИШКИ, не петна.
  const band = smoothstep(thresh - edge, thresh, fine).mul(smoothstep(thresh + edge * 2.5, thresh + edge, fine));
  const wave = sin(U.time.mul(1.6)).mul(0.5).add(0.5).mul(pulse).add(1 - pulse);
  const vein = new THREE.Color(veinHex);
  m.colorNode = mix(rockTone, vec3(0.015, 0.015, 0.02), band.mul(0.65)).add(light);
  m.emissiveNode = vec3(vein.r, vein.g, vein.b).mul(band).mul(glow).mul(wave);
  return m;
}

// 4b: едрите хуманоиди (golem/titan/troll — world.js isGiantSprite) пренасят рицарския риг само
// мащабиран (fighter.js applyGiantScale/applyPartScale) — материалът и пропорциите (viж
// fighter-scale.js GIANT_BUILD/TROLL_BUILD) правят разликата "звяр", не "голям рицар":
// golem = светлосив камък + светещи сини руни; titan = черен базалт + пламтящи лавови пукнатини;
// troll = мътна зеленикава кожа (noise петна, като beast-materials.js fur, не плосък тон).
// 4b кръг 3: titan/troll вдигнати по яркост (light/rim по-силни) — прегледът ги прие структурно,
// поиска само "по-светли, за да не са силуети".
export function giantMaterials(M, sprite) {
  if (sprite === 'golem') {
    const rock = crackyMat(M.stone, 0x8f8f89, 0x6ad9ff, { scale: 9, glow: 1.6, pulse: 0.3, thresh: 0.55 });
    withRim(rock, [0.3, 0.55, 0.65], 2.2, 0.28);
    return { ...M, steelA: rock, steelB: rock, goldB: rock, brass: rock, blade: M.iron, bladeDark: M.iron, mail: rock };
  }
  if (sprite === 'titan') {
    const rock = crackyMat(M.iron, 0x201c19, 0xff7a1a, { scale: 10, glow: 2.4, pulse: 0.45, thresh: 0.48, light: 0.05 });
    withRim(rock, [0.85, 0.3, 0.05], 2.0, 0.45);
    return { ...M, steelA: rock, steelB: rock, goldB: rock, brass: rock, blade: rock, bladeDark: rock, mail: rock };
  }
  const skin = M.steelA.clone();
  skin.metalness = 0;
  skin.roughness = 0.85;
  const base = new THREE.Color(0x6a7a56);
  const dark = new THREE.Color(0x384425);
  const speck = noise(positionWorld.xz.mul(3.2)).g;
  skin.colorNode = mix(vec3(dark.r, dark.g, dark.b), vec3(base.r, base.g, base.b), speck.clamp(0, 1));
  withRim(skin, [0.4, 0.5, 0.34], 2.4, 0.45);
  return { ...M, steelA: skin, steelB: skin, goldB: skin, brass: skin, blade: M.iron, bladeDark: M.iron, mail: skin };
}

// 4b кръг 2: призрак — тъмна сърцевина + светещ ръб (fresnelTerm) вместо плосък лилав тон;
// opacityNode пада към центъра (наистина полупрозрачен, не просто тониран непрозрачен риг).
export function ghostMaterials(M) {
  const core = new THREE.Color(0x120a1c);
  const edge = new THREE.Color(0xb0a0ff);
  const f = fresnelTerm(2.3);
  const ghost = (mat) => {
    const c = mat.clone();
    c.transparent = true;
    c.depthWrite = false;
    c.metalness = 0;
    c.colorNode = vec3(core.r, core.g, core.b);
    c.emissiveNode = vec3(edge.r, edge.g, edge.b).mul(f).mul(1.5);
    c.opacityNode = f.mul(0.7).add(0.2);
    return c;
  };
  const g = ghost(M.steelA);
  return { ...M, steelA: g, steelB: g, goldB: g, brass: g, blade: g, bladeDark: g, mail: g };
}

// 4b кръг 2: наметалото на призрака в СЪЩАТА палитра (не яркочервеното на рицар) — cloth.js
// симулацията остава непипната, само материалът/прозрачността се менят.
export function ghostCapeMaterial(capeMat) {
  const c = capeMat.clone();
  c.map = null;
  c.alphaTest = 0; // оригиналният alphaTest реже по alpha канала на текстурата — вече няма map.
  c.color = new THREE.Color(0x140c22);
  c.sheenColor = new THREE.Color(0x8a78d0);
  c.transparent = true;
  c.opacity = 0.72;
  c.depthWrite = false;
  c.emissiveNode = vec3(0.42, 0.36, 0.7).mul(fresnelTerm(1.6)).mul(0.9);
  return c;
}
