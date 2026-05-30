/**
 * Dungeon module — runs the daily dungeon when available, gated on a minimum
 * health percentage so the bot does not throw away a run while wounded.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastCheck = 0;
  function cfg() { return Storage.section('dungeon') || {}; }

  Scheduler.register({
    id: 'dungeon',
    priority: 70,
    async tick() {
      const c = cfg();
      if (!c.enabled || !c.autoRun) return null;
      const st = State.get();

      if (Date.now() - lastCheck > 120000) {
        return async () => { lastCheck = Date.now(); await Api.call('getDungeon'); };
      }
      if (!st.dungeonAvailable) return null;
      if (State.healthPercent() < c.minHealthPercent) {
        Logger.debug('skipping dungeon: low HP');
        return null;
      }

      return async () => {
        Logger.info(I18n.t('logDungeon', [c.difficulty]));
        const res = await Api.call('runDungeon', { difficulty: c.difficulty });
        const j = res.json || {};
        Stats.bump({ dungeonRuns: 1, goldEarned: j.gold || 0, xpEarned: j.xp || 0 });
        State.patch({ dungeonAvailable: false });
        Logger.success(I18n.t('logDungeonDone'));
        await Api.refreshUserInfo();
      };
    }
  });
})();
