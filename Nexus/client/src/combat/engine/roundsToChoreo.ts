import type { CombatRound, CharacterClass } from '../../lib/types';
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
 * 4a.2/4a.4 — превръща реалните рундове от сървъра (Nexus/server/src/game/combat.ts) в
 * хореография за boy двигателя. Всеки рунд носи `attacker` директно ('hero'|'foe') — само
 * `action` се мапва към по-тесния речник на генератора (choreo-gen.js). heroClass/foeName
 * решават оръжието на всеки слот (choreo-gen-attack.js/loadout.js) — СЪЩИТЕ стойности се подават
 * и на bootDuel() (BoyDuelStage.tsx) за мрежата/щита, за да не могат хореография и мрежа да се
 * разминат кой клас с какво оръжие се бие.
 */
export function choreographyFromRounds(
  rounds: CombatRound[],
  victory: boolean,
  heroClass?: CharacterClass | null,
  foeName?: string,
  foeSprite?: string,
): GeneratedChoreography {
  const genRounds: GenRound[] = rounds.map((r) => ({
    attacker: r.attacker,
    result: ACTION_TO_RESULT[r.action] ?? 'hit',
  }));
  return buildChoreography(genRounds, victory, { heroClass, foeName, foeSprite });
}
