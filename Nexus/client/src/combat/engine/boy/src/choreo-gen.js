// 4a.2 (Nexus порт, НЕ част от оригиналния boy) — превръща реални сървърни рундове в
// хореография със същата форма като choreo.js: {A_KEYS,B_KEYS,B_SHIELD,ROOT_KEYS,A_ADV,B_ADV,
// B_KNEEL,BREATH,B_LOOK_DOWN,TIME_SCALE,EVENTS,CAPTIONS,CHAPTERS,duration,shots}.
//
// Безопасност: всеки рунд е guard → aim/parry/block → guard, само с каноничните пози от
// choreo.js (GUARD_POSES) и aim/parry/block ключове, които timeline.js РЕШАВА ГЕОМЕТРИЧНО
// (REACH клампове и т.н.) при всяко извикване — затова сглобяването на произволен брой
// рундове в произволен ред е безопасно (виж fight-gen.test.js). Герой винаги е слот 'A'
// (дългия меч, без щит), противник — слот 'B' (меч+щит); пълното класово огледаляне идва в
// 4a.4/4a.5. Печелившият получава опашката от оригиналния A_KEYS (disarm/kneel на другия),
// губещият — опашката от B_KEYS: двете локални рамки са симетрични по конструкция.
import { GUARD_POSES } from './choreo.js';

const { A_REST, A_VOMTAG, A_OCHS, A_PFLUG, A_POINT_DOWN, B_REST, B_GUARD, B_HIGH, SH_REST, SH_GUARD } = GUARD_POSES;

const AIM = {
  A: {
    head: { hand: [0.02, 1.5, 0.62], contact: 0.7 },
    headL: { hand: [0.06, 1.45, 0.45], contact: 0.6 },
    lshoulder: { hand: [0.1, 1.45, 0.42], contact: 0.78 },
    chest: { hand: [0.05, 1.4, 0.5], contact: 0.6 },
  },
  B: {
    head: { hand: [0.05, 1.6, 0.5], contact: 0.5 },
    headL: { hand: [0.06, 1.42, 0.5], contact: 0.5 },
    lshoulder: { hand: [0.06, 1.42, 0.5], contact: 0.5 },
    chest: { hand: [0.12, 1.25, 0.62], contact: 0.45 },
  },
};
const TARGET_CYCLE = ['head', 'lshoulder', 'chest', 'headL'];
const PARRY_STYLES = ['up', 'flat', 'hang'];
const GUARD_OF = { A: A_VOMTAG, B: B_GUARD };
const BEAT = 1.7;
const CRIT_HOLD = 0.55;

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

function push(list, t, entry) {
  list.push({ t, ...entry });
}

