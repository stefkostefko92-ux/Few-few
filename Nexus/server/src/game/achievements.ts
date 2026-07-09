export interface AchievementDef {
  slug: string;
  name: string;
  description: string;
  icon: string;          // emoji
  title?: string;        // unlockable title
  goldReward?: number;
  xpReward?: number;
  /** Predicate evaluated against a snapshot of character + counters */
  unlockedAt: (snap: AchievementSnapshot) => boolean;
}

export interface AchievementSnapshot {
  level: number;
  monsters_slain: number;
  battles_won: number;
  battles_lost: number;
  total_xp_earned: number;
  total_gold_earned: number;
  dungeons_cleared: number;
  arena_rating: number;
  unique_bestiary: number;
  streak: number;
  legendary_owned: boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Level milestones
  { slug: 'level_5',  name: 'Of Age',           description: 'Reach level 5.',  icon: '⭐', title: 'the Determined', xpReward: 50,  unlockedAt: (s) => s.level >= 5 },
  { slug: 'level_10', name: 'Veteran',          description: 'Reach level 10.', icon: '🌟', title: 'the Veteran',    xpReward: 150, goldReward: 100, unlockedAt: (s) => s.level >= 10 },
  { slug: 'level_15', name: 'Champion',         description: 'Reach level 15.', icon: '💫', title: 'the Champion',   xpReward: 400, goldReward: 250, unlockedAt: (s) => s.level >= 15 },
  { slug: 'level_20', name: 'Hero of the Realm',   description: 'Reach level 20.', icon: '🏆', title: 'Hero of the Realm', xpReward: 800, goldReward: 500, unlockedAt: (s) => s.level >= 20 },
  { slug: 'level_25', name: 'Legend',           description: 'Reach level 25.', icon: '👑', title: 'the Legend',     xpReward: 1500, goldReward: 1000, unlockedAt: (s) => s.level >= 25 },

  // Combat
  { slug: 'first_blood', name: 'First Blood',  description: 'Win your first battle.',     icon: '🩸', xpReward: 25, unlockedAt: (s) => s.battles_won >= 1 },
  { slug: 'slayer_10',   name: 'Slayer',       description: 'Slay 10 monsters.',          icon: '🗡', goldReward: 30, unlockedAt: (s) => s.monsters_slain >= 10 },
  { slug: 'slayer_50',   name: 'Hunter',       description: 'Slay 50 monsters.',          icon: '🏹', title: 'the Hunter',     goldReward: 150, unlockedAt: (s) => s.monsters_slain >= 50 },
  { slug: 'slayer_200',  name: 'Beastbane',    description: 'Slay 200 monsters.',         icon: '🐺', title: 'Beastbane',      goldReward: 500, unlockedAt: (s) => s.monsters_slain >= 200 },
  { slug: 'slayer_500',  name: 'Worldslayer',  description: 'Slay 500 monsters.',         icon: '💀', title: 'the Worldslayer', goldReward: 1500, unlockedAt: (s) => s.monsters_slain >= 500 },
  { slug: 'wins_25',     name: 'Steeled',      description: 'Win 25 battles.',            icon: '⚔️', goldReward: 80, unlockedAt: (s) => s.battles_won >= 25 },
  { slug: 'wins_100',    name: 'Victorious',   description: 'Win 100 battles.',           icon: '🥇', title: 'the Victorious', goldReward: 300, unlockedAt: (s) => s.battles_won >= 100 },
  { slug: 'defeats_5',   name: 'Bloodied',     description: 'Lose 5 battles. The road is long.', icon: '🩹', unlockedAt: (s) => s.battles_lost >= 5 },

  // Arena
  { slug: 'arena_1100', name: 'Contender',  description: 'Reach arena rating 1100.', icon: '🛡', goldReward: 100, unlockedAt: (s) => s.arena_rating >= 1100 },
  { slug: 'arena_1300', name: 'Duelist',    description: 'Reach arena rating 1300.', icon: '⚜', title: 'the Duelist', goldReward: 250, unlockedAt: (s) => s.arena_rating >= 1300 },
  { slug: 'arena_1500', name: 'Gladiator',  description: 'Reach arena rating 1500.', icon: '🏟', title: 'Gladiator', goldReward: 600, unlockedAt: (s) => s.arena_rating >= 1500 },

  // Wealth
  { slug: 'gold_1k',   name: 'A Heavy Purse',   description: 'Earn a total of 1,000 gold.',   icon: '💰', unlockedAt: (s) => s.total_gold_earned >= 1000 },
  { slug: 'gold_10k',  name: 'Coin Counter',    description: 'Earn a total of 10,000 gold.',  icon: '💵', title: 'the Wealthy', goldReward: 250, unlockedAt: (s) => s.total_gold_earned >= 10000 },
  { slug: 'gold_50k',  name: 'Lord of Coin',    description: 'Earn a total of 50,000 gold.',  icon: '👑', title: 'Lord of Coin', goldReward: 1000, unlockedAt: (s) => s.total_gold_earned >= 50000 },

  // Bestiary / collection
  { slug: 'bestiary_5',  name: 'Tracker',      description: 'Defeat 5 different kinds of monster.',  icon: '📖', goldReward: 40,  unlockedAt: (s) => s.unique_bestiary >= 5 },
  { slug: 'bestiary_10', name: 'Naturalist',   description: 'Defeat 10 different kinds of monster.', icon: '📜', goldReward: 150, unlockedAt: (s) => s.unique_bestiary >= 10 },
  { slug: 'bestiary_all', name: 'Loremaster',  description: 'Catalog every monster in Nexus Dominion.',      icon: '📚', title: 'Loremaster', goldReward: 1500, unlockedAt: (s) => s.unique_bestiary >= 17 },

  // Dungeons
  { slug: 'dungeon_1',   name: 'Delver',       description: 'Clear your first dungeon.',  icon: '🗝', goldReward: 80, unlockedAt: (s) => s.dungeons_cleared >= 1 },
  { slug: 'dungeon_10',  name: 'Dungeonborn',  description: 'Clear 10 dungeons.',         icon: '🏰', title: 'Dungeonborn', goldReward: 400, unlockedAt: (s) => s.dungeons_cleared >= 10 },

  // Streak
  { slug: 'streak_7',  name: 'A Week of Glory',     description: 'Log in 7 days in a row.',  icon: '🔥', goldReward: 100, unlockedAt: (s) => s.streak >= 7 },
  { slug: 'streak_30', name: 'A Month of Heroism',  description: 'Log in 30 days in a row.', icon: '🌅', title: 'the Steadfast', goldReward: 750, unlockedAt: (s) => s.streak >= 30 },

  // Legendary loot
  { slug: 'legend_owner', name: 'Wielder of Myth', description: 'Acquire a legendary item.', icon: '✨', title: 'Mythwielder', goldReward: 300, unlockedAt: (s) => s.legendary_owned },
];

export function findAchievement(slug: string): AchievementDef | undefined {
  return ACHIEVEMENTS.find((a) => a.slug === slug);
}
