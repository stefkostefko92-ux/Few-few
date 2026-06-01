/**
 * Adventures module — the core daily loop (verified XML-RPC protocol).
 *
 * Each active cycle (when no task is running) it calls GetAdventures, which
 * also resolves a just-finished adventure server-side. It then picks the best
 * adventure within the configured difficulty using the chosen strategy and
 * calls StartAdventure, marking the character busy for the adventure's duration
 * (scaled by the server speed). When the free daily adventures are spent it can
 * optionally keep going on bloodstones, otherwise it backs off for 20 minutes.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  // Tanoth difficulty values (verified): easy=-1 … very_difficult=2.
  const DIFFICULTY = { easy: -1, medium: 0, difficult: 1, very_difficult: 2 };

  function cfg() { return Storage.section('adventures') || {}; }

  function chooseAdventure(list, c) {
    const max = DIFFICULTY[c.difficulty] ?? 0;
    const eligible = list.filter((a) => (a.difficulty ?? 0) <= max && a.id != null);
    if (!eligible.length) return null;
    const by = {
      gold: (a, b) => b.gold - a.gold,
      experience: (a, b) => b.xp - a.xp,
      shortest: (a, b) => a.duration - b.duration,
      longest: (a, b) => b.duration - a.duration
    };
    return [...eligible].sort(by[c.strategy] || by.gold)[0];
  }

  Scheduler.register({
    id: 'adventures',
    priority: 90,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      if (!Api.ready()) return null;

      // Busy with a running task — wait it out.
      if (State.get().adventureReturnAt > Date.now()) return null;

      return async () => {
        // GetAdventures both lists options and resolves a finished task.
        const data = await Api.getAdventures();

        if (data.taskRunning) {
          // Something is already in progress; read its remaining time.
          const mu = await Api.miniUpdate();
          if (mu.taskTime > 0) {
            Logger.info(I18n.t('logTaskRunning', [String(mu.taskType || '?'), String(mu.taskTime)]));
          } else {
            // Unknown remaining time — back off a few minutes.
            State.patch({ adventureReturnAt: Date.now() + 5 * 60000 });
          }
          return;
        }

        const st = State.get();
        const freeLeft = (data.freePerDay || 0) - (data.madeToday || 0);
        const canBloodstone = c.useBloodstones && st.bloodstones > (c.bloodstoneReserve || 0);

        if (freeLeft <= 0 && !canBloodstone) {
          Logger.info(I18n.t('logNoAdventures'));
          State.patch({ adventureReturnAt: Date.now() + 20 * 60000 }); // retry in 20 min
          return;
        }

        const choice = chooseAdventure(data.adventures, c);
        if (!choice) {
          Logger.warn(I18n.t('logNoEligibleAdventure', [c.difficulty]));
          State.patch({ adventureReturnAt: Date.now() + 10 * 60000 });
          return;
        }

        Logger.info(I18n.t('logStartAdventure', [String(choice.id), String(choice.difficulty)]));
        await Api.startAdventure(choice.id);

        const speed = Math.max(1, Number(c.serverSpeed) || 1);
        const waitMs = (choice.duration / speed + 5) * 1000;
        State.patch({ adventureReturnAt: Date.now() + waitMs, taskType: 'adventure' });
        Stats.bump({ adventures: 1, goldEarned: choice.gold || 0, xpEarned: choice.xp || 0 });
        Logger.success(I18n.t('logAdventureStarted', [
          String(Math.round(choice.duration / speed)), String(choice.gold || 0), String(choice.xp || 0)
        ]));
      };
    }
  });
})();
