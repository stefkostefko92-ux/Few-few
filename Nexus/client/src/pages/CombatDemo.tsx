import React from 'react';
import BoyDuelStage from '../combat/engine/BoyDuelStage';
import type { CombatRound } from '../lib/types';

/**
 * QA харнес за новия боен двигател (Nexus Fase 4a) — порт на boy/ ("Двубой в Рейвънхолд").
 * По подразбиране показва ОРИГИНАЛНАТА фиксирана хореография на boy (28.5s филм), плоски
 * материали (без изпечени текстури на този етап). `?gen=1` пуска ГЕНЕРИРАН двубой от примерни
 * рундове (choreo-gen.js — 4a.2) вместо демото, за визуална проверка на data-driven пътя.
 * Старият спрайт/CombatScene3D конвейер остава недокоснат до 4a.3.
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

export default function CombatDemo(): React.ReactElement {
  const useGenerated = new URLSearchParams(window.location.search).get('gen') === '1';
  return useGenerated
    ? <BoyDuelStage rounds={SAMPLE_ROUNDS} victory loop={false} />
    : <BoyDuelStage />;
}
