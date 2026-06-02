/**
 * Work module (verified: GetWorkData / StartWork).
 *
 * Low-priority filler: when nothing else is running it sends the character on a
 * paid work shift of the configured length (capped to the server's
 * max_working_hours). Yields to adventures when free adventures are available
 * so the higher-value daily content is never blocked.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastCheck = 0;
  function cfg() { return Storage.section('work') || {}; }
  function busy() { return State.get().adventureReturnAt > Date.now(); }

  Scheduler.register({
    id: 'work',
    priority: 12,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready() || busy()) return null;

      // Don't tie the character up on work if a free adventure is waiting.
      if (c.stopWhenAdventureReady && (State.get().freeAdventures || 0) > 0) return null;

      const info = State.get().work || {};
      if (!Object.keys(info).length || Date.now() - lastCheck > 300000) {
        return async () => { lastCheck = Date.now(); await Api.getWorkData(); };
      }

      const want = Math.max(1, Math.min(Number(c.durationHours) || 2, info.maxHours || 1));
      if (want <= 0) return null;

      return async () => {
        await Api.startWork(want);
        await Api.miniUpdate();           // picks up the running-task timer
        // Ensure the module waits the whole shift (log the real cooldown).
        const until = Math.max(State.get().adventureReturnAt || 0, Date.now() + want * 3600000);
        State.patch({ adventureReturnAt: until, taskType: 'work' });
        Stats.bump({ workShifts: 1 });
        lastCheck = 0;
        Logger.success(I18n.t('logWorkStart', [String(want), new Date(until).toLocaleTimeString()]));
      };
    }
  });
})();
