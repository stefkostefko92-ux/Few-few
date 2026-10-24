// Рицарски манекен — облича СЪЩИЯ рицар от боя (armor.js buildKnight + rig.js Rig, статична
// „мирно" поза, не бойна анимация/timeline) в темата на един предмет (armor/boots/cloak — тези
// сами по себе си четяха се като „делва"/двусмислено, виж support.ts) или в цял сет (за
// SetViewer3D витрината — „целият рицар, облечен в сета" е най-силното нещо, което showcase-ваме).
// Останалите части остават в НЕУТРАЛНА (нетонирана) boy броня — четливо „рицар носи X", не
// изолирана геометрия във вакуум.
import * as THREE from 'three/webgpu';
import { buildKnight } from '../boy/src/armor.js';
import { Rig } from '../boy/src/rig.js';
import { Cape } from '../boy/src/cloth.js';
import { SHIELD_WRIST } from '../boy/src/weapons.js';
import { getBoyMaterials, tintForItem, type BoyMaterials } from './boy-materials';
import { pickTint } from './tint';
import { buildWeapon } from './slots/weapons';
import { buildShield } from './slots/shield';
import { previewMode } from './support';
import { rngFor, type Rand } from './rng';
import type { CatalogEntry } from './theme';

export interface BuiltMannequin {
  object: THREE.Object3D;
  dispose(): void;
}

type Disposable = { dispose(): void };
type Knight = ReturnType<typeof buildKnight>;

/** Кой ANATOMICAL piece(s) на buildKnight()/pieces носи темата на всяка каталожна категория. */
const FOCUS_PARTS: Record<string, string[]> = {
  helm: ['head'],
  armor: ['chest', 'upperArmR', 'upperArmL'],
  gloves: ['handR', 'handL'],
  boots: ['shinL', 'shinR', 'footL', 'footR'],
};

/** Статична „мирно" поза — НЕ идва от choreo/timeline (тази система е за живия двубой с двама
 *  бойци); ръчно зададени ъгли/цели за прав рицар с ръце отпуснати отстрани и стъпала на земята,
 *  достатъчно за витринен манекен, не за бой. Числата са в метри, спрямо rig.js DIM константите
 *  (upper=0.29, fore=0.27, thigh=0.45, shin=0.43) — реч ~0.82м за краката оставя лек, естествен
 *  сгъвок в коляното (пълно изпъване е IK сингулярност). */
function idlePose(): Record<string, unknown> {
  return {
    root: new THREE.Vector3(0, 0, 0),
    shift: new THREE.Vector3(),
    yaw: 0, pelvisYaw: 0, pelvisPitch: 0, pelvisRoll: 0,
    hipY: 0.95,
    twist: 0, lean: 0, side: 0, breath: 0,
    headTarget: new THREE.Vector3(0, 1.6, 3),
    headYaw: 0, headPitch: 0, headRoll: 0,
    kneel: 0, elbowOut: 0.1,
    handR: { grip: new THREE.Vector3(-0.22, 0.92, 0.02), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, -1, 0) },
    handL: { grip: new THREE.Vector3(0.22, 0.92, 0.02), x: new THREE.Vector3(-1, 0, 0), y: new THREE.Vector3(0, -1, 0) },
    feet: [
      { pos: new THREE.Vector3(0.14, 0.07, 0), yaw: 0, pitch: 0 }, // index 0 = ляв
      { pos: new THREE.Vector3(-0.14, 0.07, 0), yaw: 0, pitch: 0 }, // index 1 = десен
    ],
  };
}

interface Assembled {
  group: THREE.Group;
  owned: Disposable[];
  rig: InstanceType<typeof Rig>;
  neutralKnight: Knight;
}

/** Сглобява манекена: ЕДИН неутрален рицар (геометрия+поза) + по един тониран „двойник" рицар
 *  на всяка категория в `themed` — само неговите FOCUS_PARTS mesh-ове се вземат от тонирания,
 *  останалото пада от неутралния. Двата (или повече) рицара споделят СЪЩИЯ style('A'|'B'), затова
 *  геометрията им съвпада бит-по-бит — сглобката е безшевна. */
