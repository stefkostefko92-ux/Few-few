/**
 * In-memory snapshot of the player's current game state.
 *
 * Populated by the API layer as responses are observed, and read by modules to
 * make decisions (e.g. "do I have a free adventure?", "is my HP high enough?").
 * The shape mirrors the data Tanoth surfaces; fields default to null/0 until
 * the bot has seen a corresponding response.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;

  const state = {
    loggedIn: false,
    sessionLost: 0,             // epoch ms of the last detected session fault
    name: null,
    guild: null,
    level: 0,
    xp: 0,
    xpForNextLevel: 0,
    gold: 0,
    bloodstones: 0,
    health: 0,
    maxHealth: 0,

    // adventures
    freeAdventures: 0,          // remaining free adventures today
    adventuresMadeToday: 0,
    freeAdventuresPerDay: 0,
    adventureReturnAt: 0,       // epoch ms when current task resolves
    taskType: null,             // type of the currently running task, if any
    adventureList: [],          // [{id, difficulty, duration, xp, gold}]

    // arena / combat (experimental)
    duelTargets: [],            // [{id, name, level, gold, guild}]

    // training (XML-RPC costs keyed STR/DEX/CON/INT)
    attributeCosts: {},

    // evocation circle: node id -> [level, ...] arrays
    circle: {},

    // jobs
    jobs: [],

    // dungeon / cave
    dungeonAvailable: false,
    dungeon: {},                // {freeTries, madeToday, level, maxLevel}
    work: {},                   // {maxHours, goldFee}
    caveFloor: 0,
    caveAttemptsLeft: 1,

    // inventory
    inventory: [],              // [{id, name, rarity, type, value}]
    runes: [],

    lastUpdated: 0
  };

  const listeners = new Set();

  TB.State = {
    get: () => state,
    patch(partial) {
      Object.assign(state, partial);
      state.lastUpdated = Date.now();
      listeners.forEach((fn) => { try { fn(state); } catch (_) {} });
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    healthPercent() {
      if (!state.maxHealth) return 100;
      return Math.round((state.health / state.maxHealth) * 100);
    },
    // adventureReturnAt is the single shared "busy until" timer for all task
    // activities (adventure / dungeon / work / map event).
    busy() {
      return state.adventureReturnAt > Date.now();
    }
  };
})();
