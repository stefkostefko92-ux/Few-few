/**
 * Work / Jobs module — sends the character on multi-hour paid shifts.
 *
 * Picks the best-paying available job (or a preferred one), collects finished
 * shifts, and can yield to the adventure module when free adventures refill so
 * the higher-value daily content is never wasted sitting idle.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let lastCheck = 0;
  function cfg() { return Storage.section('work') || {}; }

  function chooseJob(jobs, c) {
    if (!jobs.length) return null;
    if (c.preferredJob && c.preferredJob !== 'auto') {
      const m = jobs.find((j) => (j.name || '').toLowerCase() === c.preferredJob.toLowerCase());
      if (m) return m;
    }
    return [...jobs].sort((a, b) => (b.payPerHour || b.gold || 0) - (a.payPerHour || a.gold || 0))[0];
  }

  Scheduler.register({
    id: 'work',
    priority: 20,
    async tick() {
      const c = cfg();
      if (!c.enabled) return null;
      const st = State.get();

      // Collect a finished shift.
      if (st.workReturnAt && Date.now() >= st.workReturnAt) {
        return async () => {
          const res = await Api.call('finishWork');
          const gold = (res.json && (res.json.gold || res.json.reward)) || 0;
          Stats.bump({ workShifts: 1, goldEarned: gold });
          State.patch({ workReturnAt: 0 });
          Logger.success(I18n.t('logWorkDone', [String(gold)]));
          await Api.refreshUserInfo();
        };
      }
      if (State.workBusy()) return null;

      // Don't start a shift if there's higher-value work waiting.
      if (c.stopWhenAdventureReady && (st.freeAdventures || 0) > 0) return null;

      if (!st.jobs.length || Date.now() - lastCheck > 300000) {
        return async () => { lastCheck = Date.now(); await Api.call('getJobs'); };
      }

      const job = chooseJob(st.jobs, c);
      if (!job) return null;

      return async () => {
        const hours = Math.max(1, Math.min(10, c.durationHours));
        Logger.info(I18n.t('logWorkStart', [job.name || String(job.id), String(hours)]));
        await Api.call('startWork', { id: job.id, jobId: job.id, hours, duration: hours });
        State.patch({ workReturnAt: Date.now() + hours * 3600000 });
      };
    }
  });
})();
