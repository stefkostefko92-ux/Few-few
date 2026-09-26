// 4a.4 (кръг 2, Nexus порт, НЕ част от оригиналния boy) — изнесено от choreo-gen.js (закон #1,
// 300 реда): builder-ите на ЕДИН рунд, близък (меч/къс меч/боздуган — IK aim/parry/block reach,
// както оригинала на boy) и далечен (жезъл/лък — снаряд, контактът е момент на попадение, не
// IK близост — виж ranged.js). buildTimeScale чете shotBeats (вече апекс-точен за двата вида
// рунд), не пресмята дублиращо от rounds — един източник на истина, нула риск от разминаване.
import { GUARD_POSES } from './choreo.js';
import { isRangedKit, hasShieldKit } from './loadout.js';
import { isBeastKit, beastSpecies } from './beast-config.js';

const { A_VOMTAG, B_GUARD, STAFF_REST, STAFF_CHANNEL, STAFF_CAST, BOW_REST, BOW_DRAW, BOW_LOOSE } = GUARD_POSES;

// 4b: звярът няма ръка — "хватката" тук е захапката/лапата, локално p/d/e в собствената му
// рамка (виж beast-fighter.js — то чете W.p през СЪЩИЯ weaponAt() като меча на рицаря). Височина
// от beast-config.js (biteY), не фиксираната човешка 1.35 — затова и anchorY по-долу.
function beastGuardPose(kit) {
  const S = beastSpecies(kit);
  return { p: [0, S.biteY * 0.88, S.reach * 0.35], d: [0, -0.15, 1], e: [0, 1, 0] };
}
function beastAimTable(kit) {
  const S = beastSpecies(kit);
  const y = S.biteY;
  const z = S.reach;
  return {
    head: { hand: [0.02, y, z], contact: 0.55, anchorY: y + 0.1 },
    headL: { hand: [0.03, y * 0.96, z * 0.9], contact: 0.5, anchorY: y + 0.1 },
    lshoulder: { hand: [0.04, y * 0.9, z * 0.85], contact: 0.55, anchorY: y + 0.1 },
    chest: { hand: [0.02, y * 1.06, z * 0.95], contact: 0.5, anchorY: y + 0.1 },
  };
}
/** Кит-специфична AIM таблица на нападателя — звяр (beast-config.js) или човешката AIM[slot]. */
export function aimTableFor(slot, kit) {
  return isBeastKit(kit) ? beastAimTable(kit) : AIM[slot];
}

export function push(list, t, entry) {
  list.push({ t, ...entry });
}

