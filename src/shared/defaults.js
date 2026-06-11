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
    strategy: 'gold',               // gold | experience | shortest | longest | smart
    smartXpWeight: 1,               // for 'smart': value of 1 XP relative to 1 gold
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
    mode: 'auto',                  // auto = optimal path | manual = only the nodes you list
    manualNodes: '',               // node numbers to upgrade in order, e.g. "8, 1, 16"
    currency: 'gold',              // gold | bs (bloodstones)
    multiple: 1,                   // buy 1 or 10 levels per purchase
    stopAtCenterLevel: 10,         // stop once the centre node reaches this level (max 10)
    keepGoldReserve: 0             // never spend gold below this reserve
  },

  /* ---- Dungeon ---- */
  dungeon: {
    enabled: false,                // run the daily dungeon while free tries remain
    mode: 'normal',                // normal | shadow (Shadow dungeon shares the daily tries)
    shadowRounds: 10               // max fight rounds per shadow run before claiming
  },

  /* ---- Event / Mission quest ---- */
  eventquest: {
    enabled: false                 // run the King's mission when offered
  },

  /* ---- Guild (gold sink) ---- */
  guild: {
    enabled: false,
    donateGold: false,             // donate surplus gold to the guild treasury
    keepGoldReserve: 0,
    minDonation: 1000              // only donate when surplus is at least this much
  },

  /* ---- Map (Liberation encounters + Cave/Dragon events) ---- */
  map: {
    enabled: false,
    encounters: true,              // auto-fight the available map encounters (срещи)
    buyEnergy: false,              // buy more encounter energy when it runs out
    // Regions in PRIORITY order (first = highest). Remove a region to skip it.
    regions: "Dragon's Claw Mountains, Oblivion Gorge, Gloomforest, Blackwater Marshes, Bonelands, Island of Secrets",
    illusionCave: true,            // also run the Dungeon of Illusions (cave)
    dragon: true,                  // also run the Dragon event
    cooldownMinutes: 10            // wait between cave/dragon attempts
  },

  /* ---- Arena / PvP ---- */
  pvp: {
    enabled: false,
    opponents: '',                 // names to fight (comma/newline separated)
    maxPerDay: 10,                 // 0 = unlimited
    cooldownSeconds: 600,          // real arena cooldown to wait between free fights
    useBloodstones: false,         // spend bloodstones to fight during the cooldown
    bloodstoneReserve: 0           // keep at least this many bloodstones
  },

  /* ---- Work / Jobs ---- */
  work: {
    enabled: false,
    durationHours: 2,              // capped to the server's max working hours
    stopWhenAdventureReady: true   // yield when free adventures are available
  },

  /* ---- Auto-sell (equipment only, by rarity; disabled by default) ---- */
  autosell: {
    enabled: false,
    sellCommon: true,              // sell common (normal) equipment
    sellSpecial: false,            // ALSO sell unique / epic (T1+) equipment - opt in
    dumpSchema: true               // log the inventory item fields once for verification
  },

  /* ---- Auto-login / session keep-alive ---- */
  autologin: {
    enabled: true,
    reloadOnDisconnect: true,
    maxReloadAttempts: 5
  },

  /* ---- External notifications (Telegram / Discord webhooks) ---- */
  webhooks: {
    telegramEnabled: false, telegramToken: '', telegramChat: '',
    discordEnabled: false, discordWebhook: ''
  },

  /* ---- Scheduler ---- */
  scheduler: {
    enabled: false,
    activeFrom: '00:00',            // only run between these times (local)
    activeTo: '23:59',
    randomBreaks: false,            // take occasional human-like breaks (off by default)
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