async function assembleKnight(themed: Record<string, CatalogEntry>, style: 'A' | 'B', focusOnly: boolean, frameExtra: string[] = []): Promise<Assembled> {
  const base = await getBoyMaterials();
  const neutralKnight = buildKnight(base, style) as Knight;
  const rig = new Rig(neutralKnight);
  rig.update(idlePose());

  const owned: Disposable[] = [];
  const themedKnights: Record<string, Knight> = {};
  for (const cat of Object.keys(themed)) {
    const tinted = tintForItem(base, pickTint(themed[cat].theme));
    owned.push({ dispose: () => tinted.dispose() });
    themedKnights[cat] = buildKnight(tinted.M, style) as Knight;
  }

  const partOwner: Record<string, string> = {};
  for (const cat of Object.keys(themed)) for (const p of FOCUS_PARTS[cat] || []) partOwner[p] = cat;

  const group = new THREE.Group();
  for (const name of Object.keys(neutralKnight.pieces)) {
    const owner = partOwner[name];
    if (owner) {
      // Неутралният близнак на тази част не се показва — освободи го веднага.
      for (const [geo] of (neutralKnight.pieces as unknown as Record<string, [THREE.BufferGeometry, THREE.Material][]>)[name]) geo.dispose();
    }
    let src = owner
      ? (themedKnights[owner].pieces as unknown as Record<string, [THREE.BufferGeometry, THREE.Material][]>)[name]
      : (neutralKnight.pieces as unknown as Record<string, [THREE.BufferGeometry, THREE.Material][]>)[name];
    // Хундскул бацинетът (стил 'B') носи авентайл (мрежеста плоча, helmets.js) — драпира естествено
    // върху раменете САМО когато шлемът реално е фокусът; иначе виси като плоска сива „яка" без
    // шлем над нея (обратна връзка от прегледа). Маха се, точно както за самостоятелната икона
    // (slots/helm.ts).
    if (name === 'head' && owner !== 'helm') {
      src = src.filter(([, mat]) => (mat as THREE.Material).name !== 'mail');
    }
    for (const [geo, mat] of src) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrix.copy((neutralKnight.parts as unknown as Record<string, { matrix: THREE.Matrix4 }>)[name].matrix);
      mesh.matrixAutoUpdate = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (owner) mesh.userData.pieceCategory = owner;
      if (focusOnly && !owner && !frameExtra.includes(name)) mesh.userData.excludeFromFraming = true;
      group.add(mesh);
    }
  }
  // Всеки тониран „двойник" построи ЦЯЛ рицар, но само FOCUS_PARTS от него влиза в сглобката —
  // останалите му части са отпадък, освободи ги веднага, инак изтичат.
  for (const cat of Object.keys(themedKnights)) {
    const used = new Set(FOCUS_PARTS[cat] || []);
    const tk = themedKnights[cat];
    for (const name of Object.keys(tk.pieces)) {
      if (used.has(name)) continue;
      for (const [geo] of (tk.pieces as unknown as Record<string, [THREE.BufferGeometry, THREE.Material][]>)[name]) geo.dispose();
    }
  }
  return { group, owned, rig, neutralKnight };
}

function disposeGroup(group: THREE.Object3D, owned: Disposable[]): void {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) mesh.geometry?.dispose();
  });
  for (const o of owned) o.dispose();
}

/** Наметало, увиснало от РЕАЛНИТЕ arming points на манекена (rig.capeAnchorsWorld — същите 9
 *  точки, по които boy закача наметалото на рицаря в боя), settle-нато под гравитация 1с. */
function attachCape(group: THREE.Group, rig: InstanceType<typeof Rig>, base: BoyMaterials, theme: CatalogEntry['theme'], rand: Rand, owned: Disposable[], tagCategory = 'cloak'): void {
  const capeBase = (rand() < 0.5 ? base.capeA : base.capeB) as THREE.MeshPhysicalNodeMaterial;
  const capeMat = capeBase.clone();
  capeMat.color = new THREE.Color(theme.primary);
  const cape = new Cape(capeMat, { cols: 9, rows: 15, length: 0.85, flare: 0.5 });
  const anchors = rig.capeAnchorsWorld;
  const back = new THREE.Vector3(0, 0, -1);
  cape.reset(anchors, back);
  const noWind = { x: 0, y: 0, z: 0, phase: 0 };
  for (let i = 0; i < 50; i++) cape.step(1 / 60, anchors, [], noWind, back);
  cape.mesh.castShadow = true;
  cape.mesh.receiveShadow = true;
  cape.mesh.userData.pieceCategory = tagCategory;
  group.add(cape.mesh);
  owned.push({ dispose: () => { capeMat.dispose(); cape.geo.dispose(); } });
}

/** ЕДИН предмет (armor/boots/cloak — виж support.ts previewMode) на манекен, камерата кадрирана
 *  само около тази част (останалото — неутрална броня — се вижда наоколо за контекст, но не
 *  влиза в bounding box-а на кадрирането, вижте renderScene.ts frameCamera). */
