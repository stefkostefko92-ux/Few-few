/**
 * Combat / Arena module — automated duels.
 *
 * Picks opponents from the arena list using a configurable strategy, while
 * respecting guild-member protection and a relative level band. Records each
 * outcome so the panel can show a win/loss breakdown.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let duelsThisCycle = 0;
  let lastListAt = 0;
  const myGuild = () => State.get().guild;

  function cfg() { return Storage.section('combat') || {}; }

  function chooseTarget(list, c, myLevel) {
    let pool = list.filter((e) => {
      if (c.avoidGuildMembers && e.guild && myGuild() && e.guild === myGuild()) return false;
      const diff = (e.level || 0) - (myLevel || 0);
      return diff >= c.minLevelDiff && diff <= c.maxLevelDiff;
    });
    if (!pool.length) return null;
    const by = {
      weakest: (a, b) => (a.level || 0) - (b.level || 0),
      lowestLevel: (a, b) => (a.level || 0) - (b.level || 0),
      highestGold: (a, b) => (b.gold || 0) - (a.gold || 0),
      random: () => Math.random() - 0.5
    };
    return pool.sort(by[c.targetStrategy] || by.weakest)[0];
  }

  Scheduler.register({
    id: 'combat',
    priority: 60,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      if (duelsThisCycle >= c.maxDuelsPerCycle) {
        // reset the per-cycle counter roughly every few minutes
        if (Date.now() - lastListAt > 180000) duelsThisCycle = 0;
        return null;
      }

      const st = State.get();
      if (!st.duelTargets.length || Date.now() - lastListAt > 120000) {
        return async () => { lastListAt = Date.now(); await Api.call('getArenaList'); };
      }

      const target = chooseTarget(st.duelTargets, c, st.level);
      if (!target) { Logger.debug('no eligible duel target'); return null; }

      return async () => {
        Logger.info(I18n.t('logDuel', [target.name || String(target.id), String(target.level)]));
        const res = await Api.call('duel', { id: target.id, enemyId: target.id, targetId: target.id });
        const j = res.json || {};
        const won = j.won ?? j.victory ?? (j.result === 'win');
        if (won) {
          Stats.bump({ duelsWon: 1, goldEarned: j.gold || j.reward || 0 });
          Logger.success(I18n.t('logDuelWon', [target.name || String(target.id)]));
        } else {
          Stats.bump({ duelsLost: 1 });
          Logger.warn(I18n.t('logDuelLost', [target.name || String(target.id)]));
        }
        duelsThisCycle++;
        // Drop the target from the cached list so we don't re-pick it.
        State.patch({ duelTargets: st.duelTargets.filter((t) => t.id !== target.id) });
      };
    }
  });
})();
