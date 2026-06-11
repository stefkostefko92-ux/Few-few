/* Shared item shape used by LootDropOverlay, tooltips, and future
 * inventory/auction reuse. The previous ItemTooltip component lived
 * here as a working draft but was never wired anywhere; the inventory
 * page already has its own inline tooltip (with the compare-to-equipped
 * diff). Kept the type, dropped the unused JSX. */
export interface ItemLike {
  id?: number;
  slug?: string;
  name: string;
  category?: string;
  sub_type?: string;
  tier?: number;
  rarity?: string;
  level_req?: number;
  atk_min?: number;
  atk_max?: number;
  defense?: number;
  hp_bonus?: number;
  mp_bonus?: number;
  str_bonus?: number;
  dex_bonus?: number;
  con_bonus?: number;
  int_bonus?: number;
  cha_bonus?: number;
  wis_bonus?: number;
  phys_dmg_bonus?: number;
  phys_def_bonus?: number;
  mag_dmg_bonus?: number;
  mag_def_bonus?: number;
  buy_price?: number;
  sell_price?: number;
  icon?: string;
  description?: string;
}
