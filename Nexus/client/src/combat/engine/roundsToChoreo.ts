import type { CombatRound } from '../../lib/types';
import { buildChoreography, type GenRound, type GeneratedChoreography } from './boy/src/choreo-gen';

const ACTION_TO_RESULT: Record<CombatRound['action'], GenRound['result']> = {
  attack: 'hit',
  crit: 'crit',
  block: 'block',
  dodge: 'dodge',
  miss: 'miss',
  special: 'crit',
};

/**
 * 4a.2 — превръща реалните рундове от сървъра (Nexus/server/src/game/combat.ts) в хореография
 * за boy двигателя. Всеки рунд носи `attacker` директно ('hero'|'foe') — само `action` се мапва
 * към по-тесния речник на генератора (choreo-gen.js).
 */
export function choreographyFromRounds(rounds: CombatRound[], victory: boolean): GeneratedChoreography {
  const genRounds: GenRound[] = rounds.map((r) => ({
    attacker: r.attacker,
    result: ACTION_TO_RESULT[r.action] ?? 'hit',
  }));
  return buildChoreography(genRounds, victory);
}
