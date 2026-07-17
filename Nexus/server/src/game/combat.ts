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

  // No gameplay round cap — the fight runs until one side actually drops
  // to 0 HP. The only bound is a server anti-hang backstop: the loop is
  // synchronous on a single-threaded process, so an absurd matchup (e.g.
  // a 1-damage attacker vs a 200k-HP wall) could otherwise build a
  // multi-hundred-thousand-entry array and stall the process. Every
  // landing hit deals ≥ 1 damage (floor below) and dodge is capped at
  // 0.75, so any real fight terminates by death long before this guard —
  // it exists purely so a pathological build can't DoS the server.
  // Одит: 100k рунда позволяваха ~100ms блокиране на event loop-а + ~15MB
  // rounds_json на бой (два endgame танка). Никой легитимен двубой не
  // надхвърля няколкостотин рунда; tie-break-ът поема останалото.
  const SAFETY_ROUNDS = 2_000;
  while (H.hp > 0 && F.hp > 0 && index < SAFETY_ROUNDS) {
    index++;
    const attacker = heroTurn ? H : F;
    const defender = heroTurn ? F : H;
    const attackerSide: 'hero' | 'foe' = heroTurn ? 'hero' : 'foe';

    // Dodge check. Clamp the effective dodge to 0.75 here regardless of
    // where the stat came from (buffs, set bonuses, NPC seeds) — a value
    // ≥ 1.0 would make the defender literally unhittable and reduce the
    // fight to a timer. PvP stats are already capped at 0.45 upstream;
    // this is the universal floor-of-safety. (Balance audit.)
    const dodgeP = Math.min(0.75, defender.dodge_chance);
    if (rng() < dodgeP) {
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
      // Сила на крита (crit damage) е CHA-driven за героите (база 1.8, до
      // 2.4×); чудовищата нямат crit_mult → 1.8 по подразбиране.
      damage = Math.round(damage * (attacker.crit_mult ?? 1.8));
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

  // Outcome is decided purely by death: whoever still has HP > 0 wins.
  // In the normal case exactly one fighter has dropped to 0. The only
  // way both are still alive here is the SAFETY_ROUNDS anti-hang guard
  // (a pathological min-damage matchup that should never occur in real
  // play); in that single edge case we award the win to whoever is
  // closer to killing their opponent, then by speed, then a coin-flip,
  // so the function always returns a definite winner instead of hanging.
  let winner: 'hero' | 'foe';
  if (H.hp > 0 && F.hp > 0) {
    const heroPct = (F.hp_max - F.hp) / Math.max(1, F.hp_max);
    const foePct = (H.hp_max - H.hp) / Math.max(1, H.hp_max);
    if (heroPct > foePct) winner = 'hero';
    else if (foePct > heroPct) winner = 'foe';
    else if (H.speed !== F.speed) winner = H.speed > F.speed ? 'hero' : 'foe';
    else winner = rng() < 0.5 ? 'hero' : 'foe';
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
