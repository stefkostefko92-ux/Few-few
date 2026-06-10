// The King's mission quest (a timed quest like an adventure).
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Api, State, Storage, Stats, Logger, I18n, Scheduler } = TB;

  let cooldownUntil = 0;
  function cfg() { return Storage.section('eventquest') || {}; }
  function busy() { return State.get().adventureReturnAt > Date.now(); }

  Scheduler.register({
    id: 'eventquest',
    priority: 72,
    async tick() {
      const c = cfg();
      if (!c.enabled || !Api.ready() || busy()) return null;
      if (Date.now() < cooldownUntil) { Scheduler.wakeAt(cooldownUntil); return null; }

      return async () => {
        const ev = await Api.getGameEvent();
        if (!ev.questId) {
          cooldownUntil = Date.now() + 20 * 60000;   // none offered now
          return;
        }
        Logger.info(I18n.t('logEventStart', [String(ev.rewardGold), String(ev.rewardExp)]));
        await Api.startEventAction();
        await Api.miniUpdate();                        // adopt the quest's busy timer
        if (State.get().adventureReturnAt <= Date.now()) {
          State.patch({ adventureReturnAt: Date.now() + 10 * 60000, taskType: 'mission' });
        }
        Stats.bump({ eventQuests: 1, goldEarned: ev.rewardGold, xpEarned: ev.rewardExp });
      };
    }
  });
})();
