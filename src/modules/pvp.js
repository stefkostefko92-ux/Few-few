// Arena duels. Waits the cooldown unless you allow spending bloodstones.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let foughtToday = 0;
  let dayStamp = today();
  let cooldownUntil = 0;
  let warnedNoTarget = false;
  let rrIndex = 0;

  function today() { return new Date().toDateString(); }
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

      if (today() !== dayStamp) { dayStamp = today(); foughtToday = 0; }

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
        const res = await Api.fight(name);
        foughtToday++;
        cooldownUntil = Date.now() + Math.max(1, Number(c.cooldownSeconds) || 600) * 1000;
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
