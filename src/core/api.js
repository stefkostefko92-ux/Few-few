/**
 * Tanoth API client / protocol adapter.
 *
 * The bot never hard-codes the gateway URL or request envelope — that is
 * learned at runtime by inject.js. What lives here is the *semantic* layer:
 *  - ACTIONS maps logical operations to the game's action names. Tanoth's
 *    classic webservice used these names; they are easy to adjust in one place
 *    if a server revision renames them.
 *  - A defensive response reader that copes with the many field-name variants
 *    Tanoth has used over the years (e.g. gold vs money vs cash).
 *  - Passive syncing: every observed response (whether the bot or the game
 *    itself made the call) is scanned to keep TB.State current, so decisions
 *    are based on fresh data even before the bot issues its own requests.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Bridge, State, Logger } = TB;

  // Logical operation -> game action name. Adjust here if a server revision
  // renames actions; nothing else needs to change.
  const ACTIONS = {
    getUserInfo: 'getUserInfo',
    getAdventures: 'getAdventures',
    startAdventure: 'startAdventure',
    finishAdventure: 'finishAdventure',
    getArenaList: 'getGladiatorEnemies',
    duel: 'fight',
    getAttributes: 'getAttributeUpgradeCost',
    raiseAttribute: 'upgradeAttribute',
    getDungeon: 'getDungeonStatus',
    runDungeon: 'startDungeon',
    getCave: 'getCaveStatus',
    climbCave: 'caveAdvance',
    getJobs: 'getWorkList',
    startWork: 'startWork',
    finishWork: 'collectWork',
    getInventory: 'getInventory',
    sellItem: 'sellItem',
    getRunes: 'getRunes',
    upgradeRune: 'upgradeRune',
    sellRune: 'sellRune'
  };

  // Pick the first present key from a list of candidates.
  function pick(obj, keys, dflt) {
    if (!obj) return dflt;
    for (const k of keys) if (obj[k] != null) return obj[k];
    return dflt;
  }

  const Api = {
    ACTIONS,

    async call(op, params) {
      const action = ACTIONS[op] || op;
      const res = await Bridge.call(action, params);
      if (res && res.json) syncFromResponse(res.json);
      return res;
    },

    ready: () => Bridge.protocolReady(),

    async refreshUserInfo() {
      try { await Api.call('getUserInfo'); } catch (e) { Logger.debug('refreshUserInfo', e.message); }
      return State.get();
    }
  };

  /* --------------------- passive state synchronisation -------------------- */

  function syncFromResponse(json) {
    if (!json || typeof json !== 'object') return;
    // Unwrap common envelopes ({data:{...}}, {result:{...}}, {response:{...}}).
    const body = json.data || json.result || json.response || json;
    const patch = {};

    const gold = pick(body, ['gold', 'money', 'cash', 'currency']);
    if (typeof gold === 'number') patch.gold = gold;

    const level = pick(body, ['level', 'lvl', 'characterLevel']);
    if (typeof level === 'number') {
      if (State.get().level && level > State.get().level) {
        TB.Stats?.bump({ levelUps: 1 });
        TB.notifyLevelUp?.(level);
      }
      patch.level = level;
    }

    const xp = pick(body, ['experience', 'exp', 'xp']);
    if (typeof xp === 'number') patch.xp = xp;

    const bs = pick(body, ['bloodstones', 'bloodStones', 'rubies', 'premium']);
    if (typeof bs === 'number') patch.bloodstones = bs;

    const hp = pick(body, ['health', 'hp', 'currentHealth']);
    if (typeof hp === 'number') patch.health = hp;
    const maxHp = pick(body, ['maxHealth', 'maxHp', 'healthMax']);
    if (typeof maxHp === 'number') patch.maxHealth = maxHp;

    const name = pick(body, ['name', 'username', 'characterName']);
    if (typeof name === 'string') { patch.name = name; patch.loggedIn = true; }

    const guild = pick(body, ['guild', 'guildName', 'clan', 'clanName']);
    if (typeof guild === 'string') patch.guild = guild;

    // dungeon / cave availability and remaining cave attempts
    const dungeonAvail = pick(body, ['dungeonAvailable', 'canDungeon', 'dungeonReady']);
    if (typeof dungeonAvail === 'boolean') patch.dungeonAvailable = dungeonAvail;
    const caveFloor = pick(body, ['caveFloor', 'illusionFloor', 'floor']);
    if (typeof caveFloor === 'number') patch.caveFloor = caveFloor;
    const caveLeft = pick(body, ['caveAttemptsLeft', 'caveTries', 'illusionAttempts']);
    if (typeof caveLeft === 'number') patch.caveAttemptsLeft = caveLeft;

    // work return timer
    const workReturn = pick(body, ['workReturnTime', 'jobReturnTime']);
    if (typeof workReturn === 'number') patch.workReturnAt = toEpochMs(workReturn);
    const jobs = pick(body, ['jobs', 'workList', 'work']);
    if (Array.isArray(jobs)) patch.jobs = jobs;

    const free = pick(body, ['freeAdventures', 'adventuresLeft', 'questsLeft', 'remainingAdventures']);
    if (typeof free === 'number') patch.freeAdventures = free;

    // Adventure list
    const advList = pick(body, ['adventures', 'quests', 'adventureList']);
    if (Array.isArray(advList)) patch.adventureList = advList.map(normalizeAdventure);

    // Adventure timer
    const advReturn = pick(body, ['adventureReturnTime', 'returnTime', 'questReturnTime']);
    if (typeof advReturn === 'number') patch.adventureReturnAt = toEpochMs(advReturn);

    // Arena targets
    const enemies = pick(body, ['enemies', 'gladiators', 'duelTargets', 'players']);
    if (Array.isArray(enemies)) patch.duelTargets = enemies.map(normalizeEnemy);

    // Attributes
    const attrs = pick(body, ['attributes', 'stats']);
    if (attrs && typeof attrs === 'object') patch.attributes = attrs;
    const attrCost = pick(body, ['attributeCosts', 'upgradeCosts', 'costs']);
    if (attrCost && typeof attrCost === 'object') patch.attributeCosts = attrCost;

    // Inventory / runes
    const inv = pick(body, ['inventory', 'items', 'bag']);
    if (Array.isArray(inv)) patch.inventory = inv.map(normalizeItem);
    const runes = pick(body, ['runes']);
    if (Array.isArray(runes)) patch.runes = runes;

    if (Object.keys(patch).length) State.patch(patch);
  }

  function toEpochMs(v) {
    // Tanoth may send seconds-until, or an absolute timestamp. Heuristic:
    // small numbers (< 1e6) are "seconds remaining", large are epoch seconds.
    if (v < 1e6) return Date.now() + v * 1000;
    if (v < 1e12) return v * 1000;
    return v;
  }

  function normalizeAdventure(a) {
    return {
      id: pick(a, ['id', 'adventureId', 'questId']),
      name: pick(a, ['name', 'title'], ''),
      difficulty: pick(a, ['difficulty', 'level', 'diff'], 0),
      duration: pick(a, ['duration', 'time', 'durationSeconds'], 0),
      xp: pick(a, ['xp', 'experience', 'exp'], 0),
      gold: pick(a, ['gold', 'reward', 'money'], 0),
      winChance: pick(a, ['winChance', 'successChance', 'chance'], 100),
      raw: a
    };
  }

  function normalizeEnemy(e) {
    return {
      id: pick(e, ['id', 'playerId', 'userId']),
      name: pick(e, ['name', 'username'], ''),
      level: pick(e, ['level', 'lvl'], 0),
      gold: pick(e, ['gold', 'reward'], 0),
      guild: pick(e, ['guild', 'guildName', 'clan'], null),
      raw: e
    };
  }

  function normalizeItem(i) {
    return {
      id: pick(i, ['id', 'itemId']),
      name: pick(i, ['name', 'title'], ''),
      rarity: String(pick(i, ['rarity', 'quality', 'grade'], 'common')).toLowerCase(),
      type: pick(i, ['type', 'category'], 'misc'),
      value: pick(i, ['value', 'sellPrice', 'price', 'gold'], 0),
      raw: i
    };
  }

  // Keep state fresh from traffic the *game* generates too.
  Bridge.onObserve((payload) => {
    if (payload && payload.json) syncFromResponse(payload.json);
  });

  TB.Api = Api;
})();