export async function buildMannequin(entry: CatalogEntry, rand: Rand): Promise<BuiltMannequin> {
  const style: 'A' | 'B' = rand() < 0.5 ? 'A' : 'B';
  const isCloak = entry.category === 'cloak';
  const themed = isCloak ? {} : { [entry.category]: entry };
  // Броня: кадрирай от темето до бедрата (не само нагръдника) — включва глава+таз в РАМКАТА, без
  // да ги тонира (остават неутрална база); иначе горе се отрязва главата.
  const frameExtra = entry.category === 'armor' ? ['head', 'pelvis'] : [];
  const { group, owned, rig } = await assembleKnight(themed, style, true, frameExtra);

  if (isCloak) {
    const base = await getBoyMaterials();
    // Тялото вече е добавено (bare база от assembleKnight) — маркирай го извън фокус ПРЕДИ да
    // добавим наметалото, за да не го пипнем случайно с него.
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.userData.excludeFromFraming = true;
    });
    attachCape(group, rig, base, entry.theme, rand, owned);
    // Наметалото виси на ГЪРБА (истинските arming points, chest.z<0) — фиксираната 3/4 камера на
    // студиото гледа ОТПРЕД, иначе тялото го закрива изцяло. Пълни 180° обаче гледат право в
    // гърба — плоско, не личи че е наметало (нито раменете, нито падането на плата). 3/4 отзад
    // (~145°) показва рамо + драпиране на плата едновременно.
    group.rotation.y = THREE.MathUtils.degToRad(145);
  }

  group.position.y = 0; // манекенът стъпва на земята — без грим-компенсацията на самостоятелните икони

  return { object: group, dispose: () => disposeGroup(group, owned) };
}

/** Целият рицар, облечен в СЕТА — всяко налично парче (helm/armor/gloves/boots/шлем...) носи
 *  темата си, оръжие/щит/наметало се закачат по истинските boy точки на захват (грип на ръката /
 *  SHIELD_WRIST на предмишницата / arming points на гърдите). Камерата вижда целия рицар (без
 *  фокус-изключване) — витрината на сет е показ на всичко наведнъж, не на една част. */
export async function buildDressedKnight(pieces: CatalogEntry[]): Promise<BuiltMannequin> {
  const styleSeed = rngFor(pieces.map((p) => p.slug).sort().join('|'));
  const style: 'A' | 'B' = styleSeed() < 0.5 ? 'A' : 'B';

  const byCategory: Partial<Record<string, CatalogEntry>> = {};
  for (const p of pieces) if (!byCategory[p.category]) byCategory[p.category] = p;

  const themed: Record<string, CatalogEntry> = {};
  for (const cat of Object.keys(FOCUS_PARTS)) {
    const e = byCategory[cat];
    if (e) themed[cat] = e;
  }
  const { group, owned, rig, neutralKnight } = await assembleKnight(themed, style, false);
  const base = await getBoyMaterials();

  const weaponEntry = byCategory.weapon;
  if (weaponEntry && previewMode(weaponEntry) === 'standalone') {
    const icon = weaponEntry.icon || weaponEntry.sub_type || 'sword';
    const tinted = tintForItem(base, pickTint(weaponEntry.theme));
    owned.push({ dispose: () => tinted.dispose() });
    const weaponObj = buildWeapon(tinted.M, icon, rngFor(weaponEntry.slug));
    if (weaponObj) {
      const wrap = new THREE.Group();
      wrap.matrix.copy((neutralKnight.parts as unknown as Record<string, { matrix: THREE.Matrix4 }>).handR.matrix);
      wrap.matrixAutoUpdate = false;
      wrap.userData.pieceCategory = 'weapon';
      wrap.add(weaponObj);
      group.add(wrap);
    }
  }

  const shieldEntry = byCategory.shield;
  if (shieldEntry) {
    const tinted = tintForItem(base, pickTint(shieldEntry.theme));
    owned.push({ dispose: () => tinted.dispose() });
    const built = buildShield(tinted.M, shieldEntry.theme.trim);
    owned.push(built);
    built.object.position.copy(SHIELD_WRIST as THREE.Vector3);
    const wrap = new THREE.Group();
    wrap.matrix.copy((neutralKnight.parts as unknown as Record<string, { matrix: THREE.Matrix4 }>).foreArmL.matrix);
    wrap.matrixAutoUpdate = false;
    wrap.userData.pieceCategory = 'shield';
    wrap.add(built.object);
    group.add(wrap);
  }

  const cloakEntry = byCategory.cloak;
  if (cloakEntry) {
    attachCape(group, rig, base, cloakEntry.theme, rngFor(cloakEntry.slug), owned);
  }

  return { object: group, dispose: () => disposeGroup(group, owned) };
}
