// Boots the content-side subsystems and relays popup/service-worker messages.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Storage, Bridge, Api, Scheduler, Logger, State, Stats, I18n, Panel, License } = TB;

  // Server label from the game host, e.g. s1-us.tanoth.gameforge.com -> "s1-us".
  function serverLabel() {
    try { const m = location.hostname.match(/^([\w-]+)\.tanoth\./i); return m ? m[1] : location.hostname; }
    catch (_) { return ''; }
  }
  // Human-readable "what the hero is doing right now".
  function activityLabel() {
    const st = Scheduler.status();
    if (!st.running) return I18n.t('uiIdle');
    if (st.paused) return I18n.t('uiPaused');
    if (st.onBreak) return I18n.t('uiOnBreak');
    const act = st.currentAction || st.lastAction;
    return act ? I18n.t('mod_' + act) : I18n.t('uiRunning');
  }
  // Central notification helper: every webhook/desktop alert carries the
  // character, server and current activity so multiple accounts are told apart.
  TB.notify = function (opts) {
    opts = opts || {};
    const s = State.get();
    const fields = [];
    if (s.name) fields.push({ name: I18n.t('nfChar'), value: String(s.name) + (s.level ? ` (Lv ${s.level})` : ''), inline: true });
    const srv = serverLabel();
    if (srv) fields.push({ name: I18n.t('nfServer'), value: srv, inline: true });
    fields.push({ name: I18n.t('nfActivity'), value: activityLabel(), inline: true });
    if (s.guild) fields.push({ name: I18n.t('nfGuild'), value: String(s.guild), inline: true });
    try {
      chrome.runtime.sendMessage({
        type: 'NOTIFY',
        title: opts.title || I18n.t('extName'),
        message: opts.message,
        level: opts.level,
        fields: fields.concat(opts.fields || [])
      }).catch(() => {});
    } catch (_) {}
  };

  async function boot() {
    await Storage.load();
    await License.load();
    const settings = Storage.get();

    // Inject the page-world XML-RPC client and bring up the bridge.
    Bridge.init();

    // Mount the in-game panel once the DOM is ready.
    if (document.body) Panel.mount();
    else document.addEventListener('DOMContentLoaded', () => Panel.mount());

    // Once the gateway + session are discovered, mark logged in, pull the first
    // resource snapshot and optionally auto-start the engine.
    let primed = false;
    Bridge.onContext((ctx) => {
      if (!primed && ctx && ctx.url && ctx.hasSession) {
        primed = true;
        State.patch({ loggedIn: true });
        Logger.success(I18n.t('logProtocolReady'));
        Api.refresh().catch(() => {});
        // Pull the character identity (name / guild / level) so notifications
        // can name the hero even before any activity runs.
        Api.getUserAttributes().catch(() => {});
        if ((Storage.section('general') || {}).startOnLoad) {
          Logger.info(I18n.t('logAutoStart'));
          Scheduler.start();
        }
      }
    });

    TB.ready = true;
    Logger.info(I18n.t('logBooted', [TB.VERSION]));

    // Keep gold / bloodstones / running-task state fresh for every module and
    // the panel. Without this, modules see a stale gold value (e.g. right after
    // an adventure reward) and wrongly decide "not enough gold". Only polls
    // while the engine is actually running, so an idle Tanoth tab stays quiet.
    setInterval(() => {
      if (Bridge.ready() && Scheduler.isRunning()) Api.refresh().catch(() => {});
    }, 30000);

    // Optional periodic activity report to the webhooks (0 = off): tells you
    // what each hero is doing without waiting for a start/stop event.
    let lastStatusAt = 0;
    setInterval(() => {
      if (!Bridge.ready() || !Scheduler.isRunning()) return;
      const g = Storage.section('general') || {};
      const w = Storage.section('webhooks') || {};
      const mins = Number(w.statusMinutes) || 0;
      if (!g.notifications || mins <= 0) return;
      if (Date.now() - lastStatusAt < mins * 60000) return;
      lastStatusAt = Date.now();
      const st = State.get();
      const fields = [];
      if (st.gold != null) fields.push({ name: I18n.t('nfGold'), value: String(st.gold), inline: true });
      if (st.freeAdventures != null) fields.push({ name: I18n.t('statAdventures'), value: String(st.freeAdventures), inline: true });
      TB.notify({ message: I18n.t('notifyStatus'), level: 'info', fields });
    }, 60000);

    // Orphan check: when the extension is reloaded/updated, this copy of the
    // content script survives with dead chrome.* APIs while a fresh copy boots.
    // Stop the old engine so two bots never automate the same tab in parallel.
    const orphanCheck = setInterval(() => {
      let dead = false;
      try { dead = !(chrome.runtime && chrome.runtime.id); } catch (_) { dead = true; }
      if (!dead) return;
      clearInterval(orphanCheck);
      try { Scheduler.stop('reload'); } catch (_) {}
    }, 10000);
  }

  /* ---------------------- popup / service-worker bridge ------------------- */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg?.type) {
      case 'HEARTBEAT':
        Scheduler.heartbeat();
        License.load().then((lic) => {
          // Stop automating the moment entitlement lapses.
          if (!lic.entitled && Scheduler.isRunning()) Scheduler.stop(I18n.t('reasonLicenseLapsed'));
        });
        sendResponse({ ok: true });
        return false;

      case 'LICENSE_UPDATED':
        License._set(msg.license);
        sendResponse({ ok: true });
        return false;

      case 'SETTINGS_UPDATED':
        Storage._set(msg.settings);
        if ((Storage.section('general') || {}).enabled === false && Scheduler.isRunning()) {
          Scheduler.stop(I18n.t('logMasterOff'));
        }
        Panel.refreshModules();
        sendResponse({ ok: true });
        return false;

      case 'GET_STATUS':
        sendResponse({
          ok: true,
          status: Scheduler.status(),
          state: {
            loggedIn: State.get().loggedIn,
            name: State.get().name,
            level: State.get().level,
            gold: State.get().gold,
            bloodstones: State.get().bloodstones
          },
          session: Stats.session(),
          protocolReady: Bridge.ready()
        });
        return false;

      case 'CONTROL':
        handleControl(msg.action);
        sendResponse({ ok: true, status: Scheduler.status() });
        return false;

      default:
        return false;
    }
  });

  function handleControl(action) {
    switch (action) {
      case 'start': Scheduler.start(); break;
      case 'stop': Scheduler.stop(I18n.t('reasonManual')); break;
      case 'pause': Scheduler.pause(); break;
      case 'resume': Scheduler.resume(); break;
      case 'showPanel': {
        const fab = document.getElementById('tanoth-bot-fab');
        const panel = document.getElementById('tanoth-bot-panel');
        if (panel) panel.style.display = '';
        if (fab) fab.remove();
        break;
      }
    }
  }

  boot().catch((e) => Logger.error('boot failed', e.message));
})();
