/**
 * Training module — raises character attributes via RaiseAttribute (verified).
 *
 * Tanoth attributes are STR / DEX / CON / INT. With "mix" the cheapest
 * attribute is bought (best value), otherwise the chosen attribute is bought
 * while gold remains above the reserve and below the optional spend cap.
 * Runs while the character is busy on an adventure so the daily loop and the
 * gold-sink loop progress together.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const MAP = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT' };
  let spent = 0;
  let lastSkipLog = 0;

  function cfg() { return Storage.section('training') || {}; }

  function cheapest(costs) {
    let best = null, min = Infinity;
    for (const [k, v] of Object.entries(costs)) {
      if (Number.isFinite(v) && v < min) { min = v; best = k; }
    }
    return best;
  }

  function noteSkip(key, subs) {
    if (Date.now() - lastSkipLog > 60000) { // throttle skip messages
      lastSkipLog = Date.now();
      Logger.debug(I18n.t(key, subs));
    }
  }

  Scheduler.register({
    id: 'training',
    priority: 25,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;

      const st = State.get();
      // Refresh the cost table if we don't have valid numbers yet.
      const costs = st.attributeCosts || {};
      const haveCosts = Object.values(costs).some((v) => Number.isFinite(v));
      if (!haveCosts) {
        return async () => {
          await Api.getUserAttributes();
          await Api.miniUpdate(); // make sure gold is current too
        };
      }

      const reserve = c.keepGoldReserve || 0;
      const gold = Number(st.gold) || 0;
      const available = gold - reserve;
      if (available <= 0) { noteSkip('logTrainSkipReserve', [String(reserve)]); return null; }
      if (c.maxGoldSpend && spent >= c.maxGoldSpend) { noteSkip('logTrainSkipCap'); return null; }

      const stat = c.priorityStat === 'mix' ? cheapest(costs) : (MAP[c.priorityStat] || 'STR');
      const cost = costs[stat];
      if (!Number.isFinite(cost)) return null;
      if (cost > available) { noteSkip('logTrainSkipGold', [stat, String(cost)]); return null; }

      return async () => {
        Logger.info(I18n.t('logTrain', [stat, String(cost)]));
        await Api.raiseAttribute(stat);
        spent += cost;
        Stats.bump({ attributesRaised: 1 });
        State.patch({ gold: gold - cost });
        await Api.miniUpdate();
      };
    }
  });
})();
