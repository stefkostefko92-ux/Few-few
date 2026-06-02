/**
 * Content-script orchestrator (runs last in the manifest js array).
 *
 * Boots the subsystems in order: load settings -> inject the page hook ->
 * mount the panel -> wire popup/service-worker messaging -> optionally
 * auto-start. Everything above this file has only *defined* its piece on the
 * TanothBot namespace; this is where it all comes alive.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { Storage, Bridge, Api, Scheduler, Logger, State, Stats, I18n, Panel, License } = TB;

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
        if ((Storage.section('general') || {}).startOnLoad) {
          Logger.info(I18n.t('logAutoStart'));
          Scheduler.start();
        }
      }
    });

    TB.ready = true;
    Logger.info(I18n.t('logBooted', [TB.VERSION]));
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