export const AIM = {
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
// По подразбиране целите циклират високо/рамо/гърди; разбойникът (къс меч) сече по-ниско и
// по-бързо — виж buildMeleeRound по-долу ("по-ниски удари" от брифа).
export const TARGET_CYCLE = ['head', 'lshoulder', 'chest', 'headL'];
export const TARGET_CYCLE_LOW = ['chest', 'lshoulder', 'chest', 'headL'];
export const PARRY_STYLES = ['up', 'flat', 'hang'];
export const BEAT = 1.7;
export const CRIT_HOLD = 0.55;
// Далечните рундове траят по-дълго (трябва да поберат полета на снаряда преди guard-връщане).
const RANGED_DUR_MUL = 1.55;
export const FLIGHT_T = 0.5;

export function guardPoseFor(slot, kit) {
  if (isBeastKit(kit)) return beastGuardPose(kit);
  if (kit === 'staff') return STAFF_REST;
  if (kit === 'bow') return BOW_REST;
  return slot === 'A' ? A_VOMTAG : B_GUARD;
}

/** Близък рунд (меч/къс меч/боздуган) — почти буквално оригиналния 4a.2 генератор, само
 * guard позата и целевия цикъл вече идват от кита, не от фиксирани A/B константи. */
export function buildMeleeRound(ctx) {
  const {
    round, ti, t, rnd, attackerSlot, defenderSlot, attackerKeys, defenderKeys, attackerKit, defenderKit,
    B_SHIELD, EVENTS, ROOT_KEYS, A_ADV, B_ADV, shotBeats, reachPad = 0,
  } = ctx;
  const crit = round.result === 'crit';
  const fast = attackerKit === 'shortsword'; // разбойник: по-бързо, по-ниско (брифа 4a.4).
  const dur = (crit ? BEAT + CRIT_HOLD : BEAT) * (fast ? 0.82 : 1);
  const cycle = fast ? TARGET_CYCLE_LOW : TARGET_CYCLE;
  const target = cycle[ti % cycle.length];
  const aimTpl = aimTableFor(attackerSlot, attackerKit)[target];
  const windT = t + dur * 0.28;
  const apexT = t + dur * 0.55;
  const returnT = t + dur;
  // 4b: защитникът е звяр с различен ръст от рицар — DYNAMIC_AIMS (fighter.js/timeline.js) вече
  // прицелва живо по other.rig.w.head във всеки кадър около удара; без dynamic контактната точка
  // би стояла на фиксираната човешка височина от TARGETS[] и мечът би минал над плъх/под титан.
  const dynamic = isBeastKit(defenderKit) || undefined;

  push(attackerKeys, windT, { pose: guardPoseFor(attackerSlot, attackerKit), ease: 'in', crouch: 0.1 });
  push(attackerKeys, apexT, {
    aim: { target, hand: aimTpl.hand, contact: aimTpl.contact, anchorY: aimTpl.anchorY, dynamic }, e: [0, 1, 0], ease: 'in', lean: crit ? 0.14 : 0.1, crouch: 0.1,
  });
  if (crit) push(attackerKeys, apexT + CRIT_HOLD * 0.6, { hold: true, crouch: 0.1 });

  const defenderHasShield = defenderSlot === 'B' && hasShieldKit(defenderKit);
  if (round.result === 'block') {
    if (defenderHasShield) {
      B_SHIELD.push({ t: apexT, block: { vs: attackerSlot }, ease: 'out' });
      EVENTS.push({ t: apexT, type: 'shield', by: attackerSlot, power: crit ? 1.1 : 0.85 });
    } else {
      push(defenderKeys, apexT, { parry: { vs: attackerSlot, style: PARRY_STYLES[ti % PARRY_STYLES.length] } });
      EVENTS.push({ t: apexT, type: 'clash', power: crit ? 1.3 : 0.85 });
      EVENTS.push({ t: apexT + 0.06, type: 'scrape', dur: 0.2, power: 0.5 });
    }
  } else if (round.result === 'dodge' || round.result === 'miss') {
    // Чисто отбягване/пропуск — оръжието "просвирва" покрай защитника без реакция/искри.
  } else {
    EVENTS.push({ t: apexT, type: 'strike', target, by: attackerSlot, against: defenderSlot, power: crit ? 1.6 : 1.0 });
    if (crit) EVENTS.push({ t: windT + 0.02, type: 'lightning', power: 0.4 });
  }
  EVENTS.push({ t: apexT, type: 'roundmark', roundIndex: ti, by: attackerSlot, against: defenderSlot });

  push(attackerKeys, returnT, { pose: guardPoseFor(attackerSlot, attackerKit), ease: 'out', crouch: 0.08 });

  const axis = 0.15 + ti * 0.08;
  ROOT_KEYS.push([apexT - 0.12, 0.1, 0.42, 2.1 + reachPad, axis]);
  ROOT_KEYS.push([apexT, 0.1, 0.42, 1.35 + reachPad + 0.1 * rnd(), axis]);
  ROOT_KEYS.push([returnT, 0.1, 0.42, 2.1 + reachPad, axis]);
  const advPulse = attackerSlot === 'A' ? A_ADV : B_ADV;
  advPulse.push([apexT, 0.18 + 0.1 * rnd()]);
  advPulse.push([returnT, 0]);
  if (!crit && defenderHasShield) B_SHIELD.push({ t: returnT, sh: GUARD_POSES.SH_GUARD });

  shotBeats.push({ t0: t, t1: returnT, crit, apex: apexT });
  return returnT;
}

/** Далечен рунд (жезъл/лък) — локални draw/release пози (НЕ aim), контактът е снаряд
 * (choreo-gen.js EVENTS 'cast'+'shot', обработени в events.js/ranged.js), не IK близост.
 * Нападателят пази по-голяма дистанция целия рунд (ROOT_KEYS сепарация, не иска reach). */
export function buildRangedRound(ctx) {
  const { round, ti, t, rnd, attackerSlot, defenderSlot, attackerKeys, attackerKit, EVENTS, ROOT_KEYS, A_ADV, B_ADV, shotBeats, reachPad = 0 } = ctx;
  const crit = round.result === 'crit';
  const hit = round.result === 'hit' || crit;
  const dur = (crit ? BEAT + CRIT_HOLD : BEAT) * RANGED_DUR_MUL;
  const windT = t + dur * 0.2;
  const releaseT = t + dur * 0.42;
  const impactT = releaseT + FLIGHT_T;
  const returnT = t + dur;
  const poses = attackerKit === 'staff' ? { channel: STAFF_CHANNEL, cast: STAFF_CAST } : { channel: BOW_DRAW, cast: BOW_LOOSE };
  const rest = guardPoseFor(attackerSlot, attackerKit);

  push(attackerKeys, windT, { pose: poses.channel, ease: 'in', crouch: 0.06 });
  push(attackerKeys, releaseT, { pose: poses.cast, ease: 'in', crouch: 0.05, lean: crit ? 0.1 : 0.04 });
  push(attackerKeys, returnT, { pose: rest, ease: 'out', crouch: 0.04 });

  const target = TARGET_CYCLE[ti % TARGET_CYCLE.length];
  EVENTS.push({ t: releaseT, type: 'cast', by: attackerSlot, against: defenderSlot, target, kit: attackerKit, flight: FLIGHT_T, miss: !hit });
  if (hit) EVENTS.push({ t: impactT, type: 'shot', target, by: attackerSlot, against: defenderSlot, power: crit ? 1.6 : 1.0 });
  EVENTS.push({ t: impactT, type: 'roundmark', roundIndex: ti, by: attackerSlot, against: defenderSlot });

  const axis = 0.15 + ti * 0.08;
  ROOT_KEYS.push([t + 0.05, 0.1, 0.42, 3.1 + reachPad + 0.2 * rnd(), axis]);
  ROOT_KEYS.push([returnT, 0.1, 0.42, 3.0 + reachPad, axis]);
  const advPulse = attackerSlot === 'A' ? A_ADV : B_ADV;
  advPulse.push([releaseT, -0.05]);
  advPulse.push([returnT, 0]);

  shotBeats.push({ t0: t, t1: Math.max(returnT, impactT + 0.2), crit, apex: impactT });
  return returnT;
}

export function buildRound(ctx) {
  return isRangedKit(ctx.attackerKit) ? buildRangedRound(ctx) : buildMeleeRound(ctx);
}

/** Хит-стоп (забавяне) за всеки крит рунд, четено директно от shotBeats (апекс = момента на
 * удара за близък рунд, момента на попадение на снаряда за далечен) — един източник на истина,
 * не преизчислява round durations отделно (така не може да "изтече" от избора на кит). */
export function buildTimeScale(shotBeats, duration) {
  const k = [[0, 1]];
  for (const b of shotBeats) {
    if (!b.crit) continue;
    const apex = b.apex;
    k.push([apex - 0.02, 1], [apex, 0.15], [apex + CRIT_HOLD * 0.5, 0.15], [apex + CRIT_HOLD * 0.5 + 0.1, 1]);
  }
  k.push([duration, 1]);
  return k;
}
