/**
 * Loads all equipped inventory rows for a character together with their
 * forge enchant bonuses. Used by every combat-driving route (arena,
 * hunting, dungeon, tower, quest) and the character preview so the same
 * data shape lands in deriveStats() everywhere.
 */
import { getDb } from '../db';
import type { Item, InventoryEntry } from '../types/domain';

export type EnchantBonuses = Partial<Record<
  'str_bonus' | 'dex_bonus' | 'con_bonus' | 'int_bonus' | 'cha_bonus' | 'wis_bonus' |
  'hp_bonus' | 'mp_bonus' | 'defense' | 'atk_max' | 'atk_min',
  number
>>;

export interface EquippedSlot {
  item: Item;
  entry: InventoryEntry;
  enchant_bonuses: EnchantBonuses;
}

export function loadEquipped(characterId: number): EquippedSlot[] {
  const rows = getDb()
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot,
              COALESCE(e.bonuses_json, '{}') AS enchant_bonuses_json,
              items.*
       FROM inventory inv
       JOIN items ON inv.item_id = items.id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.character_id = ? AND inv.equipped = 1`,
    )
    .all(characterId) as any[];
  return rows.map((row) => {
    let bonuses: EnchantBonuses = {};
    try { bonuses = JSON.parse(row.enchant_bonuses_json || '{}'); } catch { /* ignore */ }
    return {
      item: row as Item,
      entry: {
        id: row.inv_id,
        character_id: characterId,
        item_id: row.id,
        quantity: row.quantity,
        equipped: row.equipped,
        slot: row.slot,
      },
      enchant_bonuses: bonuses,
    };
  });
}
