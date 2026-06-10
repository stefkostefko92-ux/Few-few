/**
 * Tanoth XML-RPC API (semantic layer).
 *
 * Wraps the page-world client (Bridge.callXmlRpc) with typed, high-level
 * operations and parses the XML-RPC responses into plain objects, updating the
 * shared State as it goes. Method names and response field names are taken
 * from the live Tanoth client (verified against the open-source BoTanoth bot):
 *
 *   MiniUpdate(sid)                      -> gold (i4), bs (i4), running task time/type
 *   GetAdventures(sid)                   -> array<struct{difficulty,gold,exp,duration,quest_id}>
 *                                           + adventures_made_today, free_adventures_per_day
 *   StartAdventure(sid, quest_id:int)
 *   GetUserAttributes(sid)               -> cost base/factor/increment + *_bought
 *   RaiseAttribute(sid, name:string, count:int)
 *   EvocationCircle_getCircle(sid)       -> struct of "a:b:c:..." node strings
 *   EvocationCircle_buyNode(sid, "gold":string, node:int, count:int)
 *
 * Optional/secondary methods (arena, dungeon, etc.) are resolved at runtime
 * from the method names the bot observes in the game's own traffic, so they can
 * be used without hard-coding names that may vary by server revision.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Bridge, State, Logger } = TB;

  const parser = new DOMParser();

  function parse(xml) {
    return parser.parseFromString(xml, 'text/xml');
  }

  // Mirror of the reference client's findValueByName: locate a <member> by
  // <name> and return its typed value's text.
  function findValue(node, name, type = 'i4') {
    const members = Array.from(node.getElementsByTagName('member'));
    const member = members.find((m) => {
      const n = m.getElementsByTagName('name')[0];
      return n && n.textContent === name;
    });
    if (!member) return null;
    const value = member.getElementsByTagName('value')[0];
    if (!value) return null;
    const target = value.getElementsByTagName(type)[0];
    return target ? target.textContent : null;
  }

  function num(v) { const n = parseInt(v, 10); return Number.isNaN(n) ? null : n; }

  // True only if `name` is a DIRECT <member> child of `node`. Needed because
  // findValue() searches descendants, so the outer response <struct> would
  // otherwise match a nested monster/item's field and create a phantom entry.
  function directHas(node, name) {
    for (const child of Array.from(node.children || [])) {
      if (!child.tagName || child.tagName.toLowerCase() !== 'member') continue;
      const n = child.getElementsByTagName('name')[0];
      if (n && n.textContent === name) return true;
    }
    return false;
  }

  async function rpc(method, params) {
    const res = await Bridge.callXmlRpc(method, params);
    const doc = parse(res.xml);
    // XML-RPC faults come back HTTP 200 with a <fault> body. Only treat genuine
    // session/auth faults as a lost session (-> auto-login). Ordinary faults
    // (not enough gold, on cooldown, daily limit, invalid action, ...) become a
    // plain FAULT error the caller/module handles or that counts toward the
    // error-stop - never a wrongful page reload or an infinite transient retry.
    const fault = doc.querySelector('methodResponse > fault');
    if (fault) {
      const faultStr = findValue(doc, 'faultString', 'string') || '';
      if (/session|not logged|logged out|auth|expired|invalid sid|\bsid\b/i.test(faultStr)) {
        State.patch({ loggedIn: false, sessionLost: Date.now() });
        throw new Error('SESSION_EXPIRED:' + faultStr);
      }
      throw new Error('FAULT:' + (faultStr || method));
    }
    return doc;
  }

  const Api = {
    ready: () => Bridge.ready(),

    /* --------------------------- resources -------------------------- */
    async miniUpdate() {
      const doc = await rpc('MiniUpdate', []);
      const gold = num(findValue(doc, 'gold', 'i4'));
      const bs = num(findValue(doc, 'bs', 'i4'));
      const taskTime = num(findValue(doc, 'time', 'i4'));
      const taskType = findValue(doc, 'type', 'string');
      const patch = {};
      if (gold != null) patch.gold = gold;
      if (bs != null) patch.bloodstones = bs;
      if (taskTime != null && taskTime > 0) {
        patch.taskType = taskType;
        patch.adventureReturnAt = Date.now() + taskTime * 1000;
      }
      State.patch(patch);
      return { gold, bloodstones: bs, taskTime, taskType };
    },

    /* --------------------------- adventures ------------------------- */
    async getAdventures() {
      const doc = await rpc('GetAdventures', []);
      const adventures = Array.from(doc.querySelectorAll('array > data > value > struct')).map((s) => ({
        id: num(findValue(s, 'quest_id', 'i4')),
        difficulty: num(findValue(s, 'difficulty', 'i4')),
        gold: num(findValue(s, 'gold', 'i4')) || 0,
        xp: num(findValue(s, 'exp', 'i4')) || 0,
        duration: num(findValue(s, 'duration', 'i4')) || 0
      }));
      const madeToday = num(findValue(doc, 'adventures_made_today', 'i4'));
      const freePerDay = num(findValue(doc, 'free_adventures_per_day', 'i4'));
      const taskRunning = madeToday == null; // field absent while a task runs

      const patch = { adventureList: adventures };
      if (madeToday != null && freePerDay != null) {
        patch.adventuresMadeToday = madeToday;
        patch.freeAdventuresPerDay = freePerDay;
        patch.freeAdventures = Math.max(0, freePerDay - madeToday);
      }
      State.patch(patch);
      return { adventures, madeToday, freePerDay, taskRunning };
    },

    async startAdventure(questId) {
      await rpc('StartAdventure', [{ type: 'int', value: questId }]);
    },

    /* ---------------------------- attributes ------------------------ */
    async getUserAttributes() {
      const doc = await rpc('GetUserAttributes', []);
      const base = parseFloat(findValue(doc, 'attributeCostBase', 'i4'));
      const factor = parseFloat(findValue(doc, 'attributeCostFactor', 'double'));
      const increment = parseFloat(findValue(doc, 'attributeCostIncrement', 'i4'));
      const calc = (bought) => Math.floor((base + bought * increment) * factor);
      const costs = {
        STR: calc(num(findValue(doc, 'str_bought', 'i4')) || 0),
        DEX: calc(num(findValue(doc, 'dex_bought', 'i4')) || 0),
        CON: calc(num(findValue(doc, 'con_bought', 'i4')) || 0),
        INT: calc(num(findValue(doc, 'int_bought', 'i4')) || 0)
      };
      State.patch({ attributeCosts: costs });
      return costs;
    },

    async raiseAttribute(name) {
      const doc = await rpc('RaiseAttribute', [
        { type: 'string', value: name },
        { type: 'int', value: 1 }
      ]);
      // Response echoes new costs; re-read them.
      const base = parseFloat(findValue(doc, 'attributeCostBase', 'i4'));
      if (!Number.isNaN(base)) {
        const factor = parseFloat(findValue(doc, 'attributeCostFactor', 'double'));
        const increment = parseFloat(findValue(doc, 'attributeCostIncrement', 'i4'));
        const calc = (b) => Math.floor((base + b * increment) * factor);
        State.patch({ attributeCosts: {
          STR: calc(num(findValue(doc, 'str_bought', 'i4')) || 0),
          DEX: calc(num(findValue(doc, 'dex_bought', 'i4')) || 0),
          CON: calc(num(findValue(doc, 'con_bought', 'i4')) || 0),
          INT: calc(num(findValue(doc, 'int_bought', 'i4')) || 0)
        } });
      }
    },

    /* ------------------------- evocation circle --------------------- */
    async getCircle() {
      const doc = await rpc('EvocationCircle_getCircle', []);
      const members = Array.from(doc.getElementsByTagName('member'));
      const circle = {};
      members.forEach((m) => {
        const name = m.getElementsByTagName('name')[0]?.textContent;
        const str = m.getElementsByTagName('string')[0]?.textContent;
        if (name && str) circle[name] = str.split(':').map(Number);
      });
      State.patch({ circle });
      return circle;
    },

    // EvocationCircle_buyNode(currencyType:string, stoneId:int, multiple:int)
    async buyCircleNode(nodeId, currency = 'gold', multiple = 1) {
      await rpc('EvocationCircle_buyNode', [
        { type: 'string', value: currency },
        { type: 'int', value: nodeId },
        { type: 'int', value: multiple }
      ]);
    },

    /* ----------------------- generic escape hatch ------------------- */
    // For optional modules that resolve a method name at runtime.
    async raw(method, params) { return rpc(method, params); },
    findValue,
    directHas,

    /* --------------------------- dungeon ---------------------------- */
    async getDungeon() {
      const doc = await rpc('GetDungeon', []);
      const info = {
        freeTries: num(findValue(doc, 'free_tries_today', 'i4')) || 0,
        madeToday: num(findValue(doc, 'dungeon_made_today', 'i4')) || 0,
        level: num(findValue(doc, 'dungeon_level', 'i4')) || 0,
        maxLevel: num(findValue(doc, 'max_dungeon_level', 'i4')) || 0
      };
      State.patch({ dungeon: info });
      return info;
    },
    async startDungeon() { await rpc('StartDungeon', []); },

    /* ----------------------- shadow dungeon ------------------------- */
    async startShadowdungeon() { await rpc('StartShadowdungeon', []); },
    async fightShadowdungeon() { return rpc('FightShadowdungeon', []); },
    async claimShadowdungeon() { return rpc('ClaimShadowdungeon', []); },

    /* ----------------------- event / mission quest ------------------ */
    async getGameEvent() {
      const doc = await rpc('GetGameEvent', []);
      return {
        questId: num(findValue(doc, 'quest_id', 'i4')) || 0,
        rewardGold: num(findValue(doc, 'reward_gold', 'i4')) || 0,
        rewardExp: num(findValue(doc, 'reward_exp', 'i4')) || 0
      };
    },
    async startEventAction() { await rpc('StartEventAction', []); },

    /* ----------------------------- guild ---------------------------- */
    async guildSpendGold(value) { await rpc('Guild_SpendGold', [{ type: 'int', value }]); },

    /* ----------------------------- work ----------------------------- */
    async getWorkData() {
      const doc = await rpc('GetWorkData', []);
      const info = {
        maxHours: num(findValue(doc, 'max_working_hours', 'i4')) || 0,
        goldFee: num(findValue(doc, 'gold_fee', 'i4')) || 0
      };
      State.patch({ work: info });
      return info;
    },
    async startWork(hours) { await rpc('StartWork', [{ type: 'int', value: hours }]); },
    async cancelWork() { await rpc('CancelWork', []); },

    /* ----------------------------- pvp ------------------------------ */
    async fight(opponentName) {
      const doc = await rpc('Fight', [{ type: 'string', value: opponentName }]);
      // Reward fields live under the "answer" struct; findValue reads them anywhere.
      return {
        won: /1|true|win/i.test(findValue(doc, 'won', 'i4') || findValue(doc, 'victory', 'boolean') || ''),
        gold: num(findValue(doc, 'reward_gold', 'i4')) || 0,
        exp: num(findValue(doc, 'reward_exp', 'i4')) || 0
      };
    },

    /* --------------------------- map events ------------------------- */
    async getCaveDetails() { return rpc('GetCaveDetails', []); },
    async startIllusionCave() { await rpc('StartIllusionCave', []); },
    async getDragonDetails() { return rpc('GetDragonDetails', []); },
    async startDragon() { await rpc('StartDragon', []); },

    /* ------------------- map liberation (encounters) ---------------- */
    async getMapDetails() { return rpc('GetMapDetails', []); },
    async getLiberationDetails() { return rpc('GetLiberationDetails', []); },
    // StartLiberation takes the monster's map slot (location).
    async startLiberation(location) { return rpc('StartLiberation', [{ type: 'int', value: location }]); },
    async buyLiberationEnergy() { await rpc('BuyLiberationEnergy', []); },

    // Parse the liberation map: { energy, energyCost, nextAttack(epoch s), monsters:[...] }
    parseMap(doc) {
      const energy = num(findValue(doc, 'energy', 'i4'));
      const energyCost = num(findValue(doc, 'energy_cost', 'i4'));
      const nextAttack = num(findValue(doc, 'next_attack', 'i4'));
      const monsters = Array.from(doc.querySelectorAll('struct'))
        .filter((s) => directHas(s, 'location') && directHas(s, 'stars'))   // real monster structs only
        .map((s) => ({
          location: num(findValue(s, 'location', 'i4')),
          stars: num(findValue(s, 'stars', 'i4')) || 0,
          pictureId: num(findValue(s, 'picture_id', 'i4')) || 0,
          special: num(findValue(s, 'special_type', 'i4')) || 0
        }));
      return { energy, energyCost, nextAttack, monsters };
    },

    /* --------------------------- inventory -------------------------- */
    async getEquipment() { return rpc('GetEquipment', []); },
    // SellItem(id, char_id|0, itemXpos)
    async sellItem(id, xpos) {
      await rpc('SellItem', [
        { type: 'int', value: id },
        { type: 'int', value: 0 },
        { type: 'int', value: xpos }
      ]);
    },

    async refresh() {
      try { await Api.miniUpdate(); } catch (e) { Logger.debug('miniUpdate', e.message); }
      return State.get();
    }
  };

  TB.Api = Api;
})();
