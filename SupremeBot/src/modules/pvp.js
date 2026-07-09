// Arena duels. Waits the cooldown unless you allow spending bloodstones.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  // Persisted in sessionStorage so the daily cap and the arena cooldown
  // survive page reloads (autologin reloads the tab; an in-memory cooldown
  // would otherwise let a reload trigger a bloodstone-charged early fight).
  const SS_KEY = 'tb_pvp';
  function loadPersisted() {
    try {
      const v = JSON.parse(sessionStorage.getItem(SS_KEY) || '{}');
      return { foughtToday: Number(v.foughtToday) || 0, dayStamp: v.dayStamp || today(), cooldownUntil: Number(v.cooldownUntil) || 0 };
    } catch (_) { return { foughtToday: 0, dayStamp: today(), cooldownUntil: 0 }; }
  }
  function persist() {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify({ foughtToday, dayStamp, cooldownUntil })); } catch (_) {}
  }

  function today() { return new Date().toDateString(); }
  let { foughtToday, dayStamp, cooldownUntil } = loadPersisted();
  let warnedNoTarget = false;
  let rrIndex = 0;
  function cfg() { return Storage.section('pvp') || {}; }
  function targets() {
    return String(cfg().opponents || '')
      .split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  Scheduler.register({
    id: 'pvp',
    priority: 55,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready()) return null;

      if (today() !== dayStamp) { dayStamp = today(); foughtToday = 0; persist(); }

      const list = targets();
      if (!list.length) {
        if (!warnedNoTarget) { warnedNoTarget = true; Logger.warn(I18n.t('logPvpNoTarget')); }
        return null;
      }
      warnedNoTarget = false;
      if (c.maxPerDay && foughtToday >= c.maxPerDay) return null;

      const onCooldown = Date.now() < cooldownUntil;
      let spendBs = false;
      if (onCooldown) {
        // Fighting now would spend bloodstones. Only do it if the user opted in
        // and has bloodstones above the reserve; otherwise wait the cooldown.
        const bs = Number(State.get().bloodstones) || 0;
        if (c.useBloodstones && bs > (c.bloodstoneReserve || 0)) {
          spendBs = true;
        } else {
          Scheduler.wakeAt(cooldownUntil);   // resend exactly when cooldown ends
          return null;
        }
      }

      const name = list[rrIndex % list.length];
      rrIndex++;

      return async () => {
        Logger.info(I18n.t(spendBs ? 'logPvpFightBs' : 'logPvpFight', [name]));
        let res;
        try {
          res = await Api.fight(name);
        } catch (e) {
          // Back off on a fault too, or the module retries every cycle and
          // three faults in a row would stop the whole engine.
          cooldownUntil = Date.now() + 60 * 1000;
          persist();
          Scheduler.wakeAt(cooldownUntil);
          throw e;
        }
        foughtToday++;
        cooldownUntil = Date.now() + Math.max(1, Number(c.cooldownSeconds) || 600) * 1000;
        persist();
        if (res.won) {
          Stats.bump({ duelsWon: 1, goldEarned: res.gold || 0 });
          Logger.success(I18n.t('logPvpWon', [name, String(res.gold || 0)]));
        } else {
          Stats.bump({ duelsLost: 1 });
          Logger.warn(I18n.t('logPvpLost', [name]));
        }
        await Api.miniUpdate();              // refresh gold/bloodstones
        Scheduler.wakeAt(cooldownUntil);
      };
    }
  });
})();
