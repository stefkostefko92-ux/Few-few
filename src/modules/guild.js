/**
 * Guild module (verified: Guild_SpendGold).
 *
 * An optional gold sink: donates surplus gold to the guild treasury, keeping a
 * reserve. Useful if you'd rather bank gold into guild upgrades than the circle
 * or attributes. Disabled by default. (Guild creation/invites/fights are
 * intentionally NOT automated — they affect other players.)
 */
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
        const reserve = Number(c.keepGoldReserve) || 0;
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
