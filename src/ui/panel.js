/**
 * In-game overlay panel.
 *
 * A draggable, collapsible control surface mounted directly into the Tanoth
 * page so the player can start/stop the bot, watch the live activity log, see
 * session statistics and quickly toggle individual modules without leaving the
 * game. It reflects live state from the Scheduler, Stats, Logger and State
 * subsystems and writes module toggles straight back to Storage.
 */
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { I18n, Logger, Stats, Scheduler, Storage } = TB;

  const MODULES = ['adventures', 'dungeon', 'map', 'pvp', 'work', 'circle', 'training', 'autosell', 'autologin'];

  let root = null;
  let logEl = null;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function build() {
    if (document.getElementById('tanoth-bot-panel')) return;
    const g = Storage.section('general') || {};

    root = el('div');
    root.id = 'tanoth-bot-panel';
    if (g.theme === 'light') root.classList.add('tb-light');
    if (g.panelPosition === 'left') root.classList.add('tb-left');

    root.innerHTML = `
      <div class="tb-header">
        <span class="tb-dot"></span>
        <span class="tb-title">${I18n.t('extName')}</span>
        <button class="tb-icon-btn" data-act="collapse" title="${I18n.t('uiCollapse')}">–</button>
        <button class="tb-icon-btn" data-act="hide" title="${I18n.t('uiHide')}">×</button>
      </div>
      <div class="tb-body">
        <div class="tb-license" data-el="license">
          <span data-el="license-text"></span>
          <a class="tb-link" data-act="subscribe">${I18n.t('uiSubscribe')}</a>
        </div>
        <div class="tb-paywall">
          <h3>${I18n.t('paywallTitle')}</h3>
          <p>${I18n.t('paywallBody')}</p>
          <div class="tb-plans">
            <button class="tb-pay" data-act="pay-monthly">€<span data-el="price-m">4</span> / ${I18n.t('uiMonth')}</button>
            <button class="tb-pay tb-pay-alt" data-act="pay-lifetime">€<span data-el="price-l">20</span> ${I18n.t('uiLifetime')}</button>
          </div>
          <input class="tb-key" data-el="key" placeholder="${I18n.t('uiKeyPlaceholder')}" />
          <button class="tb-activate" data-act="activate">${I18n.t('uiActivate')}</button>
          <div class="tb-pay-msg" data-el="pay-msg"></div>
          <a class="tb-link" data-act="paywall-close" style="cursor:pointer;font-size:11px">${I18n.t('uiClose')}</a>
        </div>
        <div class="tb-controls">
          <button class="tb-btn tb-start" data-act="start">${I18n.t('uiStart')}</button>
          <button class="tb-btn tb-pause" data-act="pause" disabled>${I18n.t('uiPause')}</button>
          <button class="tb-btn tb-stop" data-act="stop" disabled>${I18n.t('uiStop')}</button>
        </div>
        <div class="tb-status" data-el="status">${I18n.t('uiIdle')}</div>
        <div class="tb-stats" data-el="stats"></div>
        <div class="tb-modules" data-el="modules"></div>
        <div class="tb-inputs">
          <input class="tb-input" data-el="in-pvp" placeholder="${I18n.t('uiPvpPlaceholder')}" />
          <input class="tb-input" data-el="in-circle" placeholder="${I18n.t('uiCirclePlaceholder')}" />
        </div>
        <div class="tb-log" data-el="log"></div>
        <div class="tb-footer">
          <span data-el="proto">${I18n.t('uiProtoWaiting')}</span>
          <a data-act="options">${I18n.t('uiOptions')}</a>
        </div>
      </div>`;

    document.body.appendChild(root);
    logEl = root.querySelector('[data-el="log"]');

    root.addEventListener('click', onClick);
    makeDraggable(root.querySelector('.tb-header'), root);

    renderModules();
    setupInputs();
    renderStats(Stats.session());
    Logger.history().slice(-40).forEach(appendLog);

    Scheduler.onStatus(renderStatus);
    Stats.onChange(renderStats);
    Logger.subscribe(appendLog);
    TB.Bridge.onContext(renderProto);
    renderProto(TB.Bridge.context());
    renderStatus(Scheduler.status());

    TB.License.onChange(renderLicense);
    renderLicense(TB.License.get());

    // Live countdown / status refresh (adventure timer ticks down here).
    setInterval(() => renderStatus(Scheduler.status()), 1000);
  }

  function onClick(ev) {
    const act = ev.target.getAttribute('data-act');
    if (!act) return;
    switch (act) {
      case 'start': Scheduler.start(); break;
      case 'stop': Scheduler.stop(I18n.t('reasonManual')); break;
      case 'pause': Scheduler.isPaused() ? Scheduler.resume() : Scheduler.pause(); break;
      case 'collapse': root.classList.toggle('tb-collapsed'); break;
      case 'hide': hide(); break;
      case 'options': chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => chrome.runtime.openOptionsPage?.()); break;
      case 'subscribe': TB.Panel.showPaywall(); break;
      case 'paywall-close': root.classList.remove('tb-show-paywall'); break;
      case 'pay-monthly': TB.License.openPayment(); break;
      case 'pay-lifetime': TB.License.openPayment(); break;
      case 'activate': doActivate(); break;
      default:
        if (act.startsWith('mod:')) toggleModule(act.slice(4));
    }
  }

  async function doActivate() {
    const input = root.querySelector('[data-el="key"]');
    const msg = root.querySelector('[data-el="pay-msg"]');
    const key = (input.value || '').trim();
    if (!key) return;
    msg.className = 'tb-pay-msg';
    msg.textContent = I18n.t('uiActivating');
    const res = await TB.License.activate(key);
    if (res && res.ok) {
      msg.className = 'tb-pay-msg tb-ok';
      msg.textContent = I18n.t('uiActivated');
      setTimeout(() => root.classList.remove('tb-show-paywall'), 1200);
    } else {
      msg.className = 'tb-pay-msg tb-err';
      msg.textContent = I18n.t(res && res.error === 'EXPIRED_KEY' ? 'uiKeyExpired' : 'uiKeyInvalid');
    }
  }

  function renderLicense(lic) {
    if (!root || !lic) return;
    const bar = root.querySelector('[data-el="license"]');
    const text = root.querySelector('[data-el="license-text"]');
    const entitled = !!lic.entitled;
    root.classList.toggle('tb-locked', !entitled);
    if (!entitled) root.classList.add('tb-show-paywall');
    if (lic.payment) {
      const m = root.querySelector('[data-el="price-m"]'); if (m) m.textContent = lic.payment.priceEur;
      const l = root.querySelector('[data-el="price-l"]'); if (l) l.textContent = lic.payment.lifetimePriceEur;
    }
    bar.classList.toggle('tb-lic-expired', lic.status === 'expired' || lic.wrongDevice);
    if (lic.wrongDevice) text.innerHTML = `<b>${I18n.t('licWrongDevice')}</b>`;
    else if (lic.status === 'lifetime') text.innerHTML = I18n.t('licLifetime');
    else if (lic.status === 'active') text.innerHTML = I18n.t('licActive', [String(lic.daysLeft)]);
    else if (lic.status === 'trial') text.innerHTML = I18n.t('licTrial', [String(lic.daysLeft)]);
    else if (lic.status === 'expired') text.innerHTML = `<b>${I18n.t('licExpired')}</b>`;
    else text.textContent = I18n.t('licChecking');
  }

  function hide() {
    root.style.display = 'none';
    const fab = el('div'); fab.id = 'tanoth-bot-fab'; fab.textContent = I18n.t('extNameShort');
    fab.onclick = () => { root.style.display = ''; fab.remove(); };
    document.body.appendChild(fab);
  }

  async function toggleModule(id) {
    const settings = Storage.get();
    if (!settings[id]) return;
    settings[id].enabled = !settings[id].enabled;
    await Storage.save(settings);
    renderModules();
    Logger.info(I18n.t(settings[id].enabled ? 'logModuleOn' : 'logModuleOff', [id]));
  }

  function setupInputs() {
    const s = Storage.get() || {};
    const pvp = root.querySelector('[data-el="in-pvp"]');
    const circle = root.querySelector('[data-el="in-circle"]');
    if (pvp) {
      pvp.value = (s.pvp && s.pvp.opponents) || '';
      pvp.addEventListener('change', async () => {
        const cur = Storage.get();
        cur.pvp.opponents = pvp.value.trim();
        await Storage.save(cur);
        Logger.info(I18n.t('logPvpTargetsSet', [pvp.value.trim() || '—']));
      });
    }
    if (circle) {
      circle.value = (s.circle && s.circle.manualNodes) || '';
      circle.addEventListener('change', async () => {
        const cur = Storage.get();
        const val = circle.value.trim();
        cur.circle.manualNodes = val;
        cur.circle.mode = val ? 'manual' : 'auto';
        await Storage.save(cur);
        // Show how each typed name/number was interpreted (+ current level).
        const nums = (TB.Circle && val) ? TB.Circle.resolveNodes(val) : [];
        const circleData = TB.State.get().circle || {};
        const desc = nums.map((n) => {
          const lvl = circleData[n] ? circleData[n][0] : '?';
          return `${TB.Circle.nodeName(n)}→#${n} (Lv ${lvl})`;
        }).join(', ');
        Logger.info(I18n.t('logCircleNodesSet', [desc || val || '—']));
      });
    }
  }

  function renderModules() {
    const wrap = root.querySelector('[data-el="modules"]');
    wrap.innerHTML = '';
    const settings = Storage.get() || {};
    MODULES.forEach((id) => {
      const on = settings[id]?.enabled;
      const chip = el('span', 'tb-chip' + (on ? ' tb-on' : ''), I18n.t('mod_' + id));
      chip.setAttribute('data-act', 'mod:' + id);
      wrap.appendChild(chip);
    });
  }

  function renderStats(s) {
    const wrap = root.querySelector('[data-el="stats"]');
    const dur = Math.max(1, Math.round((Date.now() - s.started) / 60000));
    const rows = [
      ['statAdventures', s.adventures],
      ['statCircle', s.circleNodes || 0],
      ['statGold', formatNum(s.goldEarned)],
      ['statXp', formatNum(s.xpEarned)],
      ['statErrors', s.errors || 0],
      ['statRuntime', I18n.t('uiMinutes', [String(dur)])]
    ];
    wrap.innerHTML = rows.map(([k, v]) =>
      `<div class="tb-stat"><span>${I18n.t(k)}</span><b>${v}</b></div>`).join('');
  }

  function renderStatus(st) {
    root.classList.toggle('tb-running', st.running && !st.paused);
    root.classList.toggle('tb-paused', st.paused);
    const startBtn = root.querySelector('[data-act="start"]');
    const stopBtn = root.querySelector('[data-act="stop"]');
    const pauseBtn = root.querySelector('[data-act="pause"]');
    startBtn.disabled = st.running;
    stopBtn.disabled = !st.running;
    pauseBtn.disabled = !st.running;
    pauseBtn.textContent = st.paused ? I18n.t('uiResume') : I18n.t('uiPause');

    const status = root.querySelector('[data-el="status"]');
    const returnAt = TB.State.get().adventureReturnAt || 0;
    const waiting = returnAt > Date.now();
    if (!st.running) status.textContent = I18n.t('uiIdle');
    else if (st.onBreak) status.textContent = I18n.t('uiOnBreak');
    else if (st.paused) status.textContent = I18n.t('uiPaused');
    else if (st.currentAction) status.innerHTML = I18n.t('uiRunningAction', [I18n.t('mod_' + st.currentAction)]);
    else if (waiting) status.innerHTML = I18n.t('uiNextIn', [`<b>${fmtDuration(returnAt - Date.now())}</b>`]);
    else status.textContent = I18n.t('uiRunning');
  }

  function fmtDuration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
  }

  function renderProto(p) {
    const e = root.querySelector('[data-el="proto"]');
    if (!e) return;
    e.textContent = (p && p.url && p.hasSession)
      ? I18n.t('uiProtoReady') : I18n.t('uiProtoWaiting');
  }

  function appendLog(entry) {
    if (!logEl) return;
    const cls = entry.level === 'error' ? 'tb-err'
      : entry.level === 'warn' ? 'tb-warn'
      : entry.level === 'success' ? 'tb-ok' : '';
    const time = new Date(entry.t).toLocaleTimeString();
    const line = el('div', 'tb-line ' + cls);
    line.innerHTML = `<span class="tb-time">${time}</span> ${escapeHtml(entry.msg)}`;
    logEl.appendChild(line);
    while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function makeDraggable(handle, target) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.classList.contains('tb-icon-btn')) return;
      dragging = true;
      const r = target.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; ox = r.left; oy = r.top;
      target.classList.remove('tb-left');
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      target.style.left = Math.max(0, ox + e.clientX - sx) + 'px';
      target.style.top = Math.max(0, oy + e.clientY - sy) + 'px';
      target.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function formatNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
    return String(n);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  TB.Panel = {
    mount: build,
    refreshModules: () => root && renderModules(),
    showPaywall: () => { if (root) { root.style.display = ''; root.classList.add('tb-show-paywall'); } }
  };
})();
