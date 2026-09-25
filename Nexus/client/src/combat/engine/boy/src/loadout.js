// 4a.4 (Nexus порт, НЕ част от оригиналния boy) — клас-специфични тонове за оръжие/броня.
// Съзнателно САМО материал/цвят, не нова геометрия: choreo-gen.js AIM.A/AIM.B контактната
// математика е тунингована точно за слот A = дълъг меч БЕЗ щит / слот B = меч+щит (виж
// choreo-gen.js:8-11) — смяна на формата/дължината на оръжието би развалила reach/contact
// теста без нова регресия за всеки клас. Пълно класово огледаляне (напр. rogue без щит на
// слот B) е отложено за 4a.6 (buildItem() адаптер), когато reach ще се извлича от самия
// генериран предмет, не от фиксираните boy примитиви.
//
// Прилага се чрез tintedMaterials(): взима СЪЩИЯ M пакет от materials.js и връща плитко копие
// с клонирани (не мутирани — другият боец/сцената пазят оригинала) steelA/steelB/goldB/brass/
// blade/bladeDark материали. undefined тон = без клониране = базовият вид на оригиналното
// демо (нулев риск за класове/теми, които не са изрично оцветени).
import * as THREE from 'three/webgpu';

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
