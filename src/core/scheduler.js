/**
 * The automation engine.
 *
 * Runs a cooperative loop: each cycle it asks every enabled module (in priority
 * order) whether it has work to do; the first module that returns an action is
 * executed, then the loop waits a humanized delay before the next cycle. This
 * keeps exactly one action in flight at a time — mirroring how a human plays —
 * and lets high-priority concerns (auto-login, free adventures) pre-empt
 * lower-priority grinding (training, selling).
 *
 * Modules register via TB.Scheduler.register({ id, priority, tick }). `tick`
 * returns either null (nothing to do) or a function that performs one unit of
 * work and resolves when done.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Logger, Storage, I18n } = TB;

  const registered = [];     // {id, priority, tick}
  let running = false;
  let paused = false;
  let loopHandle = null;
  let consecutiveErrors = 0;
  let onBreakUntil = 0;
  let nextBreakAt = 0;
  let currentAction = null;

  const statusListeners = new Set();

  function emitStatus() {
    const s = Scheduler.status();
    statusListeners.forEach((fn) => { try { fn(s); } catch (_) {} });
  }

  const Scheduler = {
    register(mod) {
      registered.push(mod);
      registered.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    },

    isRunning: () => running,
    isPaused: () => paused,

    status() {
      return {
        running, paused,
        onBreak: Date.now() < onBreakUntil,
        currentAction,
        consecutiveErrors,
        nextBreakAt
      };
    },

    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },

    start() {
      if (running) return;
      // Subscription gate: trial or active license required.
      if (TB.License && !TB.License.entitled()) {
        Logger.error(I18n.t('logLicenseRequired'));
        if (TB.Panel && TB.Panel.showPaywall) TB.Panel.showPaywall();
        const g = Storage.section('general') || {};
        if (g?.notifications) {
          chrome.runtime.sendMessage({
            type: 'NOTIFY', title: I18n.t('extName'), message: I18n.t('notifyLicenseRequired')
          }).catch(() => {});
        }
        return;
      }
      running = true;
      paused = false;
      consecutiveErrors = 0;
      scheduleNextBreak();
      Logger.success(I18n.t('logEngineStarted'));
      emitStatus();
      loop();
    },

    stop(reason) {
      if (!running) return;
      running = false;
      paused = false;
      clearTimeout(loopHandle);
      currentAction = null;
      Logger.warn(I18n.t('logEngineStopped') + (reason ? ` (${reason})` : ''));
      emitStatus();
      const g = Storage.section('general');
      if (g?.notifications && g?.notifyOnStop) {
        chrome.runtime.sendMessage({
          type: 'NOTIFY', title: I18n.t('extName'),
          message: I18n.t('notifyStopped') + (reason ? `: ${reason}` : '')
        }).catch(() => {});
      }
    },

    pause() { paused = true; Logger.info(I18n.t('logEnginePaused')); emitStatus(); },
    resume() { if (paused) { paused = false; Logger.info(I18n.t('logEngineResumed')); emitStatus(); loop(); } },

    // Called by the service-worker heartbeat to re-evaluate time windows.
    heartbeat() {
      if (!running) return;
      if (!withinActiveWindow()) {
        if (!paused) { paused = true; Logger.info(I18n.t('logOutsideWindow')); emitStatus(); }
      } else if (paused && Date.now() >= onBreakUntil) {
        // Auto-resume when re-entering the active window (unless on a break).
        paused = false; emitStatus(); loop();
      }
    }
  };

  function withinActiveWindow() {
    const s = Storage.section('scheduler');
    if (!s || !s.enabled) return true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = s.activeFrom.split(':').map(Number);
    const [th, tm] = s.activeTo.split(':').map(Number);
    const from = fh * 60 + fm, to = th * 60 + tm;
    return from <= to ? (cur >= from && cur <= to) : (cur >= from || cur <= to);
  }

  function scheduleNextBreak() {
    const s = Storage.section('scheduler');
    if (s?.enabled && s.randomBreaks) {
      const jitter = 0.5 + Math.random();
      nextBreakAt = Date.now() + s.breakEveryMinutes * 60000 * jitter;
    } else {
      nextBreakAt = 0;
    }
  }

  function maybeTakeBreak() {
    const s = Storage.section('scheduler');
    if (!s?.enabled || !s.randomBreaks || !nextBreakAt) return false;
    if (Date.now() >= nextBreakAt) {
      const dur = s.breakDurationMinutes * 60000 * (0.6 + Math.random() * 0.8);
      onBreakUntil = Date.now() + dur;
      scheduleNextBreak();
      Logger.info(I18n.t('logTakingBreak', String(Math.round(dur / 60000))));
      emitStatus();
      return true;
    }
    return false;
  }

  function humanDelay() {
    const g = Storage.section('general') || {};
    let min = g.minActionDelayMs ?? 1500;
    let max = g.maxActionDelayMs ?? 4500;
    if (max < min) [min, max] = [max, min];
    if (!g.humanize) return min;
    // Bias toward the lower half but allow occasional long pauses.
    const base = min + Math.random() * (max - min);
    const longPause = Math.random() < 0.07 ? (max - min) * Math.random() : 0;
    return Math.round(base + longPause);
  }

  async function loop() {
    if (!running || paused) return;

    // Respect active time window and breaks.
    if (!withinActiveWindow()) { paused = true; emitStatus(); return; }
    if (Date.now() < onBreakUntil) {
      loopHandle = setTimeout(loop, 5000);
      return;
    }
    maybeTakeBreak();

    let acted = false;
    for (const mod of registered) {
      if (!running || paused) return;
      let action = null;
      try {
        action = await mod.tick();
      } catch (e) {
        Logger.error(`[${mod.id}] tick`, e.message);
      }
      if (typeof action === 'function') {
        currentAction = mod.id;
        emitStatus();
        try {
          await action();
          consecutiveErrors = 0;
        } catch (e) {
          consecutiveErrors++;
          TB.Stats?.bump({ errors: 1 });
          Logger.error(`[${mod.id}]`, e.message);
          const limit = Storage.section('general')?.pauseAfterErrors ?? 3;
          if (limit && consecutiveErrors >= limit) {
            Scheduler.stop(I18n.t('reasonTooManyErrors'));
            return;
          }
        } finally {
          currentAction = null;
          emitStatus();
        }
        acted = true;
        break; // one action per cycle
      }
    }

    // Idle longer when there was nothing to do, to avoid hammering the server.
    const delay = acted ? humanDelay() : Math.max(8000, humanDelay() * 2);
    loopHandle = setTimeout(loop, delay);
  }

  TB.Scheduler = Scheduler;
})();
