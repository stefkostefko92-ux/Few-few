/**
 * Smart adventure scoring (shared ES module, unit-tested).
 *
 * The Evocation Circle gives global multipliers: Jade (node 1) boosts XP and
 * Amethyst (node 8) boosts adventure gold, at +0.2% per refinement level. A
 * plain "most gold" or "most XP" picker ignores this; the smart picker scores
 * each adventure by its circle-boosted reward per second, blending gold and XP
 * via a configurable weight, so it adapts to what your circle is boosting.
 */

const JADE_NODE = 1;       // +XP
const AMETHYST_NODE = 8;   // +adventure gold
const PER_LEVEL = 0.002;   // +0.2% per refinement level

export function circleMultipliers(circle) {
  const lvl = (n) => (circle && circle[n] && Number.isFinite(circle[n][0]) ? circle[n][0] : 0);
  return {
    gold: 1 + lvl(AMETHYST_NODE) * PER_LEVEL,
    xp: 1 + lvl(JADE_NODE) * PER_LEVEL
  };
}

// xpWeight: how much 1 XP is worth relative to 1 gold (default 1).
export function smartScore(adv, mult, xpWeight = 1) {
  const dur = Math.max(1, adv.duration || 1);
  const gold = (adv.gold || 0) * mult.gold;
  const xp = (adv.xp || 0) * mult.xp * xpWeight;
  return (gold + xp) / dur;
}

export function chooseSmart(adventures, circle, xpWeight = 1) {
  if (!adventures || !adventures.length) return null;
  const mult = circleMultipliers(circle);
  let best = null, bestScore = -Infinity;
  for (const a of adventures) {
    if (a.id == null) continue;
    const sc = smartScore(a, mult, xpWeight);
    if (sc > bestScore) { bestScore = sc; best = a; }
  }
  return best;
}
