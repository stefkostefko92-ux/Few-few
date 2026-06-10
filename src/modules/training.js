// Spend gold raising STR/DEX/CON/INT (or whichever is cheapest).
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const MAP = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT' };
  let spent = 0;
  let spentDay = new Date().toDateString();
  let lastSkipLog = 0;

  function cfg() { return Storage.section('training') || {}; }
  function rolloverDay() {
    const d = new Date().toDateString();
    if (d !== spentDay) { spentDay = d; spent = 0; }   // reset the spend cap daily
  }

  function cheapest(costs) {
    let best = null, min = Infinity;
    for (const [k, v] of Object.entries(costs)) {
      if (Number.isFinite(v) && v < min) { min = v; best = k; }
    }
    return best;
  }

  function noteSkip(key, subs) {
    if (Date.now() - lastSkipLog > 60000) { lastSkipLog = Date.now(); Logger.info(I18n.t(key, subs)); }
  }

  Scheduler.register({
    id: 'training',
    priority: 25,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;
      rolloverDay();

      const costs = State.get().attributeCosts || {};
      const haveCosts = Object.values(costs).some((v) => Number.isFinite(v));
      if (!haveCosts) {
        return async () => { await Api.getUserAttributes(); await Api.miniUpdate(); };
      }
      if (c.maxGoldSpend && spent >= c.maxGoldSpend) { noteSkip('logTrainSkipCap'); return null; }

      const stat = c.priorityStat === 'mix' ? cheapest(costs) : (MAP[c.priorityStat] || 'STR');
      const cost = costs[stat];
      if (!Number.isFinite(cost)) return null;

      // Gate on the cached gold (kept fresh by the 30s global MiniUpdate) so we
      // don't poll the server every cycle while unaffordable.
      const reserve = c.keepGoldReserve || 0;
      const cachedGold = Number(State.get().gold) || 0;
      if (cost > cachedGold - reserve) {
        noteSkip('logTrainSkipGold', [stat, String(cost), String(cachedGold)]);
        return null;
      }

      return async () => {
        // Final safety re-check on fresh gold right before spending.
        await Api.miniUpdate();
        const gold = Number(State.get().gold) || 0;
        if (cost > gold - reserve) return;
        Logger.info(I18n.t('logTrain', [stat, String(cost)]));
        await Api.raiseAttribute(stat);
        spent += cost;
        Stats.bump({ attributesRaised: 1 });
        State.patch({ gold: gold - cost });
        await Api.getUserAttributes(); // refresh costs (level changed)
      };
    }
  });
})();