/** rounds: [{attacker:'hero'|'foe', result:'hit'|'crit'|'block'|'dodge'|'miss'}], victory: bool */
export function buildChoreography(rounds, victory, opts = {}) {
  const rnd = opts.rng || mulberry32(1);
  const A_KEYS = [];
  const B_KEYS = [];
  const B_SHIELD = [];
  const ROOT_KEYS = [];
  const A_ADV = [[0, 0]];
  const B_ADV = [[0, 0]];
  const EVENTS = [{ t: 0.9, type: 'lightning', power: 0.55 }];
  const CAPTIONS = [];

  push(A_KEYS, 0, { pose: A_REST, crouch: 0, lead: 'L' });
  push(B_KEYS, 0, { pose: B_REST, crouch: 0.02, lead: 'L' });
  push(B_SHIELD, 0, { sh: SH_REST });
  ROOT_KEYS.push([0, 0, 0.3, 7.0, 0.0]);

  const APPROACH = 3.6;
  push(A_KEYS, APPROACH, { pose: A_VOMTAG });
  push(B_KEYS, APPROACH, { pose: B_GUARD });
  push(B_SHIELD, APPROACH, { sh: SH_GUARD });
  ROOT_KEYS.push([APPROACH, 0.1, 0.42, 2.4, 0.15]);
  CAPTIONS.push({ t: APPROACH + 0.2, d: 2.2, k: 'vomTag' });

  let t = APPROACH;
  let ti = 0;
  for (const round of rounds) {
    const attackerSlot = round.attacker === 'hero' ? 'A' : 'B';
    const defenderSlot = attackerSlot === 'A' ? 'B' : 'A';
    const attackerKeys = attackerSlot === 'A' ? A_KEYS : B_KEYS;
    const defenderKeys = defenderSlot === 'A' ? A_KEYS : B_KEYS;
    const crit = round.result === 'crit';
    const dur = crit ? BEAT + CRIT_HOLD : BEAT;
    const target = TARGET_CYCLE[ti % TARGET_CYCLE.length];
    const aimTpl = AIM[attackerSlot][target];
    const windT = t + dur * 0.28;
    const apexT = t + dur * 0.55;
    const returnT = t + dur;

    // Нападателят: guard refresh → windup → aim → guard.
    push(attackerKeys, windT, { pose: GUARD_OF[attackerSlot], ease: 'in', crouch: 0.1 });
    push(attackerKeys, apexT, {
      aim: { target, hand: aimTpl.hand, contact: aimTpl.contact },
      e: [0, 1, 0],
      ease: 'in',
      lean: crit ? 0.14 : 0.1,
      crouch: 0.1,
    });
    if (crit) push(attackerKeys, apexT + CRIT_HOLD * 0.6, { hold: true, crouch: 0.1 });

    // Защитникът: щитоносецът (B) блокира; безщитният (A) парира.
    if (round.result === 'block') {
      if (defenderSlot === 'B') {
        push(B_SHIELD, apexT, { block: { vs: attackerSlot }, ease: 'out' });
        EVENTS.push({ t: apexT, type: 'shield', by: attackerSlot, power: crit ? 1.1 : 0.85 });
      } else {
        push(defenderKeys, apexT, { parry: { vs: attackerSlot, style: PARRY_STYLES[ti % PARRY_STYLES.length] } });
        EVENTS.push({ t: apexT, type: 'clash', power: crit ? 1.3 : 0.85 });
        EVENTS.push({ t: apexT + 0.06, type: 'scrape', dur: 0.2, power: 0.5 });
      }
    } else if (round.result === 'dodge' || round.result === 'miss') {
      // Чисто отбягване/пропуск — целта се решава геометрично, но не гърми контактно
      // събитие, така че оръжието "просвирва" покрай защитника без реакция/искри.
    } else {
      // hit / crit — солиден контакт (искри + физическа реакция чрез events.js).
      EVENTS.push({ t: apexT, type: 'strike', target, by: attackerSlot, against: defenderSlot, power: crit ? 1.6 : 1.0 });
      if (crit) EVENTS.push({ t: windT + 0.02, type: 'lightning', power: 0.4 });
    }

    push(attackerKeys, returnT, { pose: GUARD_OF[attackerSlot], ease: 'out', crouch: 0.08 });
    if (defenderKeys[defenderKeys.length - 1]?.t < returnT - 0.05) {
      push(defenderKeys, returnT, { pose: GUARD_OF[defenderSlot], ease: 'out', crouch: 0.08 });
    }

    // Разстоянието МЕЖДУ реалните ROOT_KEYS точки се интерполира (smoothstep) — трябва да е
    // достатъчно тясно ТОЧНО в apexT (мига на удара), иначе resolveAim() ще остави острието
    // "недостигнало" целта (клампва по MAX_ALONG=1.0/0.84 м, виж timeline.js). ~1.6 м на
    // удара е сигурно за двата бойеца; ~2.1 м между рундовете е нормална дистанция на пазене.
    const axis = 0.15 + ti * 0.08;
    ROOT_KEYS.push([apexT - 0.12, 0.1, 0.42, 2.1, axis]);
    ROOT_KEYS.push([apexT, 0.1, 0.42, 1.35 + 0.1 * rnd(), axis]);
    ROOT_KEYS.push([returnT, 0.1, 0.42, 2.1, axis]);
    const advPulse = (attackerSlot === 'A' ? A_ADV : B_ADV);
    advPulse.push([apexT, 0.18 + 0.1 * rnd()]);
    advPulse.push([returnT, 0]);
    if (!crit) B_SHIELD.push({ t: returnT, sh: SH_GUARD });

    t = returnT;
    ti += 1;
  }

  // Финал: печелившият получава опашката на оригиналния A_KEYS (disarm удар), губещият —
  // опашката на оригиналния B_KEYS (helm/disarm/kneel/pose_down). Стойностите са в собствената
  // локална рамка на всеки боец, затова важат еднакво за който и да е слот.
  const winnerSlot = victory ? 'A' : 'B';
  const loserSlot = victory ? 'B' : 'A';
  const winnerKeys = winnerSlot === 'A' ? A_KEYS : B_KEYS;
  const loserKeys = loserSlot === 'A' ? A_KEYS : B_KEYS;
  const finishT0 = t + 0.35;
  const finishAim = winnerSlot === 'A' ? AIM.A.headL : AIM.B.headL;
  push(winnerKeys, t + 0.15, { pose: GUARD_OF[winnerSlot], crouch: 0.1, lead: 'R' });
  push(winnerKeys, finishT0, {
    aim: { target: 'headL', hand: finishAim.hand, dynamic: true }, e: [0.4, -0.7, 0.3], ease: 'in', tw: 0.35, lean: 0.16, crouch: 0.12, lead: 'R',
  });
  push(winnerKeys, finishT0 + 0.3, { pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06, lead: 'L' });
  push(winnerKeys, finishT0 + 1.85, { pose: A_POINT_DOWN, tw: 0.05, lean: 0.08, crouch: 0.06 });

  // Загубилият: ако е слот B (оригиналният случай — Warden), опашката е буквалните B_KEYS
  // стойности на оригинала (авторски, едноръчни). Ако загуби слот A (герой с двуръчен меч —
  // никога не се случва в оригиналния разказ), едноръчните стойности карат ЛЯВАТА китка да не
  // достига (тя не съществува при B) — вместо това стоим близо до A_REST (позната валидна
  // двуръчна поза), само по-ниско/отпуснато.
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
  push(loserKeys, t + 0.15, { pose: GUARD_OF[loserSlot], crouch: 0.1 });
  for (const k of loserSlump) push(loserKeys, k.t, { pose: k.pose, lean: k.lean, crouch: k.crouch });

  EVENTS.push({ t: finishT0, type: 'helm', by: winnerSlot, against: loserSlot, power: 1.6 });
  EVENTS.push({ t: finishT0 + 0.05, type: 'disarm', against: loserSlot });
  EVENTS.push({ t: finishT0 + 1.0, type: 'kneel', power: 0.6, against: loserSlot });
  CAPTIONS.push({ t: finishT0 - 0.15, d: 1.3, k: 'final' });

  const duration = finishT0 + 1.9;
  const finishAxis = ROOT_KEYS[ROOT_KEYS.length - 1][4] + 0.1;
  // Същият проблем като при рундовете (виж коментара по-горе): без тясна ROOT_KEYS точка ТОЧНО
  // в finishT0 финалният удар би останал широк ~2.1 м (последният reset на предния рунд).
  // B (щитоносец) има по-къс обхват (MAX_ALONG=0.84 срещу 1.0 за A) — иска по-тясно разстояние
  // при финалния удар; A с двуръчния меч, обратно, се нуждае от малко повече пространство,
  // иначе двуръчният IK се пренатоварва (двете китки твърде близо/кръстосани).
  const finishSep = winnerSlot === 'B' ? 1.1 : 1.4;
  ROOT_KEYS.push([finishT0 - 0.1, 0.1, 0.42, 2.1, finishAxis]);
  ROOT_KEYS.push([finishT0, 0.1, 0.42, finishSep, finishAxis]);
  ROOT_KEYS.push([duration, 0.1, 0.42, 1.65, finishAxis]);
  A_ADV.push([duration, A_ADV[A_ADV.length - 1][1]]);
  B_ADV.push([duration, B_ADV[B_ADV.length - 1][1]]);
  // Плътна котва точно във finishT0 — без нея щитът интерполира от последния reset на рунда
  // право до финалната поза (голям прозорец), докато ОРЪЖИЕТО на B сменя позата рязко там —
  // разминаването кара лявата (щитова) китка да изостава извън толеранса.
  push(B_SHIELD, finishT0, { sh: SH_GUARD });
  B_SHIELD.push({ t: duration, sh: { w: [-0.3, 0.7, 0.3], n: [-0.15, -0.25, 1] } });

  const B_KNEEL = loserSlot === 'B'
    ? [[0, 0], [finishT0 + 0.9, 0], [finishT0 + 1.5, 1], [duration, 1]]
    : [[0, 0], [duration, 0]];
  const BREATH = [[0, 1], [t * 0.5, 1.8], [duration, 2.2]];
  const B_LOOK_DOWN = loserSlot === 'B'
    ? [[0, 0], [finishT0 + 0.8, 0], [finishT0 + 1.2, 1], [duration, 1]]
    : [[0, 0], [duration, 0]];
  const TIME_SCALE = buildTimeScale(rounds, APPROACH, BEAT, CRIT_HOLD, duration);
  const CHAPTERS = [
    { t: 0, k: 'ch1' },
    { t: APPROACH + (t - APPROACH) * 0.35, k: 'ch2' },
    { t: Math.max(APPROACH, t - 1.5), k: 'ch3' },
  ];
  const shots = buildGeneratedShots(APPROACH, t, duration);

  return { A_KEYS, B_KEYS, B_SHIELD, ROOT_KEYS, A_ADV, B_ADV, B_KNEEL, BREATH, B_LOOK_DOWN, TIME_SCALE, EVENTS, CAPTIONS, CHAPTERS, duration, shots };
}

