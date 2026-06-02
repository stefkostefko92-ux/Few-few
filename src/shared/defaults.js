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
    strategy: 'gold',               // gold | experience | shortest | longest
    difficulty: 'medium',           // easy | medium | difficult | very_difficult
    serverSpeed: 1,                 // server speed multiplier (divides durations)
    useBloodstones: false,          // spend bloodstones for extra adventures
    bloodstoneReserve: 0            // keep at least this many bloodstones
  },

  /* ---- Training / attributes (STR/DEX/CON/INT) ---- */
  training: {
    enabled: false,
    priorityStat: 'mix',            // mix | strength | dexterity | constitution | intelligence
    maxGoldSpend: 0,                // 0 = spend everything above the reserve
    keepGoldReserve: 0              // spend down to this much gold
  },

  /* ---- Evocation Circle (arcane upgrades) ---- */
  circle: {
    enabled: false,
    currency: 'gold',              // gold | bs (bloodstones)
    multiple: 1,                   // buy 1 or 10 levels per purchase
    stopAtCenterLevel: 10,         // stop once the centre node reaches this level (max 10)
    keepGoldReserve: 0             // never spend gold below this reserve
  },

  /* ---- Dungeon ---- */
  dungeon: {
    enabled: false                 // run the daily dungeon while free tries remain
  },

  /* ---- Map events (Cave of Illusions, Dragon) ---- */
  map: {
    enabled: false,
    illusionCave: true,            // attempt the Cave of Illusions
    dragon: true,                  // attempt the Dragon event
    cooldownMinutes: 10            // wait between attempts
  },

  /* ---- Arena / PvP ---- */
  pvp: {
    enabled: false,
    opponents: '',                 // names to fight (comma/newline separated)
    maxPerDay: 10,                 // 0 = unlimited
    cooldownSeconds: 30
  },

  /* ---- Work / Jobs ---- */
  work: {
    enabled: false,
    durationHours: 2,              // capped to the server's max working hours
    stopWhenAdventureReady: true   // yield when free adventures are available
  },

  /* ---- Auto-sell (conservative, disabled by default) ---- */
  autosell: {
    enabled: false,
    maxValue: 0,                   // sell unequipped items worth <= this gold (0 = inspect only, sell nothing)
    dumpSchema: true               // log the inventory item fields once for verification
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
  'dungeon',
  'map',
  'pvp',
  'adventures',
  'work',
  'circle',
  'training',
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
