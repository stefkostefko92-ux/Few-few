// 4b (Nexus порт, НЕ част от оригиналния boy) — данни за истинските процедурни зверове.
// Всеки запис е достатъчен, за да построи geo (beast-geo.js), риг (beast-rig.js) и AIM/guard
// пози за близкия бой (choreo-gen-attack.js) БЕЗ нови по вид клонове — само параметри.
// biteY/reach = височина/дълбочина на муцуната в собствената рамка на звяра (сравнимо с
// AIM.B.hand в choreo-gen-attack.js за рицарите); ground=0 е стъпалото.
// torsoProfile: [[u, radiusMul], ...] u=0 опашна основа .. u=1 основа на главата — радиусът на
// органичното лято тяло (beast-torso.js) на всяка спирка, умножен по bodyR. Дава отличителния
// силует (гърбица/дълбок гръден кош/тясна талия), вместо еднакъв цилиндър по цялата дължина.
export const BEAST_SPECIES = {
  rat: {
    label: 'rat', scale: 1, bodyLen: 0.34, bodyR: 0.085, legLen: 0.11, legR: 0.028,
    neckLen: 0.09, headR: 0.065, snoutLen: 0.09, snoutR: 0.026, earR: 0.058, tailLen: 0.5, tailR: 0.01,
    furColor: 0x7a6552, furDark: 0x342820, furRough: 0.82, tusks: false, baldTail: true,
    biteY: 0.16, reach: 0.26, standHeight: 0.24, gaitHz: 3.4, hipY: 0.115,
    torsoProfile: [[0, 0.1], [0.1, 0.75], [0.3, 1.0], [0.5, 0.92], [0.7, 0.8], [0.88, 0.5], [1, 0.32]],
    crossX: 1, crossY: 0.86,
  },
  boar: {
    label: 'boar', scale: 1, bodyLen: 0.58, bodyR: 0.2, legLen: 0.24, legR: 0.058,
    neckLen: 0.12, headR: 0.13, snoutLen: 0.15, snoutR: 0.062, earR: 0.06, tailLen: 0.12, tailR: 0.018,
    furColor: 0x54402e, furDark: 0x261c12, furRough: 0.88, tusks: true, baldTail: false,
    biteY: 0.34, reach: 0.36, standHeight: 0.52, gaitHz: 2.4, hipY: 0.25,
    torsoProfile: [[0, 0.14], [0.14, 1.05], [0.32, 1.0], [0.5, 0.88], [0.68, 1.22], [0.84, 0.7], [1, 0.4]],
    crossX: 1.04, crossY: 1,
  },
  wolf: {
    label: 'wolf', scale: 1, bodyLen: 0.66, bodyR: 0.155, legLen: 0.38, legR: 0.052,
    neckLen: 0.17, headR: 0.115, snoutLen: 0.17, snoutR: 0.05, earR: 0.068, tailLen: 0.42, tailR: 0.048,
    furColor: 0x6e7176, furDark: 0x26282c, furRough: 0.86, tusks: false, baldTail: false,
    biteY: 0.5, reach: 0.46, standHeight: 0.74, gaitHz: 2.7, hipY: 0.4,
    torsoProfile: [[0, 0.12], [0.14, 0.9], [0.4, 0.68], [0.58, 0.55], [0.76, 1.0], [0.9, 0.62], [1, 0.34]],
    crossX: 0.92, crossY: 1.08,
  },
  // Дракон: четириног + дълъг врат + крила (beast-rig.js wings()/beast-geo.js wingGeo) + опашка.
  // Люспеста кожа (metalness леко >0 — сатенен блясък, не мат козина, виж beast-materials.js).
  drake: {
    label: 'drake', scale: 1, bodyLen: 0.92, bodyR: 0.24, legLen: 0.42, legR: 0.07,
    neckLen: 0.42, headR: 0.15, snoutLen: 0.22, snoutR: 0.07, earR: 0.05, tailLen: 0.95, tailR: 0.05,
    furColor: 0x8a2a1e, furDark: 0x2c0e0a, furRough: 0.5, metalness: 0.22, tusks: false, baldTail: false,
    biteY: 1.05, reach: 0.78, standHeight: 1.35, gaitHz: 1.8, hipY: 0.62,
    torsoProfile: [[0, 0.22], [0.15, 0.9], [0.4, 0.86], [0.6, 0.72], [0.82, 1.0], [0.94, 0.6], [1, 0.4]],
    crossX: 1, crossY: 1.05,
    wings: true, wingSpan: 0.92,
  },
  // Змия: сегментирана верига (serpent-rig.js), без крака — S-вълна при ход, изправя предната
  // половина + удар при атака. segCount/segLen/segProfile (радиус по сегмент, 0=опашка..1=глава).
  serpent: {
    label: 'serpent', bodyType: 'serpent', segCount: 12, segLen: 0.11, segR: 0.075,
    headR: 0.09, snoutLen: 0.1, snoutR: 0.04,
    segProfile: [0.35, 0.6, 0.85, 1.0, 1.0, 0.95, 0.85, 0.7, 0.55, 0.42, 0.32, 0.24],
    furColor: 0x3a5a3a, furDark: 0x142014, furRough: 0.4, metalness: 0.15,
    waveAmp: 0.22, waveK: 0.85, waveSpeed: 3.2, rearPivot: 0.42, rearLift: 0.65,
    biteY: 0.55, reach: 0.5, standHeight: 0.95, hipY: 0,
  },
  // Паяк: 2 сегмента тяло (spider-rig.js) + 8 стави крака (същия 2-bone IK като квадрупед, x4 чифта).
  spider: {
    label: 'spider', bodyType: 'spider', cephaloR: 0.16, abdomenR: 0.24, waistLen: 0.14,
    // 4b QA (кръг 2): legR вдигнат от 0.03 — тънките нишки-крака бяха практически невидими на
    // тъмния паваж (докладвано при преглед); по-светла козина за същата причина, не тематично.
    legLen: 0.42, legR: 0.062, headR: 0.1, fangLen: 0.06,
    furColor: 0x453a30, furDark: 0x1e1712, furRough: 0.68, eyeCount: 4,
    biteY: 0.4, reach: 0.32, standHeight: 0.5, hipY: 0.4, gaitHz: 2.2,
  },
};
export const isBeastKit = (kit) => Object.prototype.hasOwnProperty.call(BEAST_SPECIES, kit);
// Видове, чийто риг още не минава визуалния преглед (паякът — краката се скупчват отпред; змията —
// тънка и почти невидима): в играта остават рицари, докато не се поправят. Кодът и тестовете им
// остават — махни вида оттук, щом мине прегледа.
export const PENDING_BEASTS = new Set(['spider', 'serpent']);
export const isActiveBeast = (sprite) => isBeastKit(sprite) && !PENDING_BEASTS.has(sprite);
export const beastSpecies = (kit) => BEAST_SPECIES[kit];
export const beastBodyType = (kit) => BEAST_SPECIES[kit]?.bodyType || 'quad';

