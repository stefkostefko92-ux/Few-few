/**
 * Map events module (verified: StartIllusionCave / StartDragon).
 *
 * Cycles the optional map activities — the Cave of Illusions and the Dragon
 * event — on a cooldown whenever the character is free. These are limited
 * activities, so the module simply attempts an enabled one each interval; if it
 * isn't currently available the attempt is a no-op and the cooldown prevents
 * hammering the server.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let cooldownUntil = 0;
  let turn = 0;
  function cfg() { return Storage.section('map') || {}; }
  function busy() { return State.get().adventureReturnAt > Date.now(); }

  Scheduler.register({
    id: 'map',
    priority: 68,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready() || busy()) return null;
      if (Date.now() < cooldownUntil) return null;

      const activities = [];
      if (c.illusionCave) activities.push('cave');
      if (c.dragon) activities.push('dragon');
      if (!activities.length) return null;

      const pick = activities[turn % activities.length];
      turn++;

      return async () => {
        cooldownUntil = Date.now() + Math.max(5, Number(c.cooldownMinutes) || 30) * 60000;
        if (pick === 'cave') {
          Logger.info(I18n.t('logCaveStart'));
          await Api.startIllusionCave();
          Stats.bump({ caveRuns: 1 });
        } else {
          Logger.info(I18n.t('logDragonStart'));
          await Api.startDragon();
          Stats.bump({ dragonRuns: 1 });
        }
        await Api.miniUpdate();
      };
    }
  });
})();
