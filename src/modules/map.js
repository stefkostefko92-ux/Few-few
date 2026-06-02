/**
 * Map events module (verified: GetCaveDetails/StartIllusionCave,
 * GetDragonDetails/StartDragon).
 *
 * Cycles the optional map activities — the Cave of Illusions and the Dragon
 * event — on a cooldown whenever the character is free. Each attempt first
 * queries the details endpoint (so any reward/availability is logged) and then
 * starts the activity, logging the outcome so it's never a silent no-op. If an
 * activity isn't currently available the start is harmless and the cooldown
 * prevents hammering.
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
      if (!c.enabled || !Api.ready()) return null;
      if (busy()) return null;
      if (Date.now() < cooldownUntil) return null;

      const activities = [];
      if (c.illusionCave) activities.push('cave');
      if (c.dragon) activities.push('dragon');
      if (!activities.length) return null;

      const pick = activities[turn % activities.length];
      turn++;

      return async () => {
        cooldownUntil = Date.now() + Math.max(2, Number(c.cooldownMinutes) || 10) * 60000;
        try {
          if (pick === 'cave') {
            const doc = await Api.getCaveDetails();
            const reward = Api.findValue(doc, 'reward_gold', 'i4');
            Logger.info(I18n.t('logCaveStart', [reward != null ? String(reward) : '?']));
            await Api.startIllusionCave();
            Stats.bump({ caveRuns: 1 });
          } else {
            const doc = await Api.getDragonDetails();
            const reward = Api.findValue(doc, 'reward_gold', 'i4');
            Logger.info(I18n.t('logDragonStart', [reward != null ? String(reward) : '?']));
            await Api.startDragon();
            Stats.bump({ dragonRuns: 1 });
          }
          await Api.miniUpdate();
        } catch (e) {
          Logger.warn(I18n.t('logMapUnavailable', [pick, e.message]));
        }
      };
    }
  });
})();
