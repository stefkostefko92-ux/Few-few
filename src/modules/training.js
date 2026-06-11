// Spend gold raising STR/DEX/CON/INT (or whichever is cheapest).
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const MAP = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT' };

  // The daily spend cap survives page reloads via sessionStorage.
  const SS_KEY = 'tb_training';
  function loadPersisted() {
    try {
      const v = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
      return { spent: Number(v.spent) || 0, spentDay: v.spentDay || new Date().toDateString() };
    } catch (_) { return { spent: 0, spentDay: new Date().toDateString() }; }
  }
  function persist() {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ spent, spentDay })); } catch (_) {}
  }

  let { spent, spentDay } = loadPersisted();
  let lastSkipLog = 0;
  let costsFetchAt = 0;

  function cfg() { return Storage.section('training') || {}; }
  function rolloverDay() {
    const d = new Date().toDateString();
    if (d !== spentDay) { spentDay = d; spent = 0; persist(); }   // reset the spend cap daily
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
        // Throttled: if the server response lacks cost fields, an unthrottled
        // refetch would fire every single cycle.
        if (Date.now() < costsFetchAt) return null;
        costsFetchAt = Date.now() + 60000;
        return async () => {
          const fetched = await Api.getUserAttributes();
          await Api.miniUpdate();
          // Show what was actually parsed, so a silent no-buy is explainable
          // from the panel log (empty costs point at a response-layout issue).
          if (fetched && Number.isFinite(fetched.STR)) {
            Logger.info(I18n.t('logTrainCosts', [String(fetched.STR), String(fetched.DEX), String(fetched.CON), String(fetched.INT), String(Number(State.get().gold) || 0)]));
          }
        };
      }
      if (c.maxGoldSpend && spent >= c.maxGoldSpend) { noteSkip('logTrainSkipCap'); return null; }

      const stat = c.priorityStat === 'mix' ? cheapest(costs) : (MAP[c.priorityStat] || 'STR');
      const cost = costs[stat];
      if (!Number.isFinite(cost)) return null;

      // Gate on the cached gold (kept fresh by the 30s global MiniUpdate) so we
      // don't poll the server every cycle while unaffordable. The reserve is
      // the stricter of the global and the per-module setting.
      const g = Storage.section('general') || {};
      const reserve = Math.max(Number(g.keepGoldReserve) || 0, Number(c.keepGoldReserve) || 0);
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
        persist();
        Stats.bump({ attributesRaised: 1 });
        State.patch({ gold: gold - cost });
        await Api.getUserAttributes(); // refresh costs (level changed)
      };
    }
  });
})();
