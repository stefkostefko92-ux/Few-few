/**
 * À-la-carte combat-stat add-ons for mounts. The top-tier mount ships as a
 * cheap base (cooldown only); players buy whichever of these lines they
 * want at 500 gems each. Shared between the mount route (catalog + purchase)
 * and the equipment loader (applying purchased add-ons to derived stats).
 */

export type MountAddonKey = 'phys_dmg' | 'phys_def' | 'mag_dmg' | 'mag_def';

export interface MountAddon {
  key: MountAddonKey;
  label: string;
  amount: number;
  gem_cost: number;
  /** Which DerivedStats axis / enchant field this add-on feeds. */
  bonus_field: 'phys_dmg_bonus' | 'phys_def_bonus' | 'mag_dmg_bonus' | 'mag_def_bonus';
}

export const MOUNT_ADDONS: Record<string, MountAddon[]> = {
  mount_world_serpent: [
    { key: 'phys_dmg', label: 'Physical Damage',  amount: 45, gem_cost: 500, bonus_field: 'phys_dmg_bonus' },
    { key: 'phys_def', label: 'Physical Defence', amount: 35, gem_cost: 500, bonus_field: 'phys_def_bonus' },
    { key: 'mag_dmg',  label: 'Magical Damage',   amount: 45, gem_cost: 500, bonus_field: 'mag_dmg_bonus' },
    { key: 'mag_def',  label: 'Magical Defence',  amount: 35, gem_cost: 500, bonus_field: 'mag_def_bonus' },
  ],
};
