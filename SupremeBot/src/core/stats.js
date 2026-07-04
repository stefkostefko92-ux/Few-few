// Session counters, mirrored to the service worker so totals survive reloads.
(function () {
  'use strict';
  const TB = window.TanothBot;

  const session = {
    started: Date.now(),
    adventures: 0,
    circleNodes: 0,
    attributesRaised: 0,
    dungeonRuns: 0,
    caveRuns: 0,
    dragonRuns: 0,
    eventQuests: 0,
    shadowRuns: 0,
    goldDonated: 0,
    encounters: 0,
    workShifts: 0,
    duelsWon: 0,
    duelsLost: 0,
    itemsSold: 0,
    goldEarned: 0,
    xpEarned: 0,
    levelUps: 0,
    errors: 0
  };

  const listeners = new Set();

  TB.Stats = {
    session: () => session,
    bump(delta) {
      for (const [k, v] of Object.entries(delta)) {
        if (typeof v === 'number' && k in session) session[k] += v;
      }
      chrome.runtime.sendMessage({ type: 'STATS_DELTA', delta }).catch(() => {});
      listeners.forEach((fn) => { try { fn(session); } catch (_) {} });
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
})();
