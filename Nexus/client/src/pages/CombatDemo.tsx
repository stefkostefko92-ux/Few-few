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
 *
 * Достъпен само през /demo/combat (dev или ?debug=1) — виж App.tsx.
 */
const SAMPLE_ROUNDS: CombatRound[] = [
  { index: 1, attacker: 'hero', action: 'attack', damage: 18, heroHp: 480, foeHp: 392, text: 'Aldric strikes.' },
  { index: 2, attacker: 'foe', action: 'block', damage: 6, heroHp: 474, foeHp: 392, text: 'The Warden blocks.' },
  { index: 3, attacker: 'foe', action: 'attack', damage: 22, heroHp: 452, foeHp: 392, text: 'A counter-blow lands.' },
  { index: 4, attacker: 'hero', action: 'dodge', damage: 0, heroHp: 452, foeHp: 392, text: 'Aldric sidesteps.' },
  { index: 5, attacker: 'hero', action: 'crit', damage: 61, heroHp: 452, foeHp: 331, text: 'A crushing crit!' },
  { index: 6, attacker: 'foe', action: 'miss', damage: 0, heroHp: 452, foeHp: 331, text: 'The Warden overreaches.' },
  { index: 7, attacker: 'hero', action: 'attack', damage: 20, heroHp: 452, foeHp: 311, text: 'Aldric presses on.' },
  { index: 8, attacker: 'hero', action: 'crit', damage: 58, heroHp: 452, foeHp: 253, text: 'The final blow.' },
];
const LOSE_ROUNDS: CombatRound[] = [
  { index: 1, attacker: 'foe', action: 'attack', damage: 40, heroHp: 440, foeHp: 392, text: 'The Warden strikes.' },
  { index: 2, attacker: 'hero', action: 'block', damage: 8, heroHp: 440, foeHp: 384, text: 'Aldric blocks.' },
  { index: 3, attacker: 'foe', action: 'crit', damage: 120, heroHp: 320, foeHp: 384, text: 'A crushing crit!' },
  { index: 4, attacker: 'hero', action: 'miss', damage: 0, heroHp: 320, foeHp: 384, text: 'Aldric overreaches.' },
  { index: 5, attacker: 'foe', action: 'attack', damage: 90, heroHp: 230, foeHp: 384, text: 'The Warden presses on.' },
  { index: 6, attacker: 'foe', action: 'crit', damage: 230, heroHp: 0, foeHp: 384, text: 'The final blow.' },
];
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
    return (
      <div style={{ width: '100vw', height: '100vh', position: 'fixed', inset: 0 }}>
        <CombatScene
          hero={DEMO_HERO}
          foe={DEMO_FOE}
          rounds={rounds}
          victory={!lose}
          reward={lose ? undefined : { xp: 120, gold: 40 }}
          introTitle={`${DEMO_HERO.name}  vs  ${DEMO_FOE.name}`}
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
