/**
 * Adventures module — the core daily grind.
 *
 * Merges the strategies of both reference extensions: shortest/longest route,
 * max-XP, max-gold and a "safest" (highest win-chance) mode, with difficulty
 * and minimum-win-chance gates, plus optional bloodstone spending once the
 * free daily adventures are used up.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  function cfg() { return Storage.section('adventures') || {}; }

  function chooseAdventure(list, c) {
    const eligible = list.filter((a) =>
      (a.difficulty || 0) <= c.maxDifficulty &&
      (a.winChance ?? 100) >= c.minSuccessChance
    );
    if (!eligible.length) return null;
    const by = {
      shortest: (a, b) => a.duration - b.duration,
      longest: (a, b) => b.duration - a.duration,
      maxXp: (a, b) => (b.xp / Math.max(b.duration, 1)) - (a.xp / Math.max(a.duration, 1)),
      maxGold: (a, b) => (b.gold / Math.max(b.duration, 1)) - (a.gold / Math.max(a.duration, 1)),
      safest: (a, b) => (b.winChance ?? 0) - (a.winChance ?? 0)
    };
    return eligible.sort(by[c.strategy] || by.maxXp)[0];
  }

  Scheduler.register({
    id: 'adventures',
    priority: 90,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();

      // Resolve a finished adventure first.
      if (st.adventureReturnAt && Date.now() >= st.adventureReturnAt) {
        return async () => {
          const res = await Api.call('finishAdventure');
          const j = res.json || {};
          const gold = j.gold || j.reward || 0;
          const xp = j.xp || j.experience || 0;
          Stats.bump({ adventures: 1, goldEarned: gold, xpEarned: xp });
          State.patch({ adventureReturnAt: 0 });
          Logger.success(I18n.t('logAdventureDone', [String(xp), String(gold)]));
          await Api.refreshUserInfo();
        };
      }
      if (State.adventureBusy()) return null;

      // Make sure we have a fresh adventure list.
      if (!st.adventureList.length) {
        return async () => { await Api.call('getAdventures'); };
      }

      const free = st.freeAdventures || 0;
      const canBloodstone = c.useBloodstones && st.bloodstones > c.bloodstoneReserve;
      if (free <= 0 && !canBloodstone) return null;

      const choice = chooseAdventure(st.adventureList, c);
      if (!choice) { Logger.debug('no eligible adventure'); return null; }

      return async () => {
        Logger.info(I18n.t('logStartAdventure', [choice.name || String(choice.id), String(choice.difficulty)]));
        const res = await Api.call('startAdventure', {
          id: choice.id, adventureId: choice.id, questId: choice.id,
          useBloodstone: free <= 0 && canBloodstone ? 1 : 0
        });
        const dur = (choice.duration || 0) * (choice.duration < 1e6 ? 1000 : 1);
        State.patch({
          adventureReturnAt: Date.now() + (dur || 600000),
          freeAdventures: Math.max(0, free - (free > 0 ? 1 : 0)),
          adventureList: []
        });
        if (res.json) Logger.debug('startAdventure ok');
      };
    }
  });
})();
