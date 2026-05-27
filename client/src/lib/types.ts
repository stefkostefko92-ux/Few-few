export type CharacterClass = 'warrior' | 'ranger' | 'mage' | 'rogue';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

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
  arena_rating: number;
  wins: number;
  losses: number;
}

export interface Derived {
  atk_min: number;
  atk_max: number;
  defense: number;
  hp_max: number;
  mp_max: number;
  crit_chance: number;
  dodge_chance: number;
  speed: number;
}

export interface Item {
  id: number;
  slug: string;
  name: string;
  category: string;
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

export interface InventoryItem extends Item {
  inv_id: number;
  quantity: number;
  equipped: number;
  slot: string;
}

export interface Quest {
  id: number;
  slug: string;
  title: string;
  region: string;
  level_req: number;
  energy_cost: number;
  intro: string;
  narrative: string;
  monster_slug: string;
  xp_reward: number;
  gold_reward: number;
  item_reward: string;
}

export interface CombatRound {
  index: number;
  attacker: 'hero' | 'foe';
  action: 'attack' | 'crit' | 'block' | 'dodge' | 'miss' | 'special';
  damage: number;
  heroHp: number;
  foeHp: number;
  text: string;
  effect?: 'slash' | 'pierce' | 'magic' | 'arrow' | 'heal' | 'guard';
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

export interface QuestResult {
  kind: 'story' | 'combat';
  success: boolean;
  narrative?: string;
  intro?: string;
  resultText?: string;
  xp: number;
  gold: number;
  itemReward?: string | null;
  levelUp?: {
    leveled: boolean;
    fromLevel: number;
    toLevel: number;
    statPointsGained: number;
    skillPointsGained: number;
  } | null;
  hero?: CombatActor;
  foe?: CombatActor;
  rounds?: CombatRound[];
}

export interface ArenaResult {
  success: boolean;
  hero: CombatActor;
  foe: CombatActor;
  rounds: CombatRound[];
  ratingDelta: number;
  newRating: number;
  xp: number;
  levelUp?: any;
}

export interface ArenaOpponent {
  id: number;
  name: string;
  class: CharacterClass;
  level: number;
  arena_rating: number;
  wins: number;
  losses: number;
}

export interface MailEntry {
  id: number;
  from_name: string;
  subject: string;
  body: string;
  read_at: number | null;
  created_at: number;
}
