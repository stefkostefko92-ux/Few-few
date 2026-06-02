/**
 * Arena / PvP module (verified: Fight).
 *
 * Tanoth's Fight call takes an opponent name, so this module farms a configured
 * opponent (or list of opponents) up to a daily cap, with a cooldown between
 * fights. Leave the opponent field blank to disable; the module logs a hint
 * once if enabled without a target.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, Storage, Stats, Logger, I18n, Scheduler } = TB;

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
      if (Date.now() < cooldownUntil) return null;

      const list = targets();
      if (!list.length) {
        if (!warnedNoTarget) { warnedNoTarget = true; Logger.warn(I18n.t('logPvpNoTarget')); }
        return null;
      }
      warnedNoTarget = false;
      if (c.maxPerDay && foughtToday >= c.maxPerDay) return null;

      const name = list[rrIndex % list.length];
      rrIndex++;

      return async () => {
        Logger.info(I18n.t('logPvpFight', [name]));
        const res = await Api.fight(name);
        foughtToday++;
        // Respect the arena cooldown when humanizing; spam when humanize is off.
        const humanize = (Storage.section('general') || {}).humanize;
        const cd = Math.max(1, Number(c.cooldownSeconds) || 30);
        cooldownUntil = humanize ? Date.now() + cd * 1000 : 0;
        if (humanize) Logger.info(I18n.t('logPvpCooldown', [String(cd)]));
        if (res.won) {
          Stats.bump({ duelsWon: 1, goldEarned: res.gold || 0 });
          Logger.success(I18n.t('logPvpWon', [name, String(res.gold || 0)]));
        } else {
          Stats.bump({ duelsLost: 1 });
          Logger.warn(I18n.t('logPvpLost', [name]));
        }
        await Api.miniUpdate();
      };
    }
  });
})();
