export type CharacterClass = 'warrior' | 'ranger' | 'mage' | 'rogue';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemCategory =
  | 'weapon'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'boots'
  | 'shield'
  | 'ring'
  | 'amulet'
  | 'potion'
  | 'misc';

export type EquipSlot =
  | 'weapon'
  | 'offhand'
  | 'helm'
  | 'armor'
  | 'gloves'
  | 'boots'
  | 'ring'
  | 'amulet';

export interface Character {
  id: number;
  user_id: number;
  name: string;
  class: CharacterClass;
  gender: string;
  portrait: string;
  level: number;
  xp: number;
  gold: number;
  stat_points: number;
  skill_points: number;
  hp: number;
  hp_max: number;
  mp: number;
  mp_max: number;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  charisma: number;
  wisdom: number;
  skill_sword: number;
  skill_axe: number;
  skill_bow: number;
  skill_staff: number;
  skill_magic: number;
  skill_stealth: number;
  energy: number;
  energy_max: number;
  energy_updated_at: number;
  arena_rating: number;
  wins: number;
  losses: number;
  created_at: number;
}

export interface Item {
  id: number;
  slug: string;
  name: string;
  category: ItemCategory;
  sub_type: string;
  tier: number;
  rarity: Rarity;
  level_req: number;
  class_req: string;
  atk_min: number;
  atk_max: number;
  defense: number;
  hp_bonus: number;
  mp_bonus: number;
  str_bonus: number;
  dex_bonus: number;
  con_bonus: number;
  int_bonus: number;
  cha_bonus: number;
  wis_bonus: number;
  heal_hp: number;
  heal_mp: number;
  buy_price: number;
  sell_price: number;
  icon: string;
  description: string;
}

export interface InventoryEntry {
  id: number;
  character_id: number;
  item_id: number;
  quantity: number;
  equipped: number;
  slot: string;
}

export interface Monster {
  id: number;
  slug: string;
  name: string;
  level: number;
  hp: number;
  atk_min: number;
  atk_max: number;
  defense: number;
  speed: number;
  xp_reward: number;
  gold_min: number;
  gold_max: number;
  sprite: string;
  family: string;
  region: string;
}

export interface Quest {
  id: number;
  slug: string;
  title: string;
  region: string;
  level_req: number;
  energy_cost: number;
  duration_sec: number;
  intro: string;
  narrative: string;
  monster_slug: string;
  xp_reward: number;
  gold_reward: number;
  item_reward: string;
  success_text: string;
  failure_text: string;
}

export interface CombatActor {
  name: string;
  side: 'hero' | 'foe';
  level: number;
  hp: number;
  hp_max: number;
  atk_min: number;
  atk_max: number;
  defense: number;
  speed: number;
  crit_chance: number;
  dodge_chance: number;
  sprite: string;
  class?: CharacterClass | null;
}

export type CombatActionType =
  | 'attack'
  | 'crit'
  | 'block'
  | 'dodge'
  | 'miss'
  | 'special';

export interface CombatRound {
  index: number;
  attacker: 'hero' | 'foe';
  action: CombatActionType;
  damage: number;
  heroHp: number;
  foeHp: number;
  text: string;
  // For animation hints
  effect?: 'slash' | 'pierce' | 'magic' | 'arrow' | 'heal' | 'guard';
}

export interface CombatResult {
  winner: 'hero' | 'foe';
  rounds: CombatRound[];
  hero: CombatActor;
  foe: CombatActor;
  xp: number;
  gold: number;
  hpAfter: number;
}
