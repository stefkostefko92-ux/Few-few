// The automation loop. Each cycle the highest-priority ready module runs one
// action, then we wait a humanized delay (or barely wait, if humanize is off).
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Logger, Storage, I18n } = TB;

  const registered = [];     // {id, priority, tick}
  let running = false;
  let paused = false;
  let pausedByWindow = false;   // true only when paused by the active-hours window
  let loopHandle = null;
  let loopGen = 0;           // invalidates stale loop chains (pause/stop while a cycle is awaiting)
  let consecutiveErrors = 0;
  let onBreakUntil = 0;
  let wakeAt = 0;            // earliest module-requested re-evaluation time (epoch ms)
  let nextBreakAt = 0;
  let currentAction = null;
  let lastAction = null;     // id of the most recent module that acted
  let nextAt = 0;            // epoch ms of the next scheduler evaluation
  let lastActedAt = 0;       // when the last action finished (fixed interval is measured from here)
  // With nothing to do and no known timer, re-check this often. It is only a
  // safety net: every wait the bot knows about (task timer, cooldowns, energy
  // regen) registers its exact end time, and the loop sleeps until then.
  const IDLE_CHECK_MS = 30000;
  let sleeping = false;      // true only while waiting in setTimeout (never mid-action)

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
        lastAction,
        nextAt,
        consecutiveErrors,
        nextBreakAt
      };
    },

    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },

    start() {
      if (running) return;
      // Master switch: the general.enabled toggle gates all automation.
      if ((Storage.section('general') || {}).enabled === false) {
        Logger.warn(I18n.t('logMasterOff'));
        return;
      }
      // Subscription gate: trial or active license required.
      if (TB.License && !TB.License.entitled()) {
        Logger.error(I18n.t('logLicenseRequired'));
        if (TB.Panel && TB.Panel.showPaywall) TB.Panel.showPaywall();
        TB.notify?.({ message: I18n.t('notifyLicenseRequired'), level: 'error' });
        return;
      }
      running = true;
      paused = false;
      pausedByWindow = false;
      consecutiveErrors = 0;
      onBreakUntil = 0;
      wakeAt = 0;
      scheduleNextBreak();
      Logger.success(I18n.t('logEngineStarted'));
      emitStatus();
      kickLoop();
      const g = Storage.section('general') || {};
      if (g?.notifyOnStart) TB.notify?.({ message: I18n.t('notifyStarted'), level: 'success' });
    },

    stop(reason) {
      if (!running) return;
      running = false;
      paused = false;
      loopGen++;
      clearTimeout(loopHandle);
      currentAction = null;
      Logger.warn(I18n.t('logEngineStopped') + (reason ? ` (${reason})` : ''));
      emitStatus();
      const g = Storage.section('general');
      if (g?.notifyOnStop) {
        TB.notify?.({ message: I18n.t('notifyStopped') + (reason ? `: ${reason}` : ''), level: 'warn' });
      }
    },

    // Something the bot waits on changed (task ended early, gold arrived): if
    // the loop is asleep, re-evaluate now instead of at the planned wake.
    // Never interrupts an action in progress (that could fire two at once).
    nudge() {
      if (!running || paused || !sleeping || nextAt - Date.now() < 1000) return;
      clearTimeout(loopHandle);
      sleeping = false;
      loopGen++;
      loop(loopGen);
    },

    // A module waiting on a cooldown calls this so the loop re-evaluates it
    // exactly when the cooldown ends (instead of only on the idle poll).
    wakeAt(ts) {
      if (typeof ts === 'number' && ts > Date.now()) wakeAt = wakeAt ? Math.min(wakeAt, ts) : ts;
    },

    pause() {
      paused = true; pausedByWindow = false;
      loopGen++; clearTimeout(loopHandle);
      Logger.info(I18n.t('logEnginePaused')); emitStatus();
    },
    resume() {
      if (!paused) return;
      paused = false; pausedByWindow = false;
      Logger.info(I18n.t('logEngineResumed')); emitStatus();
      kickLoop();
    },

    // Called by the service-worker heartbeat to re-evaluate the active window.
    heartbeat() {
      if (!running) return;
      if (!withinActiveWindow()) {
        if (!paused) { paused = true; pausedByWindow = true; Logger.info(I18n.t('logOutsideWindow')); emitStatus(); }
      } else if (paused && pausedByWindow && Date.now() >= onBreakUntil) {
        // Auto-resume ONLY a window-induced pause - never override a manual pause.
        paused = false; pausedByWindow = false; emitStatus(); kickLoop();
      }
    }
  };

  function withinActiveWindow() {
    const s = Storage.section('scheduler');
    if (!s || !s.enabled) return true;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = String(s.activeFrom || '00:00').split(':').map(Number);
    const [th, tm] = String(s.activeTo || '23:59').split(':').map(Number);
    const from = fh * 60 + fm, to = th * 60 + tm;
    if (!Number.isFinite(from) || !Number.isFinite(to)) return true;  // bad value: never wedge the loop
    return from <= to ? (cur >= from && cur <= to) : (cur >= from || cur <= to);
  }

  // Breaks are controlled solely by the randomBreaks toggle (independent of the
  // active-hours scheduler). When it's off, no break is ever taken.
  function breaksEnabled() {
    const s = Storage.section('scheduler') || {};
    return !!s.randomBreaks;
  }

  function scheduleNextBreak() {
    const s = Storage.section('scheduler') || {};
    if (breaksEnabled()) {
      const jitter = 0.5 + Math.random();
      nextBreakAt = Date.now() + (s.breakEveryMinutes || 90) * 60000 * jitter;
    } else {
      nextBreakAt = 0;
    }
  }

  function maybeTakeBreak() {
    if (!breaksEnabled()) { nextBreakAt = 0; onBreakUntil = 0; return false; } // off => never break
    if (!nextBreakAt) scheduleNextBreak();
    if (Date.now() >= nextBreakAt) {
      const s = Storage.section('scheduler') || {};
      const dur = (s.breakDurationMinutes || 10) * 60000 * (0.6 + Math.random() * 0.8);
      onBreakUntil = Date.now() + dur;
      scheduleNextBreak();
      Logger.info(I18n.t('logTakingBreak', String(Math.round(dur / 60000))));
      emitStatus();
      return true;
    }
    return false;
  }

  // Spam delay when humanize is off (small, just enough not to lock the tab).
  const SPAM_DELAY_MS = 120;

  function humanDelay() {
    const g = Storage.section('general') || {};
    if (!g.humanize) return SPAM_DELAY_MS;          // humanize off -> spam
    // Clamp the floor so tampered/zeroed settings can't spin a near-zero loop.
    let min = Math.max(300, Number(g.minActionDelayMs) || 1500);
    let max = Math.max(min, Number(g.maxActionDelayMs) || 4500);
    // Respect the user's delay: random within [min, max], occasional long pause.
    const base = min + Math.random() * (max - min);
    const longPause = Math.random() < 0.07 ? (max - min) * Math.random() : 0;
    return Math.round(base + longPause);
  }

  // Starts a fresh loop chain, invalidating any previous one (a pending timer
  // or a cycle still awaiting an action would otherwise keep running alongside
  // the new chain and double every game action).
  function kickLoop() {
    clearTimeout(loopHandle);
    loopGen++;
    loop(loopGen);
  }

  async function loop(gen) {
    sleeping = false;
    const alive = () => gen === loopGen && running && !paused;
    if (!alive()) return;

    // Respect active time window and breaks.
    if (!withinActiveWindow()) {
      // Window-induced pause, so the heartbeat may auto-resume it later.
      paused = true; pausedByWindow = true; emitStatus();
      return;
    }
    if (!breaksEnabled()) onBreakUntil = 0;          // disabling breaks ends any current one
    if (Date.now() < onBreakUntil || maybeTakeBreak()) {
      // Sleep to the end of the break (re-checked at least every 30 s so that
      // switching breaks off or Stop is honoured promptly).
      const d = Math.max(500, Math.min(onBreakUntil - Date.now(), IDLE_CHECK_MS));
      nextAt = Date.now() + d;
      sleeping = true;
      loopHandle = setTimeout(() => loop(gen), d);
      return;
    }

    wakeAt = 0;              // modules re-register their cooldown waits this pass
    let acted = false;
    for (const mod of registered) {
      if (!alive()) return;
      let action = null;
      try {
        action = await mod.tick();
      } catch (e) {
        Logger.error(`[${mod.id}] tick`, e.message);
      }
      if (!alive()) return;
      if (typeof action === 'function') {
        currentAction = mod.id;
        lastAction = mod.id;
        emitStatus();
        // Time marker, not buffer length: the log is a 300-entry ring buffer, so
        // once full its length is constant and a length-based slice() is empty.
        const startedAt = Date.now();
        try {
          await action();
          consecutiveErrors = 0;
          // Optional per-action webhook: report exactly what was just done,
          // reusing the module's own success/info log line.
          const wh = Storage.section('webhooks') || {};
          if (wh.notifyEachAction && TB.notify) {
            const news = (Logger.history ? Logger.history() : [])
              .filter((e) => e.t >= startedAt && (e.level === 'success' || e.level === 'info'));
            const last = news[news.length - 1];
            // desktop:false -> per-action goes to the webhooks only, never a
            // Chrome popup (that would be far too spammy).
            TB.notify({ message: last ? last.msg : I18n.t('mod_' + mod.id), level: 'info', desktop: false });
          }
        } catch (e) {
          // Transient transport / session errors shouldn't trip the error-stop;
          // they recover on their own (or via auto-login).
          const transient = /TIMEOUT|INJECT_NOT_READY|SESSION_EXPIRED|NO_SESSION|NO_GATEWAY|HTTP_|BAD_XML|GAME_INFO/.test(e.message || '');
          Logger[transient ? 'warn' : 'error'](`[${mod.id}]`, e.message);
          if (!transient) {
            consecutiveErrors++;
            TB.Stats?.bump({ errors: 1 });
            const limit = Storage.section('general')?.pauseAfterErrors ?? 3;
            if (limit && consecutiveErrors >= limit) {
              Scheduler.stop(I18n.t('reasonTooManyErrors'));
              return;
            }
          }
        } finally {
          currentAction = null;
          emitStatus();
        }
        if (!alive()) return;
        acted = true;
        lastActedAt = Date.now();
        break; // one action per cycle
      }
    }

    // Between actions: the humanized delay (or spam when humanize is off), or
    // the user's fixed interval.
    // When nothing was actionable: sleep until the EARLIEST real timer - the
    // game's own task timer (adventure / work / mission / cave), a module
    // cooldown or the energy regen - and act almost immediately after it ends.
    // No more re-checking every few seconds while the hero is busy for 14 min.
    const g = Storage.section('general') || {};
    const fixed = Math.max(0, Number(g.actionIntervalSec) || 0) * 1000;
    let delay;
    if (acted) {
      delay = fixed > 0 ? Math.max(300, fixed) : humanDelay();
    } else {
      const now = Date.now();
      const busyUntil = Number(TB.State?.get().adventureReturnAt) || 0;
      if (busyUntil > now) Scheduler.wakeAt(busyUntil);
      // "Almost immediately" after the timer: a beat, so the server has
      // closed the task; humanize adds a short random human-ish reaction.
      const margin = g.humanize ? 300 + Math.round(Math.random() * 900) : 250;
      let at = wakeAt ? wakeAt + margin : now + IDLE_CHECK_MS;
      // A user-set interval is a minimum gap between actions, also here.
      if (fixed > 0) at = Math.max(at, lastActedAt + fixed);
      delay = Math.max(g.humanize ? 300 : 150, Math.min(at - now, IDLE_CHECK_MS));
    }
    nextAt = Date.now() + delay;
    sleeping = true;
    loopHandle = setTimeout(() => loop(gen), delay);
  }

  TB.Scheduler = Scheduler;
})();
