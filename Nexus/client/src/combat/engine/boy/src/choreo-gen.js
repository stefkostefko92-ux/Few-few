// 4a.2/4a.4 (Nexus порт, НЕ част от оригиналния boy) — превръща реални сървърни рундове в
// хореография със същата форма като choreo.js: {A_KEYS,B_KEYS,B_SHIELD,ROOT_KEYS,A_ADV,B_ADV,
// B_KNEEL,BREATH,B_LOOK_DOWN,TIME_SCALE,EVENTS,CAPTIONS,CHAPTERS,duration,shots}.
//
// Безопасност (близки рундове): guard → aim/parry/block → guard, само с каноничните пози от
// choreo.js (GUARD_POSES) и aim/parry/block ключове, които timeline.js РЕШАВА ГЕОМЕТРИЧНО
// (REACH клампове и т.н.) — сглобяването на произволен брой рундове в произволен ред е
// безопасно (виж fight-gen.test.js). Далечните рундове (жезъл/лък) изобщо не минават през тази
// reach система — виж choreo-gen-attack.js/ranged.js. Герой винаги е слот 'A', противник —
// слот 'B' (щит само ако кита го предвижда — виж loadout.js hasShieldKit). Печелившият получава
// опашката от оригиналния A_KEYS (disarm/kneel на другия), губещият — опашката от B_KEYS:
// двете локални рамки са симетрични по конструкция. Финалният удар остава винаги близък
// (мелодраматично "затваряне на дистанцията" дори за далечни класове — съзнателно опростяване).
import { GUARD_POSES } from './choreo.js';
import { weaponKit, hasShieldKit } from './loadout.js';
import { buildGeneratedShots } from './shot-builder.js';
import { push, buildRound, buildTimeScale, guardPoseFor, aimTableFor } from './choreo-gen-attack.js';
import { isBeastKit, beastReachPad } from './beast-config.js';

const { A_REST, B_REST, A_POINT_DOWN, SH_REST, SH_GUARD, STAFF_CHANNEL, BOW_DRAW } = GUARD_POSES;

// 4a.4 (кръг 2): финалният удар е ВИНАГИ близък (виж бележката горе) — REST позите на далечен
// кит (STAFF_REST/BOW_REST, y≈1.1) стоят твърде далеч геометрично от мелодраматичния "en garde"
// ръст, който финалната AIM ключ очаква 0.2s по-късно; Catmull-Rom (timeline.js) прескача това
// разстояние гладко, но офхенд-огледалото (fighter.js `!this.shield`) вече не достига навреме
// (измерено при 4×4 класовите тестове). CHANNEL/DRAW позата е близка по ръст до close-guard.
const preFinishPoseFor = (slot, kit) => (kit === 'staff' ? STAFF_CHANNEL : kit === 'bow' ? BOW_DRAW : guardPoseFor(slot, kit));

// Малка детерминистична PRNG (mulberry32) — seeded вариация без Math.random, за да могат
// тестовете да пресъздават точно същия рунд-микс.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idlePoseFor = (slot, kit) => (kit === 'staff' || kit === 'bow' || isBeastKit(kit) ? guardPoseFor(slot, kit) : slot === 'A' ? A_REST : B_REST);

/** rounds: [{attacker:'hero'|'foe', result:'hit'|'crit'|'block'|'dodge'|'miss'}], victory: bool
 * opts.heroClass ('warrior'|'ranger'|'mage'|'rogue'), opts.foeName (свободен текст, за
 * weaponKit() разпознаване — виж loadout.js) решават КАКВО оръжие държи всеки слот. */
