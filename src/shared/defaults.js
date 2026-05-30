/**
 * Shared default settings for Tanoth Master Bot.
 *
 * This file is an ES module consumed by the service worker, popup and options
 * page. The content script reads the persisted copy from chrome.storage (the
 * service worker seeds storage on install), so it does not import this module
 * directly.
 *
 * Every automated module reads its slice of this object. Keeping the full
 * schema in one place makes it trivial to add new modules and to migrate
 * settings between versions.
 */

export const SETTINGS_VERSION = 1;

export const DEFAULT_SETTINGS = {
  version: SETTINGS_VERSION,

  /* ---- Global engine controls ---- */
  general: {
    enabled: false,                 // master on/off switch
    startOnLoad: false,             // begin automating as soon as the game loads
    humanize: true,                 // randomise delays to look human
    minActionDelayMs: 1500,         // lower bound between actions
    maxActionDelayMs: 4500,         // upper bound between actions
    pauseAfterErrors: 3,            // consecutive errors before auto-pausing
    notifications: true,            // desktop notifications on key events
    notifyOnLevelUp: true,
    notifyOnStop: true,
    keepGoldReserve: 0,             // never spend below this much gold (global)
    theme: 'dark',                  // panel theme: 'dark' | 'light'
    panelPosition: 'right'          // 'right' | 'left'
  },

  /* ---- Adventures ---- */
  adventures: {
    enabled: true,
    strategy: 'maxXp',              // shortest | longest | maxXp | maxGold | safest
    maxDifficulty: 7,               // 1-10, skip harder adventures
    minSuccessChance: 60,           // skip adventures below this % win chance
    useBloodstones: false,          // spend bloodstones for extra adventures
    bloodstoneReserve: 5,           // keep at least this many bloodstones
    dailyLimit: 0                   // 0 = no limit beyond what the game allows
  },

  /* ---- Combat / Arena duels ---- */
  combat: {
    enabled: false,
    targetStrategy: 'weakest',      // weakest | highestGold | random | lowestLevel
    avoidGuildMembers: true,        // never attack members of your own guild
    minLevelDiff: -5,               // only attack within this relative level band
    maxLevelDiff: 3,
    recordStats: true,              // remember each opponent's outcome
    maxDuelsPerCycle: 5
  },

  /* ---- Training / attributes ---- */
  training: {
    enabled: false,
    priorityStat: 'strength',       // strength | dexterity | constitution | intelligence | agility
    fallbackStat: 'constitution',   // used when priority is unaffordable
    maxGoldSpend: 0,                // 0 = spend everything above the reserve
    keepGoldReserve: 1000
  },

  /* ---- Dungeon ---- */
  dungeon: {
    enabled: false,
    autoRun: true,
    difficulty: 'normal',           // easy | normal | hard
    minHealthPercent: 50            // skip if HP below this
  },

  /* ---- Cave of Illusions ---- */
  cave: {
    enabled: false,
    useBloodstones: false,
    bloodstoneReserve: 5,
    targetFloor: 0                  // 0 = climb as far as possible
  },

  /* ---- Work / Jobs ---- */
  work: {
    enabled: false,
    durationHours: 2,               // 1-10 hour shift
    preferredJob: 'auto',           // 'auto' picks the best paying available job
    stopWhenAdventureReady: true    // interrupt work when free adventures refill
  },

  /* ---- Runes ---- */
  runes: {
    enabled: false,
    autoUpgrade: true,
    autoSellDuplicates: true,
    minRarityToKeep: 'rare'         // common | uncommon | rare | epic | legendary
  },

  /* ---- Auto-sell inventory ---- */
  autosell: {
    enabled: false,
    sellCommon: true,
    sellUnique: false,
    sellRunes: false,
    sellPotions: false,
    keepRarity: 'rare',             // keep items at/above this rarity
    keepEquippableUpgrades: true    // never sell an item better than what is worn
  },

  /* ---- Auto-login / session keep-alive ---- */
  autologin: {
    enabled: true,
    reloadOnDisconnect: true,
    maxReloadAttempts: 5
  },

  /* ---- Scheduler ---- */
  scheduler: {
    enabled: false,
    activeFrom: '00:00',            // only run between these times (local)
    activeTo: '23:59',
    randomBreaks: true,             // take occasional human-like breaks
    breakEveryMinutes: 90,
    breakDurationMinutes: 10
  }
};

/** Ordered list of automation modules and the priority in which the
 *  scheduler should consider them each cycle (higher = earlier). */
export const MODULE_ORDER = [
  'autologin',
  'adventures',
  'cave',
  'dungeon',
  'combat',
  'work',
  'training',
  'runes',
  'autosell'
];

/** Deep-merge a stored settings object onto the defaults so that new keys
 *  introduced by an update are filled in without clobbering user choices. */
export function mergeSettings(stored) {
  const out = structuredClone(DEFAULT_SETTINGS);
  if (!stored || typeof stored !== 'object') return out;
  for (const section of Object.keys(out)) {
    if (stored[section] && typeof stored[section] === 'object' && typeof out[section] === 'object') {
      Object.assign(out[section], stored[section]);
    } else if (stored[section] !== undefined) {
      out[section] = stored[section];
    }
  }
  out.version = SETTINGS_VERSION;
  return out;
}
