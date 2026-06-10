// Paid work shifts, used as idle-time filler.
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
        return async () => {
          lastCheck = Date.now();
          await Api.getWorkData();
          // Keep freeAdventures current so stopWhenAdventureReady can actually
          // fire even when the adventures module itself is disabled.
          if (c.stopWhenAdventureReady) { try { await Api.getAdventures(); } catch (_) {} }
        };
      }

      const want = Math.max(1, Math.min(Number(c.durationHours) || 2, info.maxHours || 1));
      if (want <= 0) return null;

      return async () => {
        // Fresh gold check: work charges a fee, and this was the only spending
        // path without one.
        const fee = Number(info.goldFee) || 0;
        if (fee > 0) {
          const mu = await Api.miniUpdate();
          if ((Number(mu.gold) || 0) < fee) {
            Logger.info(I18n.t('logWorkSkipGold', [String(fee)]));
            lastCheck = Date.now();   // re-check on the next 5-minute pass
            return;
          }
        }
        await Api.startWork(want);
        await Api.miniUpdate();           // picks up the running-task timer
        // Prefer the server-reported shift timer (speed servers run shorter
        // than real time); fall back to the nominal duration if absent.
        const fromServer = State.get().adventureReturnAt || 0;
        const until = fromServer > Date.now() ? fromServer : Date.now() + want * 3600000;
        State.patch({ adventureReturnAt: until, taskType: 'work' });
        Stats.bump({ workShifts: 1 });
        lastCheck = 0;
        Logger.success(I18n.t('logWorkStart', [String(want), new Date(until).toLocaleTimeString()]));
      };
    }
  });
})();
