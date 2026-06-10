/**
 * Dungeon module (verified: GetDungeon / StartDungeon).
 *
 * Runs the daily dungeon while free tries remain and no other task is in
 * progress. GetDungeon reports `free_tries_today` / `dungeon_made_today`; when
 * the tries are spent the module backs off until the daily reset.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let cooldownUntil = 0;
  let lastCheck = 0;
  function cfg() { return Storage.section('dungeon') || {}; }
  function busy() { return State.get().adventureReturnAt > Date.now(); }

  Scheduler.register({
    id: 'dungeon',
    priority: 75,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready() || busy()) return null;
      if (Date.now() < cooldownUntil) return null;

      const info = State.get().dungeon || {};
      if (!Object.keys(info).length || Date.now() - lastCheck > 120000) {
        return async () => { lastCheck = Date.now(); await Api.getDungeon(); };
      }

      if ((info.freeTries || 0) <= 0) {
        cooldownUntil = Date.now() + 30 * 60000; // re-check in 30 min
        return null;
      }

      return async () => {
        Logger.info(I18n.t('logDungeonStart', [String(info.level || 0)]));
        await Api.startDungeon();
        await Api.miniUpdate();        // picks up a running-task timer if any
        Stats.bump({ dungeonRuns: 1 });
        // Optimistically drop a try and force a fresh GetDungeon next cycle.
        State.patch({ dungeon: Object.assign({}, info, { freeTries: (info.freeTries || 1) - 1 }) });
        lastCheck = 0;
        // Local cooldown so we never re-fire StartDungeon back-to-back even if
        // MiniUpdate didn't surface a running-task timer for the dungeon.
        cooldownUntil = Date.now() + 30000;
        Logger.success(I18n.t('logDungeonDone'));
      };
    }
  });
})();
