// Paid work shifts, used as idle-time filler.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastCheck = 0;
  let failUntil = 0;           // back-off after the server refused a shift
  function cfg() { return Storage.section('work') || {}; }
  function busy() { return State.get().adventureReturnAt > Date.now(); }

  Scheduler.register({
    id: 'work',
    priority: 12,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready() || busy()) return null;
      if (Date.now() < failUntil) { Scheduler.wakeAt(failUntil); return null; }

      // Don't tie the character up on work if a free adventure is waiting.
      // Only meaningful when the adventures module will actually USE them;
      // otherwise free adventures stay > 0 all day and work would never run.
      const advOn = !!(Storage.section('adventures') || {}).enabled;
      if (c.stopWhenAdventureReady && advOn && (State.get().freeAdventures || 0) > 0) return null;

      const info = State.get().work || {};
      if (!Object.keys(info).length || Date.now() - lastCheck > 300000) {
        return async () => {
          lastCheck = Date.now();
          await Api.getWorkData();
          // Keep freeAdventures current so stopWhenAdventureReady can actually
          // fire even when the adventures module itself is disabled.
          if (c.stopWhenAdventureReady && advOn) { try { await Api.getAdventures(); } catch (_) {} }
        };
      }

      const want = Math.max(1, Math.min(Number(c.durationHours) || 2, info.maxHours || 1));

      return async () => {
        // No gold gate: gold_fee is the hourly WAGE the character earns (the
        // game's own work screen shows "gold: goldFee x hours"), not a cost.
        // Gating on it would stop exactly the players who are low on gold.
        try {
          await Api.startWork(want);
        } catch (e) {
          // Server refused (hero busy, ...): back off instead of firing every
          // cycle - three faults in a row would stop the whole engine.
          failUntil = Date.now() + 10 * 60000;
          throw e;
        }
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
