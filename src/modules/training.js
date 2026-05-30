/**
 * Training / attribute upgrade module ("arcane upgrades").
 *
 * Spends surplus gold raising a priority attribute, falling back to a second
 * choice when the priority upgrade is unaffordable, and always honouring the
 * configured gold reserve and optional spend cap.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let spentThisSession = 0;
  let lastCostAt = 0;

  function cfg() { return Storage.section('training') || {}; }

  Scheduler.register({
    id: 'training',
    priority: 30,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();

      // Refresh upgrade costs periodically.
      if (!Object.keys(st.attributeCosts || {}).length || Date.now() - lastCostAt > 60000) {
        return async () => { lastCostAt = Date.now(); await Api.call('getAttributes'); };
      }

      const reserve = c.keepGoldReserve || 0;
      const available = (st.gold || 0) - reserve;
      if (available <= 0) return null;
      if (c.maxGoldSpend && spentThisSession >= c.maxGoldSpend) return null;

      const costFor = (stat) => st.attributeCosts[stat] ?? Infinity;
      let stat = c.priorityStat;
      if (costFor(stat) > available) stat = c.fallbackStat;
      const cost = costFor(stat);
      if (cost > available || !isFinite(cost)) return null;

      return async () => {
        Logger.info(I18n.t('logTrain', [stat, String(cost)]));
        await Api.call('raiseAttribute', { attribute: stat, stat, attr: stat });
        spentThisSession += cost;
        State.patch({ gold: (st.gold || 0) - cost, attributeCosts: {} });
        await Api.refreshUserInfo();
      };
    }
  });
})();