// Кратко забавяне на времето (hit-stop) при всеки крит рунд — както в оригинала (t=12.86..13.62).
function buildTimeScale(rounds, approach, beat, critHold, duration) {
  const k = [[0, 1]];
  let t = approach;
  for (const r of rounds) {
    const crit = r.result === 'crit';
    const dur = crit ? beat + critHold : beat;
    if (crit) {
      const apex = t + dur * 0.55;
      k.push([apex - 0.02, 1], [apex, 0.15], [apex + critHold * 0.5, 0.15], [apex + critHold * 0.5 + 0.1, 1]);
    }
    t += dur;
  }
  k.push([duration, 1]);
  return k;
}

// Опростен генериран списък кадри (без фиксираните KRONE/BLOCK точки на демото) — широк план
// на приближаването, редуващи се кадри "през рамо" на нападателя за всеки рунд, финален pull-back.
function buildGeneratedShots(approach, lastRoundEnd, duration) {
  const ease = (u) => u * u * (3 - 2 * u);
  return [
    { t0: 0, t1: approach, fn: (u, S) => ({ pos: S.P(6.5 - 3 * ease(u), 6.4 - 2 * ease(u), 10 - 3 * ease(u)), target: S.P(0, 1.2, 0), fov: 40, focus: 'C', fstop: 5.6, hand: 0.2 }) },
    { t0: approach, t1: lastRoundEnd, fn: (u, S) => {
      const flip = Math.floor(u * 40) % 2 === 0;
      const from = flip ? S.A : S.B;
      const to = flip ? S.B : S.A;
      return {
        pos: from.root.pos.clone().addScaledVector(S.u, flip ? -1.1 : 1.1).addScaledVector(S.v, 0.6).add({ x: 0, y: 1.75, z: 0 }),
        target: to.rig.w.head.clone(),
        fov: 36, focus: flip ? 'B' : 'A', fstop: 2.2, hand: 0.5,
      };
    } },
    { t0: lastRoundEnd, t1: duration, fn: (u, S) => {
      const k = ease(Math.min(1, u * 1.1));
      const off = S.v.clone().multiplyScalar(2.4 + 4 * k).addScaledVector(S.u, -1.1 - 2 * k);
      return { pos: S.C.clone().add(off).add({ x: 0, y: 1.5 + 3 * k, z: 0 }), target: S.C.clone().add({ x: 0, y: 1.0, z: 0 }), fov: 38, focus: 'C', fstop: 4, hand: 0.25 };
    } },
  ];
}
