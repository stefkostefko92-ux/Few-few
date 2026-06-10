/**
 * Dungeon module (verified: GetDungeon / StartDungeon, + Shadow dungeon:
 * StartShadowdungeon / FightShadowdungeon / ClaimShadowdungeon).
 *
 * Runs the daily dungeon while free tries remain. Mode 'normal' does a normal
 * run; mode 'shadow' descends the Shadow dungeon (start -> fight rounds ->
 * claim) — both consume the same daily tries. Backs off when tries are spent.
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

      const shadow = c.mode === 'shadow';
      return async () => {
        if (shadow) {
          // Start -> fight a bounded number of rounds (stop early on any fault,
          // e.g. defeat) -> claim the accumulated reward.
          Logger.info(I18n.t('logShadowStart'));
          await Api.startShadowdungeon();
          const rounds = Math.max(1, Math.min(50, Number(c.shadowRounds) || 10));
          let fought = 0;
          for (let i = 0; i < rounds; i++) {
            try { await Api.fightShadowdungeon(); fought++; }
            catch (e) { break; }   // defeat / no more floors
          }
          try { await Api.claimShadowdungeon(); } catch (_) {}
          Stats.bump({ shadowRuns: 1 });
          Logger.success(I18n.t('logShadowDone', [String(fought)]));
        } else {
          Logger.info(I18n.t('logDungeonStart', [String(info.level || 0)]));
          await Api.startDungeon();
          Stats.bump({ dungeonRuns: 1 });
          Logger.success(I18n.t('logDungeonDone'));
        }
        await Api.miniUpdate();        // picks up a running-task timer if any
        // Optimistically drop a try and force a fresh GetDungeon next cycle.
        State.patch({ dungeon: Object.assign({}, info, { freeTries: (info.freeTries || 1) - 1 }) });
        lastCheck = 0;
        // Local cooldown so we never re-fire back-to-back even if MiniUpdate
        // didn't surface a running-task timer.
        cooldownUntil = Date.now() + 30000;
      };
    }
  });
})();
