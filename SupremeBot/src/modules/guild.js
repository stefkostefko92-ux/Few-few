// Optional gold sink: donate surplus gold to the guild treasury.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let cooldownUntil = 0;
  function cfg() { return Storage.section('guild') || {}; }

  Scheduler.register({
    id: 'guild',
    priority: 6,
    async tick() {
      const c = cfg();
      if (!c.enabled || !c.donateGold || !Api.ready()) return null;
      if (Date.now() < cooldownUntil) { Scheduler.wakeAt(cooldownUntil); return null; }

      return async () => {
        await Api.miniUpdate();                       // fresh gold
        const gold = Number(State.get().gold) || 0;
        const gen = Storage.section('general') || {};
        const reserve = Math.max(Number(gen.keepGoldReserve) || 0, Number(c.keepGoldReserve) || 0);
        const surplus = gold - reserve;
        if (surplus < (Number(c.minDonation) || 1000)) {
          cooldownUntil = Date.now() + 5 * 60000;     // not enough surplus yet
          return;
        }
        Logger.info(I18n.t('logGuildDonate', [String(surplus)]));
        await Api.guildSpendGold(surplus);
        Stats.bump({ goldDonated: surplus });
        State.patch({ gold: gold - surplus });
      };
    }
  });
})();
