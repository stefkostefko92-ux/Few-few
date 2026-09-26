import React from 'react';
import BoyDuelStage from '../combat/engine/BoyDuelStage';
import CombatScene from '../combat/CombatScene';
import type { CombatActor, CombatRound } from '../lib/types';

/**
 * QA харнес за новия боен двигател (Nexus Fase 4a) — порт на boy/ ("Двубой в Рейвънхолд").
 * По подразбиране показва ОРИГИНАЛНАТА фиксирана хореография на boy (28.5s филм), плоски
 * материали (без изпечени текстури на този етап).
 * `?gen=1` — генериран двубой от примерни рундове (choreo-gen.js) през голия BoyDuelStage.
 * `?scene=1` — ЦЯЛАТА CombatScene.tsx (HP ленти, число на щетата, лог, контроли, резултатен
 * екран) — точно каквото виждат Hunting/Arena/Dungeons/... `&lose=1` показва поражение.
 * `&class=warrior|ranger|mage|rogue` (само с `scene=1`) — 4a.4 клас/оръжие на героя.
 * `&region=whispering_woods|mistmoor_hills|crystal_caverns|ashen_wastes|shadowfell` — 4a.4 тема
 * на противника (loadout.js); по подразбиране whispering_woods (виж CombatScene.tsx).
 * `&foename=<текст>` — 4a.4 (кръг 2) override на foe.name за оръжие-по-вид-звяр QA (напр.
 * "The Witch Queen" → жезъл, "Goblin Raider" → къс меч, "Cave Troll" → боздуган).
 *
 * Достъпен само през /demo/combat (dev или ?debug=1) — виж App.tsx.
 */
// HP след всеки рунд се СМЯТА от щетата (както сървърът в game/combat.ts: attacker удря,
// dodge/miss = 0, block = намалена щета, която все пак минава) — ръчно писаните стойности
// се разминаваха (удар за 18 оставяше противника на 392) и QA снимките показваха „удар без щета“.
type Beat = [attacker: CombatRound['attacker'], action: CombatRound['action'], damage: number, text: string];
function script(beats: Beat[], heroMax: number, foeMax: number): CombatRound[] {
  let heroHp = heroMax;
  let foeHp = foeMax;
  return beats.map(([attacker, action, damage, text], i) => {
    if (attacker === 'hero') foeHp = Math.max(0, foeHp - damage);
    else heroHp = Math.max(0, heroHp - damage);
    return { index: i + 1, attacker, action, damage, heroHp, foeHp, text };
  });
}
const SAMPLE_ROUNDS: CombatRound[] = script([
  ['hero', 'attack', 64, 'Aldric strikes.'],
  ['foe', 'block', 6, 'Aldric raises his guard.'],
  ['foe', 'attack', 38, 'A counter-blow lands.'],
  ['foe', 'dodge', 0, 'Aldric sidesteps.'],
  ['hero', 'crit', 118, 'A crushing crit!'],
  ['foe', 'miss', 0, 'The Warden overreaches.'],
  ['hero', 'attack', 72, 'Aldric presses on.'],
  ['hero', 'crit', 138, 'The final blow.'],
], 480, 392);
const LOSE_ROUNDS: CombatRound[] = script([
  ['foe', 'attack', 40, 'The Warden strikes.'],
  ['hero', 'block', 8, 'The Warden parries.'],
  ['foe', 'crit', 120, 'A crushing crit!'],
  ['hero', 'miss', 0, 'Aldric overreaches.'],
  ['foe', 'attack', 90, 'The Warden presses on.'],
  ['foe', 'crit', 230, 'The final blow.'],
], 480, 392);
const DEMO_HERO: CombatActor = { name: 'Ser Aldric', side: 'hero', level: 24, hp: 480, hp_max: 480, atk_min: 40, atk_max: 60, defense: 20, speed: 12, crit_chance: 0.25, dodge_chance: 0.1, sprite: 'warrior', class: 'warrior' };
const DEMO_FOE: CombatActor = { name: 'The Black Warden', side: 'foe', level: 22, hp: 392, hp_max: 392, atk_min: 30, atk_max: 50, defense: 18, speed: 10, crit_chance: 0.2, dodge_chance: 0.08, sprite: 'warrior' };
// `?quick=crit|block|dodge|miss` — единичен рунд от избрания тип като ПЪРВИ рунд (мигновена
// QA проверка на конкретен изход, без да се чака дълга поредица под бавния SwiftShader).
const QUICK: Record<string, CombatRound> = {
  crit: { index: 1, attacker: 'hero', action: 'crit', damage: 87, heroHp: 480, foeHp: 305, text: 'A crushing crit!' },
  block: { index: 1, attacker: 'foe', action: 'block', damage: 9, heroHp: 471, foeHp: 392, text: 'The Warden blocks.' },
  dodge: { index: 1, attacker: 'foe', action: 'dodge', damage: 0, heroHp: 480, foeHp: 392, text: 'Aldric sidesteps.' },
  miss: { index: 1, attacker: 'hero', action: 'miss', damage: 0, heroHp: 480, foeHp: 392, text: 'The blow goes wide.' },
  // `&lose=1&quick=defeat` — единичен смъртоносен удар, за бърза проверка на екрана "Defeat".
  defeat: { index: 1, attacker: 'foe', action: 'crit', damage: 480, heroHp: 0, foeHp: 392, text: 'The final blow.' },
};

export default function CombatDemo(): React.ReactElement {
  const params = new URLSearchParams(window.location.search);
  const lose = params.get('lose') === '1';
  const quick = params.get('quick');
  if (params.get('scene') === '1') {
    const rounds = quick && QUICK[quick] ? [QUICK[quick]] : lose ? LOSE_ROUNDS : SAMPLE_ROUNDS;
    const cls = params.get('class') as CombatActor['class'] | null;
    const hero = cls ? { ...DEMO_HERO, class: cls } : DEMO_HERO;
    const region = params.get('region') || undefined;
    // &foename= override за QA на 4a.4 (кръг 2) оръжие-по-вид-звяр (loadout.js weaponKit()) —
    // "The Black Warden" резолвва на 'sword' (базовата линия); подай напр. "The Witch Queen".
    // &sprite= override за QA на 4b риг/geo по вид звяр (beast-config.js bodyKind) — напр.
    // rat|boar|wolf|golem|titan|troll|wraith (spider/serpent/drake остават рицари — виж 4b доклада).
    const foe = { ...DEMO_FOE, ...(params.get('foename') ? { name: params.get('foename')! } : {}), ...(params.get('sprite') ? { sprite: params.get('sprite')! } : {}) };
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
        <CombatScene
          hero={hero}
          foe={foe}
          rounds={rounds}
          victory={!lose}
          reward={lose ? undefined : { xp: 120, gold: 40 }}
          introTitle={`${hero.name}  vs  ${foe.name}`}
          region={region}
        />
      </div>
    );
  }
  // BoyDuelStage вече е position:absolute (за да се събира вътре в .combat-stage при вграждане
  // в CombatScene.tsx) — самостоятелното демо тук трябва да му даде positioned+пълноразмерен
  // родител, иначе absolute;inset:0 няма спрямо какво да се позиционира.
  if (params.get('gen') === '1') {
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
        <BoyDuelStage rounds={SAMPLE_ROUNDS} victory loop={false} />
      </div>
    );
  }
  return (
    <div style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
      <BoyDuelStage />
    </div>
  );
}
