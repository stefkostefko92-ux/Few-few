// Adventures: pick one by strategy/difficulty, start it, wait out the timer.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  // Tanoth difficulty values (verified): easy=-1 ... very_difficult=2.
  const DIFFICULTY = { easy: -1, medium: 0, difficult: 1, very_difficult: 2 };

  function cfg() { return Storage.section('adventures') || {}; }

  // Module-local retry backoff. Never park this in adventureReturnAt: that is
  // the shared "character is busy" timer, and faking it starves the dungeon,
  // event-quest and work modules while the character is actually idle.
  let retryAt = 0;

  // Circle multipliers: Amethyst (node 8) boosts adventure gold, Jade (node 1)
  // boosts XP, at +0.2% per refinement level. Used by the 'smart' strategy.
  function circleMult() {
    const circle = State.get().circle || {};
    const lvl = (n) => (circle[n] && Number.isFinite(circle[n][0]) ? circle[n][0] : 0);
    return { gold: 1 + lvl(8) * 0.002, xp: 1 + lvl(1) * 0.002 };
  }

  function chooseAdventure(list, c) {
    const max = DIFFICULTY[c.difficulty] ?? 0;
    const eligible = list.filter((a) => (a.difficulty ?? 0) <= max && a.id != null);
    if (!eligible.length) return null;
    if (c.strategy === 'smart') {
      const m = circleMult();
      const w = Number(c.smartXpWeight) || 1;
      const score = (a) => (((a.gold || 0) * m.gold) + ((a.xp || 0) * m.xp * w)) / Math.max(1, a.duration || 1);
      return [...eligible].sort((a, b) => score(b) - score(a))[0];
    }
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

      // Busy with a running task - wait it out.
      if (State.get().adventureReturnAt > Date.now()) return null;
      if (Date.now() < retryAt) { Scheduler.wakeAt(retryAt); return null; }

      return async () => {
        // GetAdventures both lists options and resolves a finished task.
        const wasOnAdventure = State.get().taskType === 'adventure';
        const data = await Api.getAdventures();

        if (wasOnAdventure && !data.taskRunning) {
          State.patch({ taskType: null });
          await Api.miniUpdate(); // refresh gold/bloodstones after the reward
          Logger.success(I18n.t('logAdventureDone'));
        }

        if (data.taskRunning) {
          // Something is already in progress; read its remaining time.
          const mu = await Api.miniUpdate();
          if (mu.taskTime > 0) {
            Logger.info(I18n.t('logTaskRunning', [String(mu.taskType || '?'), String(mu.taskTime)]));
          } else {
            // Unknown remaining time - back off a few minutes.
            State.patch({ adventureReturnAt: Date.now() + 5 * 60000 });
          }
          return;
        }

        const st = State.get();
        const freeLeft = (data.freePerDay || 0) - (data.madeToday || 0);
        const canBloodstone = c.useBloodstones && st.bloodstones > (c.bloodstoneReserve || 0);

        if (freeLeft <= 0 && !canBloodstone) {
          Logger.info(I18n.t('logNoAdventures'));
          retryAt = Date.now() + 20 * 60000; // retry in 20 min
          return;
        }

        // Smart strategy needs the circle multipliers; fetch them once.
        if (c.strategy === 'smart' && !Object.keys(State.get().circle || {}).length) {
          try { await Api.getCircle(); } catch (_) {}
        }
        const choice = chooseAdventure(data.adventures, c);
        if (!choice) {
          Logger.warn(I18n.t('logNoEligibleAdventure', [c.difficulty]));
          retryAt = Date.now() + 10 * 60000;
          return;
        }

        Logger.info(I18n.t('logStartAdventure', [String(choice.id), String(choice.difficulty)]));
        await Api.startAdventure(choice.id);

        const speed = Math.max(1, Number(c.serverSpeed) || 1);
        // Floor the wait so bad/zero durations can't cause rapid re-firing of
        // StartAdventure; then trust the server's real task timer.
        const waitMs = Math.max(15000, (Number(choice.duration) || 0) / speed * 1000 + 5000);
        State.patch({ adventureReturnAt: Date.now() + waitMs, taskType: 'adventure' });
        try { await Api.miniUpdate(); } catch (_) {} // adopt the real running-task timer if reported
        Stats.bump({ adventures: 1, goldEarned: choice.gold || 0, xpEarned: choice.xp || 0 });
        Logger.success(I18n.t('logAdventureStarted', [
          String(Math.round((Number(choice.duration) || 0) / speed)), String(choice.gold || 0), String(choice.xp || 0)
        ]));
      };
    }
  });
})();
