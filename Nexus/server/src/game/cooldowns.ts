/**
 * Action cooldowns — replaces the energy economy.
 *
 * Every "action" (hunt / tower / dungeon / quest / arena) sets a random
 * per-player cooldown from a PER-ACTION range (COOLDOWN_RANGES_MS —
 * стъпаловидна стълбица 3–6 … 7–10 мин). The randomness means two
 * characters who do the same thing won't be ready at the same moment;
 * the ladder means the player's five lanes interleave so there is
 * always a lane about to open. По изискване на собственика ГОРНИЯТ
 * таван на всяка дейност е 10 минути — нито един диапазон не го надхвърля.
 *
 * Mounts (item.sub_type='mount') own a dedicated mechanical property
 * `cooldown_reduction_pct` (it is NOT a stat bonus — it lives on its own
 * column on the items table). Mounts ALSO carry real combat-stat
 * bonuses (phys_dmg / mag_dmg / phys_def / mag_def) which flow through
 * deriveStats like any other equipped gear.
 */

import { getDb } from '../db';

export type ActionKind = 'hunt' | 'camp' | 'tower' | 'dungeon' | 'quest' | 'arena';

// Баланс: СТЪЛБИЦА от диапазони по дейност. Принципът „играчът ВИНАГИ има
// какво да прави" — пет застъпени писти, така че докато една чака, друга
// тъкмо се отваря. Hunt е късата „филър" писта; dungeon е дългата (той е и
// най-щедрият loop — виж gold_bonus кривата в seed/dungeons.ts). Стълбицата
// е свита така, че ГОРНИЯТ таван е точно 10 минути (изискване на
// собственика): всеки max ≤ 10 мин, а редът hunt<arena<quest<tower<dungeon
// се запазва, за да няма мъртви прозорци.
export const COOLDOWN_RANGES_MS: Record<ActionKind, [number, number]> = {
  hunt:    [3 * 60_000, 6 * 60_000],
  arena:   [4 * 60_000, 7 * 60_000],
  quest:   [5 * 60_000, 8 * 60_000],
  tower:   [6 * 60_000, 9 * 60_000],
  dungeon: [7 * 60_000, 10 * 60_000],
  camp:    [60_000, 60_000], // не се ползва — camp има собствен таймер
};
// Audit (balance landmine #5): cap mount cooldown reduction at 50%, not
// 90%. The 90% cap + 3× guild Merchant Charter combined to ~600k g/hr at
// lv 320 with no matching gold sink. 50% keeps premium mounts aspirational
// without breaking the pacing of the realm. Каталогът (mount.ts) е
// изравнен с капа — никой mount вече не рекламира недостижим процент.
const MAX_REDUCTION_PCT = 50;

/** Read the equipped mount's cooldown-reduction property, if any. */
function mountReductionPct(characterId: number): number {
  const row = getDb()
    .prepare(
      `SELECT items.cooldown_reduction_pct AS reduction_pct
       FROM characters c
       JOIN inventory inv ON inv.id = c.mount_inventory_id
       JOIN items ON items.id = inv.item_id
       WHERE c.id = ? AND items.sub_type = 'mount'`,
    )
    .get(characterId) as { reduction_pct: number } | undefined;
  return Math.min(MAX_REDUCTION_PCT, Math.max(0, row?.reduction_pct || 0));
}

/**
 * Throws an Error if the action is still on cooldown for this character.
 * The thrown error's `.cooldownMs` carries the remaining time in ms so
 * the caller can mention it in the response.
 */
export function assertReady(characterId: number, kind: ActionKind): void {
  const row = getDb()
    .prepare('SELECT next_available_at FROM character_cooldowns WHERE character_id = ? AND action_kind = ?')
    .get(characterId, kind) as { next_available_at: number } | undefined;
  const now = Date.now();
  if (row && row.next_available_at > now) {
    const remaining = row.next_available_at - now;
    const err: any = new Error(`Still ${formatRemaining(remaining)} on the ${kind} cooldown.`);
    err.cooldownMs = remaining;
    err.code = 'COOLDOWN';
    throw err;
  }
}

/**
 * Roll a fresh random cooldown for `kind`, apply mount reduction, persist
 * it. Returns the chosen duration in ms so the caller can surface it
 * in the response payload.
 */
export function setCooldown(characterId: number, kind: ActionKind): number {
  const reductionPct = mountReductionPct(characterId);
  const [minMs, maxMs] = COOLDOWN_RANGES_MS[kind];
  const base = minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
  const reduced = Math.round(base * (1 - reductionPct / 100));
  const final = Math.max(60_000, reduced); // никога под 1 мин
  const next = Date.now() + final;
  getDb()
    .prepare(
      `INSERT INTO character_cooldowns (character_id, action_kind, next_available_at)
       VALUES (?, ?, ?)
       ON CONFLICT(character_id, action_kind) DO UPDATE SET next_available_at = excluded.next_available_at`,
    )
    .run(characterId, kind, next);
  return final;
}

/** Convenience snapshot of all cooldowns for the client status panel. */
export function loadCooldowns(characterId: number): Record<ActionKind, number> {
  const rows = getDb()
    .prepare('SELECT action_kind, next_available_at FROM character_cooldowns WHERE character_id = ?')
    .all(characterId) as { action_kind: ActionKind; next_available_at: number }[];
  const out = { hunt: 0, camp: 0, tower: 0, dungeon: 0, quest: 0, arena: 0 } as Record<ActionKind, number>;
  for (const r of rows) out[r.action_kind] = r.next_available_at;
  return out;
}

function formatRemaining(ms: number): string {
  if (ms < 60_000) return `${Math.ceil(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
