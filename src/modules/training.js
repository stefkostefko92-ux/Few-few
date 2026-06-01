/**
 * Training module — raises character attributes via RaiseAttribute (verified).
 *
 * Tanoth attributes are STR / DEX / CON / INT. With "mix" the cheapest
 * attribute is bought (best value), otherwise the chosen attribute is bought
 * while gold remains above the reserve and below the optional spend cap.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  const MAP = { strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT' };
  let spent = 0;

  function cfg() { return Storage.section('training') || {}; }
  function cheapest(costs) {
    return Object.entries(costs).reduce((m, [k, v]) => (v < m[1] ? [k, v] : m), ['STR', Infinity])[0];
  }

  Scheduler.register({
    id: 'training',
    priority: 25,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;
      if (State.get().adventureReturnAt <= Date.now()) {
        // Defer to the adventure module while the character is free to act.
        if ((Storage.section('adventures') || {}).enabled) return null;
      }

      const st = State.get();
      if (!Object.keys(st.attributeCosts || {}).length) {
        return async () => { await Api.getUserAttributes(); };
      }

      const reserve = c.keepGoldReserve || 0;
      const available = (st.gold || 0) - reserve;
      if (available <= 0) return null;
      if (c.maxGoldSpend && spent >= c.maxGoldSpend) return null;

      const stat = c.priorityStat === 'mix' ? cheapest(st.attributeCosts) : (MAP[c.priorityStat] || 'STR');
      const cost = st.attributeCosts[stat];
      if (cost == null || cost > available) return null;

      return async () => {
        Logger.info(I18n.t('logTrain', [stat, String(cost)]));
        await Api.raiseAttribute(stat);
        spent += cost;
        Stats.bump({ attributesRaised: 1 });
        State.patch({ gold: (State.get().gold || 0) - cost });
        await Api.miniUpdate();
      };
    }
  });
})();
