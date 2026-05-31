/**
 * Loads all equipped inventory rows for a character together with their
 * forge enchant bonuses. Used by every combat-driving route (arena,
 * hunting, dungeon, tower, quest) and the character preview so the same
 * data shape lands in deriveStats() everywhere.
 */
import { getDb } from '../db';
import type { Item, InventoryEntry } from '../types/domain';
import { MOUNT_ADDONS } from './mountAddons';

export type EnchantBonuses = Partial<Record<
  'str_bonus' | 'dex_bonus' | 'con_bonus' | 'int_bonus' | 'cha_bonus' | 'wis_bonus' |
  'hp_bonus' | 'mp_bonus' | 'defense' | 'atk_max' | 'atk_min' |
  'phys_dmg_bonus' | 'phys_def_bonus' | 'mag_dmg_bonus' | 'mag_def_bonus',
  number
>>;

export interface EquippedSlot {
  item: Item;
  entry: InventoryEntry;
  enchant_bonuses: EnchantBonuses;
}

export function loadEquipped(characterId: number): EquippedSlot[] {
  // Equipped gear (inv.equipped = 1) PLUS the active mount, which is
  // tracked via characters.mount_inventory_id rather than the equipped
  // flag (mounts have no body slot). Both feed deriveStats.
  const rows = getDb()
    .prepare(
      `SELECT inv.id as inv_id, inv.quantity, inv.equipped, inv.slot,
              COALESCE(e.bonuses_json, '{}') AS enchant_bonuses_json,
              items.*
       FROM inventory inv
       JOIN items ON inv.item_id = items.id
       LEFT JOIN inventory_enchants e ON e.inventory_id = inv.id
       WHERE inv.character_id = ?
         AND (inv.equipped = 1
              OR inv.id = (SELECT mount_inventory_id FROM characters WHERE id = ?))`,
    )
    .all(characterId, characterId) as any[];

  // Purchased mount add-ons for this character, merged into the matching
  // mount slot's bonuses below.
  const addonRows = getDb()
    .prepare('SELECT mount_slug, addon_key FROM mount_addons WHERE character_id = ?')
    .all(characterId) as { mount_slug: string; addon_key: string }[];

  return rows.map((row) => {
    let bonuses: EnchantBonuses = {};
    try { bonuses = JSON.parse(row.enchant_bonuses_json || '{}'); } catch { /* ignore */ }
    // If this row is a mount, fold in any add-ons bought for it.
    if (row.sub_type === 'mount') {
      const defs = MOUNT_ADDONS[row.slug] || [];
      for (const a of addonRows.filter((r) => r.mount_slug === row.slug)) {
        const def = defs.find((d) => d.key === a.addon_key);
        if (def) bonuses[def.bonus_field] = (bonuses[def.bonus_field] || 0) + def.amount;
      }
    }
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
