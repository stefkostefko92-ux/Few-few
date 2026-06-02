import type { CombatActor, CombatRound, CombatResult, CharacterClass } from '../types/domain';

function rng(): number {
  return Math.random();
}

function rollDamage(min: number, max: number): number {
  if (max < min) max = min;
  return Math.floor(min + rng() * (max - min + 1));
}

function effectForClass(cls?: CharacterClass | null): CombatRound['effect'] {
  switch (cls) {
    case 'warrior': return 'slash';
    case 'ranger': return 'arrow';
    case 'mage': return 'magic';
    case 'rogue': return 'pierce';
    default: return 'slash';
  }
}

function flavor(action: string, attacker: string, defender: string, dmg: number, effect: string): string {
  const slashLines = [
    `${attacker} unleashes a sweeping slash at ${defender} for ${dmg} damage!`,
    `${attacker}'s blade carves into ${defender} for ${dmg} damage.`,
    `Steel flashes — ${attacker} cuts ${defender} for ${dmg}.`,
  ];
  const pierceLines = [
    `${attacker} dances behind ${defender} and stabs for ${dmg} damage!`,
    `A precise thrust from ${attacker} pierces ${defender} for ${dmg}.`,
  ];
  const arrowLines = [
    `${attacker} looses an arrow that strikes ${defender} for ${dmg}!`,
    `An arrow from ${attacker} finds its mark, dealing ${dmg} damage.`,
  ];
  const magicLines = [
    `Arcane fire flares from ${attacker}, scorching ${defender} for ${dmg} damage!`,
    `${attacker} channels raw mana — ${defender} takes ${dmg} damage.`,
  ];

  if (action === 'crit') return `CRITICAL! ${attacker}'s blow shatters defenses for ${dmg} damage!`;
  if (action === 'miss') return `${attacker} swings wildly and misses ${defender}!`;
  if (action === 'dodge') return `${defender} sidesteps gracefully — the attack misses!`;
  if (action === 'block') return `${defender} braces and absorbs the blow, taking only ${dmg} damage.`;

  switch (effect) {
    case 'slash': return slashLines[Math.floor(rng() * slashLines.length)];
    case 'pierce': return pierceLines[Math.floor(rng() * pierceLines.length)];
    case 'arrow': return arrowLines[Math.floor(rng() * arrowLines.length)];
    case 'magic': return magicLines[Math.floor(rng() * magicLines.length)];
    default: return `${attacker} strikes ${defender} for ${dmg} damage.`;
  }
}

export function simulateCombat(hero: CombatActor, foe: CombatActor): CombatResult {
  const rounds: CombatRound[] = [];
  // Clone to avoid mutating input
  const H: CombatActor = { ...hero };
  const F: CombatActor = { ...foe };

  let index = 0;
  // Initiative: whoever has more speed strikes first; tie -> hero
  let heroTurn = H.speed >= F.speed;

  const MAX_ROUNDS = 60;
  while (H.hp > 0 && F.hp > 0 && index < MAX_ROUNDS) {
    index++;
    const attacker = heroTurn ? H : F;
    const defender = heroTurn ? F : H;
    const attackerSide: 'hero' | 'foe' = heroTurn ? 'hero' : 'foe';

    // Dodge check
    if (rng() < defender.dodge_chance) {
      rounds.push({
        index,
        attacker: attackerSide,
        action: 'dodge',
        damage: 0,
        heroHp: H.hp,
        foeHp: F.hp,
        text: flavor('dodge', attacker.name, defender.name, 0, ''),
        effect: effectForClass(attacker.class),
      });
      heroTurn = !heroTurn;
      continue;
    }

    // Miss chance (small base)
    if (rng() < 0.05) {
      rounds.push({
        index,
        attacker: attackerSide,
        action: 'miss',
        damage: 0,
        heroHp: H.hp,
        foeHp: F.hp,
        text: flavor('miss', attacker.name, defender.name, 0, ''),
        effect: effectForClass(attacker.class),
      });
      heroTurn = !heroTurn;
      continue;
    }

    let damage = rollDamage(attacker.atk_min, attacker.atk_max);
    let action: CombatRound['action'] = 'attack';

    if (rng() < attacker.crit_chance) {
      damage = Math.round(damage * 1.8);
      action = 'crit';
    }

    // Defense reduction (diminishing returns). The +50 constant was
    // tuned for tier-1 numbers where defense lived in the 5-25 range;
    // at endgame (def 500-1550) that gave 91-97% DR which made the
    // 60-round cap "won" by surviving the timer regardless of damage
    // output (audit gamebreaking #1 + #10). The constant now scales
    // with attacker level so endgame defense still matters but no
    // longer saturates.
    const scaleConst = 50 + attacker.level * 8;
    const dr = defender.defense / (defender.defense + scaleConst);
    damage = Math.max(1, Math.round(damage * (1 - dr)));

    // Block (10% if the defender has shield-like defense > 5)
    if (defender.defense > 5 && rng() < 0.1) {
      damage = Math.max(1, Math.floor(damage * 0.4));
      action = 'block';
    }

    defender.hp = Math.max(0, defender.hp - damage);

    rounds.push({
      index,
      attacker: attackerSide,
      action,
      damage,
      heroHp: H.hp,
      foeHp: F.hp,
      text: flavor(action, attacker.name, defender.name, damage, effectForClass(attacker.class) || 'slash'),
      effect: effectForClass(attacker.class),
    });

    heroTurn = !heroTurn;
  }

  // Timer outcomes (audit gamebreaker #1): if we hit the round cap with
  // both fighters alive, the player who dealt the larger HP-percentage of
  // their opponent wins. That replaces the old behaviour where the more
  // durable side automatically won by surviving the timer — at endgame
  // monster HP scales faster than hero damage and a Lv 350 hero with
  // 12k HP / 65 dmg/swing was beating a Lv 350 monster with 225k HP
  // simply because their own HP was still positive.
  let winner: 'hero' | 'foe';
  if (H.hp > 0 && F.hp > 0) {
    const heroPct = (F.hp_max - F.hp) / Math.max(1, F.hp_max);
    const foePct = (H.hp_max - H.hp) / Math.max(1, H.hp_max);
    winner = heroPct >= foePct ? 'hero' : 'foe';
  } else {
    winner = H.hp > 0 ? 'hero' : 'foe';
  }
  return {
    winner,
    rounds,
    hero: H,
    foe: F,
    xp: 0, // filled by caller
    gold: 0,
    hpAfter: H.hp,
  };
}
