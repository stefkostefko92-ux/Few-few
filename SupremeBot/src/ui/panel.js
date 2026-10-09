// The draggable control panel injected into the game page.
(function () {
  'use strict';
  const TB = window.TanothBot;
  const { I18n, Logger, Stats, Scheduler, Storage } = TB;

  const MODULES = ['adventures', 'dungeon', 'eventquest', 'map', 'pvp', 'work', 'circle', 'training', 'guild', 'autosell', 'autologin'];

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

    // Liquid-glass lens: displaces the backdrop near the panel's edges (see panel.css
    // `--glass-bf`). Purely decorative; if the filter or its data: map is blocked the
    // glass still works, just without the edge refraction.
    const LENS_MAP = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='340' height='700' viewBox='0 0 340 700' preserveAspectRatio='none'%3E%3Cdefs%3E%3ClinearGradient id='x' x1='0' x2='1' y1='0' y2='0'%3E%3Cstop offset='0' stop-color='%23f00'/%3E%3Cstop offset='.06' stop-color='%23800'/%3E%3Cstop offset='.94' stop-color='%23800'/%3E%3Cstop offset='1' stop-color='%23000'/%3E%3C/linearGradient%3E%3ClinearGradient id='y' x1='0' x2='0' y1='0' y2='1'%3E%3Cstop offset='0' stop-color='%230f0'/%3E%3Cstop offset='.03' stop-color='%23080'/%3E%3Cstop offset='.97' stop-color='%23080'/%3E%3Cstop offset='1' stop-color='%23000'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='100%25' height='100%25' fill='%23000'/%3E%3Crect width='100%25' height='100%25' fill='url(%23x)'/%3E%3Crect width='100%25' height='100%25' fill='url(%23y)' style='mix-blend-mode:screen'/%3E%3C/svg%3E";

    root.innerHTML = `
      <svg class="tb-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><filter id="tb-lens-9f3a" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${LENS_MAP}" x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="44" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>
      <div class="tb-header">
        <svg class="tb-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><defs><radialGradient id="tbm-pnl9f3a-glow" cx="16" cy="14" r="17" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#27e08a" stop-opacity=".34"/><stop offset="1" stop-color="#27e08a" stop-opacity="0"/></radialGradient><linearGradient id="tbm-pnl9f3a-blade" x1="12.8" y1="0" x2="19.2" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#cdd6dc"/><stop offset=".47" stop-color="#fff"/><stop offset=".5" stop-color="#7f8a94"/><stop offset="1" stop-color="#b6c0c8"/></linearGradient><linearGradient id="tbm-pnl9f3a-brass" x1="0" y1="17.4" x2="0" y2="20.6" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#e2b246"/><stop offset="1" stop-color="#9a6a1a"/></linearGradient><linearGradient id="tbm-pnl9f3a-grip" x1="14.4" y1="0" x2="17.6" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4b3223"/><stop offset=".45" stop-color="#a77852"/><stop offset="1" stop-color="#3a271b"/></linearGradient><radialGradient id="tbm-pnl9f3a-gem" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d9ffec"/><stop offset=".35" stop-color="#27e08a"/><stop offset="1" stop-color="#087a49"/></radialGradient></defs><rect x=".6" y=".6" width="30.8" height="30.8" rx="8" fill="#0a0b0d" stroke="#27e08a" stroke-opacity=".7" stroke-width="1.1"/><rect x=".6" y=".6" width="30.8" height="30.8" rx="8" fill="url(#tbm-pnl9f3a-glow)"/><g><path d="M16 2.3 L19.2 8 V17.6 H12.8 V8 Z" fill="url(#tbm-pnl9f3a-blade)"/><path d="M16 5.2 V15.8" stroke="#56626c" stroke-width=".6" stroke-opacity=".75" stroke-linecap="round"/><rect x="4.6" y="17.4" width="22.8" height="3.2" rx="1.6" fill="url(#tbm-pnl9f3a-brass)"/><rect x="4.6" y="19.6" width="22.8" height="1" rx=".5" fill="#4a2f06" opacity=".45"/><rect x="14.4" y="20.4" width="3.2" height="5" rx=".8" fill="url(#tbm-pnl9f3a-grip)"/><path d="M14.4 22.1 L17.6 21.2 M14.4 23.7 L17.6 22.8 M14.4 25.3 L17.6 24.4" stroke="#1d1109" stroke-width=".6" opacity=".85"/><circle cx="16" cy="27" r="2.9" fill="#e2b246"/><circle cx="16" cy="27" r="2.1" fill="url(#tbm-pnl9f3a-gem)"/><circle cx="15.3" cy="26.3" r=".55" fill="#fff" opacity=".9"/></g></svg>
        <span class="tb-dot" aria-hidden="true"></span>
        <span class="tb-title">${I18n.t('extName')}</span>
        <button class="tb-icon-btn" data-act="collapse" title="${I18n.t('uiCollapse')}" aria-label="${I18n.t('uiCollapse')}">\u2013</button>
        <button class="tb-icon-btn" data-act="hide" title="${I18n.t('uiHide')}" aria-label="${I18n.t('uiHide')}">×</button>
      </div>
      <div class="tb-body">
        <div class="tb-license" data-el="license">
          <span data-el="license-text"></span>
          <a class="tb-link" data-act="subscribe" role="button" tabindex="0">${I18n.t('uiSubscribe')}</a>
        </div>
        <div class="tb-paywall">
          <h3>${I18n.t('paywallTitle')}</h3>
          <p>${I18n.t('paywallBody')}</p>
          <p class="tb-warn">${I18n.t('legalBanWarning')}</p>
          <div class="tb-plans">
            <button class="tb-pay" data-act="pay-monthly">€<span data-el="price-m">4</span> / ${I18n.t('uiMonth')}</button>
            <button class="tb-pay tb-pay-alt" data-act="pay-lifetime">€<span data-el="price-l">20</span> ${I18n.t('uiLifetime')}</button>
          </div>
          <label class="tb-consent"><input type="checkbox" data-el="consent" /> <span>${I18n.t('legalConsent')}</span></label>
          <input class="tb-key" data-el="key" placeholder="${I18n.t('uiKeyPlaceholder')}" />
          <button class="tb-activate" data-act="activate">${I18n.t('uiActivate')}</button>
          <div class="tb-pay-msg" data-el="pay-msg"></div>
          <div class="tb-legal"><span data-el="merchant"></span> · <a class="tb-link" data-act="open-terms" role="button" tabindex="0">${I18n.t('legalTerms')}</a> · <a class="tb-link" data-act="open-privacy" role="button" tabindex="0">${I18n.t('legalPrivacy')}</a></div>
          <a class="tb-link" data-act="paywall-close" role="button" tabindex="0">${I18n.t('uiClose')}</a>
        </div>
        <div class="tb-controls">
          <button class="tb-btn tb-start" data-act="start">${I18n.t('uiStart')}</button>
          <button class="tb-btn tb-pause" data-act="pause" disabled>${I18n.t('uiPause')}</button>
          <button class="tb-btn tb-stop" data-act="stop" disabled>${I18n.t('uiStop')}</button>
        </div>
        <div class="tb-status" data-el="status" role="status">${I18n.t('uiIdle')}</div>
        <div class="tb-stats" data-el="stats"></div>
        <div class="tb-modules" data-el="modules"></div>
        <div class="tb-inputs">
          <input class="tb-input" data-el="in-pvp" placeholder="${I18n.t('uiPvpPlaceholder')}" />
          <input class="tb-input" data-el="in-circle" placeholder="${I18n.t('uiCirclePlaceholder')}" />
        </div>
        <div class="tb-log" data-el="log" role="log" tabindex="0"></div>
        <div class="tb-footer">
          <span data-el="proto">${I18n.t('uiProtoWaiting')}</span>
          <a data-act="options" role="button" tabindex="0">${I18n.t('uiOptions')}</a>
        </div>
      </div>`;

    document.body.appendChild(root);
    logEl = root.querySelector('[data-el="log"]');

    root.addEventListener('click', onClick);
    // Keyboard: Enter/Space activates the non-<button> controls (chips, text actions).
    root.addEventListener('keydown', (ev) => {
      const t = ev.target;
      if ((ev.key === 'Enter' || ev.key === ' ') && t && t.getAttribute && t.getAttribute('data-act') && t.tagName !== 'BUTTON') {
        ev.preventDefault(); t.click();
      }
    });
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
    const ticker = setInterval(() => {
      if (!root.isConnected) { clearInterval(ticker); return; }  // panel removed by the page
      // Stop touching chrome.* once the extension is reloaded/updated and this
      // content script is orphaned (context invalidated).
      let dead = false; try { dead = !(chrome.runtime && chrome.runtime.id); } catch (_) { dead = true; }
      if (dead) { clearInterval(ticker); return; }
      renderStatus(Scheduler.status());
    }, 1000);
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
      case 'pay-monthly': if (requireConsent()) TB.License.openPayment(); break;
      case 'pay-lifetime': if (requireConsent()) TB.License.openPayment(); break;
      case 'activate': if (requireConsent()) doActivate(); break;
      case 'open-terms': openLegal('terms'); break;
      case 'open-privacy': openLegal('privacy'); break;
      default:
        if (act.startsWith('mod:')) toggleModule(act.slice(4));
    }
  }

  // EU: paying/activating requires the explicit Art. 16(m) waiver consent.
  function requireConsent() {
    const box = root.querySelector('[data-el="consent"]');
    if (box && box.checked) return true;
    const msg = root.querySelector('[data-el="pay-msg"]');
    if (msg) { msg.className = 'tb-pay-msg tb-err'; msg.textContent = I18n.t('legalNeedConsent'); }
    return false;
  }

  function openLegal(which) {
    const p = TB.License.payment() || {};
    const url = which === 'privacy' ? p.privacyUrl : p.termsUrl;
    if (url) chrome.runtime.sendMessage({ type: 'OPEN_URL', url }).catch(() => { try { window.open(url, '_blank'); } catch (_) {} });
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
      const mer = root.querySelector('[data-el="merchant"]');
      if (mer) mer.textContent = I18n.t('legalMerchant', [lic.payment.merchant || 'Carbon Stealth VCC']);
    }
    bar.classList.toggle('tb-lic-expired', !!(lic.status === 'expired' || lic.wrongDevice));
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
    fab.setAttribute('role', 'button'); fab.tabIndex = 0;
    fab.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); fab.click(); } });
    fab.onclick = () => { root.style.display = ''; fab.remove(); };
    document.body.appendChild(fab);
  }

  async function toggleModule(id) {
    const settings = Storage.get();
    if (!settings[id]) return;
    settings[id].enabled = !settings[id].enabled;
    await Storage.save(settings);
    renderModules();
    Logger.info(I18n.t(settings[id].enabled ? 'logModuleOn' : 'logModuleOff', [I18n.t('mod_' + id)]));
  }

  function setupInputs() {
    const s = Storage.get() || {};
    const pvp = root.querySelector('[data-el="in-pvp"]');
    const circle = root.querySelector('[data-el="in-circle"]');
    if (pvp) {
      pvp.value = (s.pvp && s.pvp.opponents) || '';
      pvp.addEventListener('change', async () => {
        const cur = Storage.get();
        (cur.pvp = cur.pvp || {}).opponents = pvp.value.trim();
        await Storage.save(cur);
        Logger.info(I18n.t('logPvpTargetsSet', [pvp.value.trim() || '-']));
      });
    }
    if (circle) {
      circle.value = (s.circle && s.circle.manualNodes) || '';
      circle.addEventListener('change', async () => {
        const cur = Storage.get();
        const val = circle.value.trim();
        cur.circle = cur.circle || {};
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
        Logger.info(I18n.t('logCircleNodesSet', [desc || val || '-']));
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
      chip.setAttribute('role', 'switch');
      chip.setAttribute('aria-checked', on ? 'true' : 'false');
      chip.tabIndex = 0;
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
    // On a break the engine is "running" but idle by design: show it as its own
    // calm state, never with the live running glow.
    root.classList.toggle('tb-running', !!(st.running && !st.paused && !st.onBreak));
    root.classList.toggle('tb-paused', !!st.paused);
    root.classList.toggle('tb-break', !!(st.running && !st.paused && st.onBreak));
    const startBtn = root.querySelector('[data-act="start"]');
    const stopBtn = root.querySelector('[data-act="stop"]');
    const pauseBtn = root.querySelector('[data-act="pause"]');
    startBtn.disabled = st.running;
    stopBtn.disabled = !st.running;
    pauseBtn.disabled = !st.running;
    pauseBtn.textContent = st.paused ? I18n.t('uiResume') : I18n.t('uiPause');

    const status = root.querySelector('[data-el="status"]');
    const returnAt = TB.State.get().adventureReturnAt || 0;
    // "Next action in" = the earliest moment the next action CAN happen: the
    // scheduler's next evaluation (programmed interval / humanized delay), but
    // never before the game's busy timer ends - while the character is on a
    // 14-minute task the scheduler's idle polls are not actions and must not
    // be shown as "in 8s".
    const nextTick = st.nextAt || 0;
    const nextAt = returnAt > Date.now() ? Math.max(returnAt, nextTick) : (nextTick > Date.now() ? nextTick : 0);
    if (!st.running) status.textContent = I18n.t('uiIdle');
    else if (st.onBreak) status.textContent = I18n.t('uiOnBreak');
    else if (st.paused) status.textContent = I18n.t('uiPaused');
    else if (st.currentAction) status.innerHTML = I18n.t('uiRunningAction', [I18n.t('mod_' + st.currentAction)]);
    else if (nextAt) status.innerHTML = I18n.t('uiNextIn', [`<b>${fmtDuration(nextAt - Date.now())}</b>`]);
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
      // Pin the current position inline BEFORE dropping the tb-left class, or
      // a plain click on a left-docked panel makes it jump to the right edge.
      target.style.left = r.left + 'px';
      target.style.top = r.top + 'px';
      target.style.right = 'auto';
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
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
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