// 4b кръг 3: choreo-gen ROOT_KEYS сепарациите (root-to-root дистанция) са тунинговани за
// рицар-срещу-рицар (меч ~0.9м от корена) — за дълготел звяр (дракон: bodyLen+neck+глава) муцуната
// стига по-далеч от корена и минаваше В героя при апекса на удара (докладвано при преглед). Тук
// смятаме реалния "корен→муцуна" обхват (същата формула като BeastRig spine/neck/head offset-ите)
// и връщаме излишъка над рицарския бюджет — 0 за компактни видове (не регресира вече одобрените).
export function beastReachPad(kit) {
  const S = BEAST_SPECIES[kit];
  if (!S || S.bodyType === 'serpent' || S.bodyType === 'spider') return 0;
  const bodyReach = (S.bodyLen || 0) * 0.62 + (S.neckLen || 0) + (S.headR || 0) + (S.snoutLen || 0);
  return Math.max(0, bodyReach - 0.9);
}

// Едри хуманоиди: пренасят рицарския риг/геометрия, само мащаб + материал + без щит.
export const GIANT_SPRITES = { golem: 1.55, titan: 1.9, troll: 1.72 };
export const isGiantSprite = (sprite) => Object.prototype.hasOwnProperty.call(GIANT_SPRITES, sprite);
export const giantScale = (sprite) => GIANT_SPRITES[sprite] || 1;

export const WRAITH_HOVER = 0.34;
export const isWraithSprite = (sprite) => sprite === 'wraith';

/** 'beast' | 'giant' | 'wraith' | 'knight' — какъв риг строи world.js за слот B. */
export function bodyKind(sprite) {
  if (isActiveBeast(sprite)) return 'beast';
  if (isGiantSprite(sprite)) return 'giant';
  if (isWraithSprite(sprite)) return 'wraith';
  return 'knight';
}