export function buildChoreography(rounds, victory, opts = {}) {
  const rnd = opts.rng || mulberry32(1);
  const kitA = weaponKit(opts.heroClass);
  const kitB = weaponKit(opts.foeName, opts.foeSprite);
  // 4b кръг 3: виж beast-config.js beastReachPad — 0 за рицар/компактни зверове, реален допълнителен
  // прозор за дълготели (дракон), за да не влиза муцуната в героя при апекса на удара.
  const reachPad = beastReachPad(kitB);
  const A_KEYS = [];
  const B_KEYS = [];
  const B_SHIELD = [];
  const ROOT_KEYS = [];
  const A_ADV = [[0, 0]];
  const B_ADV = [[0, 0]];
  const EVENTS = [{ t: 0.9, type: 'lightning', power: 0.55 }];
  const CAPTIONS = [];

  push(A_KEYS, 0, { pose: idlePoseFor('A', kitA), crouch: 0, lead: 'L' });
  push(B_KEYS, 0, { pose: idlePoseFor('B', kitB), crouch: 0.02, lead: 'L' });
  push(B_SHIELD, 0, { sh: SH_REST });
  ROOT_KEYS.push([0, 0, 0.3, 7.0, 0.0]);

  const APPROACH = 3.6;
  push(A_KEYS, APPROACH, { pose: guardPoseFor('A', kitA) });
  push(B_KEYS, APPROACH, { pose: guardPoseFor('B', kitB) });
  push(B_SHIELD, APPROACH, { sh: SH_GUARD });
  ROOT_KEYS.push([APPROACH, 0.1, 0.42, 2.4 + reachPad, 0.15]);
  CAPTIONS.push({ t: APPROACH + 0.2, d: 2.2, k: 'vomTag' });

  let t = APPROACH;
  let ti = 0;
  const shotBeats = [];
  for (const round of rounds) {
    const attackerSlot = round.attacker === 'hero' ? 'A' : 'B';
    const defenderSlot = attackerSlot === 'A' ? 'B' : 'A';
    const attackerKeys = attackerSlot === 'A' ? A_KEYS : B_KEYS;
    const defenderKeys = defenderSlot === 'A' ? A_KEYS : B_KEYS;
    const attackerKit = attackerSlot === 'A' ? kitA : kitB;
    const defenderKit = defenderSlot === 'A' ? kitA : kitB;
    const returnT = buildRound({
      round, ti, t, rnd, attackerSlot, defenderSlot, attackerKeys, defenderKeys, attackerKit, defenderKit,
      B_SHIELD, EVENTS, ROOT_KEYS, A_ADV, B_ADV, shotBeats, reachPad,
    });
    // Guard-опресняване за защитника (независимо от вида рунд) — иначе сплайнът му интерполира
    // от последния му ключ право до следващия си рунд (голям прозорец, вижда се като "плъзгане").
    if (defenderKeys[defenderKeys.length - 1]?.t < returnT - 0.05) {
      push(defenderKeys, returnT, { pose: guardPoseFor(defenderSlot, defenderKit), ease: 'out', crouch: 0.08 });
    }
    t = returnT;
    ti += 1;
  }

  // Финал: печелившият получава опашката на оригиналния A_KEYS (disarm удар), губещият —
  // опашката на оригиналния B_KEYS (helm/disarm/kneel/pose_down). Винаги близък (виж бележката
  // в началото на файла) — с КАКВОТО оръжие държи в момента (мрежата е кит-специфична, IK-то не).
  const winnerSlot = victory ? 'A' : 'B';
  const loserSlot = victory ? 'B' : 'A';
  const winnerKeys = winnerSlot === 'A' ? A_KEYS : B_KEYS;
  const loserKeys = loserSlot === 'A' ? A_KEYS : B_KEYS;
  const finishT0 = t + 0.35;
  const winnerKit = winnerSlot === 'A' ? kitA : kitB;
  const finishAim = aimTableFor(winnerSlot, winnerKit).headL;
  push(winnerKeys, t + 0.15, { pose: preFinishPoseFor(winnerSlot, winnerKit), crouch: 0.1, lead: 'R' });
  push(winnerKeys, finishT0, {
    aim: { target: 'headL', hand: finishAim.hand, anchorY: finishAim.anchorY, dynamic: true }, e: [0.4, -0.7, 0.3], ease: 'in', tw: 0.35, lean: 0.16, crouch: 0.12, lead: 'R',
  });
  push(winnerKeys, finishT0 + 0.3, { pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06, lead: 'L' });
  push(winnerKeys, finishT0 + 1.85, { pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06 });

  // Загубилият: ако е слот B (оригиналният случай — Warden), опашката е буквалните B_KEYS
  // стойности на оригинала (авторски, едноръчни). Ако загуби слот A (герой — никога в оригинала),
  // едноръчните стойности карат ЛЯВАТА китка да не достига — вместо това стоим близо до A_REST.
  const loserSlump = loserSlot === 'A'
    ? [
        { t: finishT0 + 0.05, pose: { p: [0.02, 0.95, 0.28], d: [0, -0.9, 0.35], e: [0, 0.3, 1] }, lean: -0.15 },
        { t: finishT0 + 0.55, pose: { p: [0.0, 0.82, 0.32], d: [0, -1, 0.15], e: [0, 0, 1] }, lean: 0.28, crouch: 0.0 },
        { t: finishT0 + 1.85, pose: { p: [0.0, 0.82, 0.32], d: [0, -1, 0.15], e: [0, 0, 1] }, lean: 0.28, crouch: 0.0 },
      ]
    : [
        { t: finishT0 + 0.05, pose: { p: [0.2, 1.1, 0.18], d: [0.2, -0.3, 0.9], e: [0, -0.9, -0.3] }, lean: -0.2 },
        { t: finishT0 + 0.55, pose: { p: [0.2, 0.8, 0.34], d: [0.1, -0.2, 1], e: [0, -1, 0] }, lean: 0.32, crouch: 0.0 },
        { t: finishT0 + 1.85, pose: { p: [0.2, 0.8, 0.34], d: [0.1, -0.2, 1], e: [0, -1, 0] }, lean: 0.32, crouch: 0.0 },
      ];
  push(loserKeys, t + 0.15, { pose: guardPoseFor(loserSlot, loserSlot === 'A' ? kitA : kitB), crouch: 0.1 });
  for (const k of loserSlump) push(loserKeys, k.t, { pose: k.pose, lean: k.lean, crouch: k.crouch });

  EVENTS.push({ t: finishT0, type: 'helm', by: winnerSlot, against: loserSlot, power: 1.6 });
  // roundIndex извън [0, rounds.length) сигнализира "финален удар" на React слоя.
  EVENTS.push({ t: finishT0, type: 'roundmark', roundIndex: rounds.length, by: winnerSlot, against: loserSlot });
  EVENTS.push({ t: finishT0 + 0.05, type: 'disarm', against: loserSlot });
  EVENTS.push({ t: finishT0 + 1.0, type: 'kneel', power: 0.6, against: loserSlot });
  CAPTIONS.push({ t: finishT0 - 0.15, d: 1.3, k: 'final' });

  const duration = finishT0 + 1.9;
  const finishAxis = ROOT_KEYS[ROOT_KEYS.length - 1][4] + 0.1;
  // 4a.4 (кръг 2): по РЕАЛНО наличие на щит (слот И кит — A никога няма щит, дори с 'sword'
  // кита си), не само по слот — едноръчен+щит финишър иска по-малко пространство; двуръчен
  // (без щит — вкл. B сега, ако китът му е shortsword/staff/bow/heavy) иска СЪЩОТО пространство
  // като оригиналния двуръчен A (1.4, доказано хиляди генерирани битки) — fighter.js `!this.shield`
  // клона сега важи и за B, затова reach нуждите му вече съвпадат с A-случая, не с оригиналния B.
  const winnerHasShield = winnerSlot === 'B' && hasShieldKit(kitB);
  const finishSep = winnerHasShield ? 1.1 : 1.4;
  ROOT_KEYS.push([finishT0 - 0.1, 0.1, 0.42, 2.1 + reachPad, finishAxis]);
  ROOT_KEYS.push([finishT0, 0.1, 0.42, finishSep + reachPad, finishAxis]);
  ROOT_KEYS.push([duration, 0.1, 0.42, 1.65 + reachPad, finishAxis]);
  A_ADV.push([duration, A_ADV[A_ADV.length - 1][1]]);
  B_ADV.push([duration, B_ADV[B_ADV.length - 1][1]]);
  push(B_SHIELD, finishT0, { sh: SH_GUARD });
  B_SHIELD.push({ t: duration, sh: { w: [-0.3, 0.7, 0.3], n: [-0.15, -0.25, 1] } });

  const B_KNEEL = loserSlot === 'B'
    ? [[0, 0], [finishT0 + 0.9, 0], [finishT0 + 1.5, 1], [duration, 1]]
    : [[0, 0], [duration, 0]];
  const BREATH = [[0, 1], [t * 0.5, 1.8], [duration, 2.2]];
  const B_LOOK_DOWN = loserSlot === 'B'
    ? [[0, 0], [finishT0 + 0.8, 0], [finishT0 + 1.2, 1], [duration, 1]]
    : [[0, 0], [duration, 0]];
  const TIME_SCALE = buildTimeScale(shotBeats, duration);
  const CHAPTERS = [
    { t: 0, k: 'ch1' },
    { t: APPROACH + (t - APPROACH) * 0.35, k: 'ch2' },
    { t: Math.max(APPROACH, t - 1.5), k: 'ch3' },
  ];
  const shots = buildGeneratedShots(APPROACH, shotBeats, t, duration);

  return {
    A_KEYS, B_KEYS, B_SHIELD, ROOT_KEYS, A_ADV, B_ADV, B_KNEEL, BREATH, B_LOOK_DOWN, TIME_SCALE, EVENTS, CAPTIONS, CHAPTERS, duration, shots,
    // 4a.4: за world.js (мрежа/щит) — единствения път двете страни могат да се разминат е ако
    // някой ги извика отделно; roundsToChoreo.ts подава СЪЩИТЕ opts.heroClass/opts.foeName и
    // на bootDuel, но ги пазим и тук като косвена проверка/удобство за дебъг.
    kitA, kitB,
  };
}
