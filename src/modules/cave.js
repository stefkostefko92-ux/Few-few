/**
 * Cave of Illusions module — climbs floors for XP/loot, optionally spending
 * bloodstones to keep climbing past the free attempts, up to an optional
 * target floor.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastCheck = 0;
  function cfg() { return Storage.section('cave') || {}; }

  Scheduler.register({
    id: 'cave',
    priority: 80,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();

      if (Date.now() - lastCheck > 90000) {
        return async () => { lastCheck = Date.now(); await Api.call('getCave'); };
      }

      if (c.targetFloor && st.caveFloor >= c.targetFloor) return null;

      // The game tracks free attempts; we mirror that via caveAttemptsLeft if present.
      const free = st.caveAttemptsLeft ?? 1;
      const canBloodstone = c.useBloodstones && st.bloodstones > c.bloodstoneReserve;
      if (free <= 0 && !canBloodstone) return null;

      return async () => {
        Logger.info(I18n.t('logCave', [String(st.caveFloor + 1)]));
        const res = await Api.call('climbCave', {
          useBloodstone: free <= 0 && canBloodstone ? 1 : 0
        });
        const j = res.json || {};
        const advanced = j.advanced ?? j.won ?? true;
        if (advanced) {
          Stats.bump({ caveFloors: 1, xpEarned: j.xp || 0, goldEarned: j.gold || 0 });
          State.patch({ caveFloor: st.caveFloor + 1 });
          Logger.success(I18n.t('logCaveAdvanced', [String(st.caveFloor + 1)]));
        } else {
          Logger.warn(I18n.t('logCaveFailed'));
          State.patch({ caveAttemptsLeft: 0 });
        }
        lastCheck = 0; // force a re-check next cycle
      };
    }
  });
})();
