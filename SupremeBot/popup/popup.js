/**
 * Popup: a compact remote control for the bot running in the active game tab,
 * plus the subscription panel (status, Revolut payment, key activation) which
 * talks to the service worker directly and works even with no game tab open.
 */

function t(key, subs) { return chrome.i18n.getMessage(key, subs) || key; }

function localize() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });
}

const els = {
  noGame: document.getElementById('no-game'),
  dot: document.getElementById('dot'),
  statusText: document.getElementById('status-text'),
  char: document.getElementById('char'),
  license: document.getElementById('license'),
  stats: document.getElementById('stats'),
  start: document.getElementById('btn-start'),
  pause: document.getElementById('btn-pause'),
  stop: document.getElementById('btn-stop'),
  subscribe: document.getElementById('subscribe'),
  priceM: document.getElementById('price-m'),
  priceL: document.getElementById('price-l'),
  payMonthly: document.getElementById('pay-monthly'),
  payLifetime: document.getElementById('pay-lifetime'),
  key: document.getElementById('key'),
  activate: document.getElementById('btn-activate'),
  payMsg: document.getElementById('pay-msg')
};

// Pessimistic until the first GET_LICENSE response: an expired user should
// never see an enabled Start button, even briefly.
let entitled = false;

function send(message) { return chrome.runtime.sendMessage(message).catch(() => null); }

// Which game tab this popup controls. The popup knows the window it belongs
// to, so the tab you are LOOKING AT wins; the service worker used to guess
// (first game tab it found), which with several heroes open drove the wrong
// one. With no game tab in front and several heroes open, a picker appears.
const GAME_URL = 'https://*.tanoth.gameforge.com/*';
const isGame = (u) => /^https:\/\/[^/]*\.tanoth\.gameforge\.com\//.test(u || '');
let targetTabId = null;
async function resolveTarget() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  if (active && isGame(active.url)) { targetTabId = active.id; renderPicker([]); return; }
  const games = await chrome.tabs.query({ url: GAME_URL }).catch(() => []);
  if (!games.some((g) => g.id === targetTabId)) targetTabId = games[0] ? games[0].id : null;
  renderPicker(games);
}
async function renderPicker(games) {
  let pick = document.getElementById('hero-pick');
  if (games.length < 2) { if (pick) pick.remove(); return; }
  if (!pick) {
    pick = document.createElement('select');
    pick.id = 'hero-pick'; pick.className = 'hero-pick';
    pick.setAttribute('aria-label', t('popupPickHero'));
    pick.addEventListener('change', () => { targetTabId = Number(pick.value); refresh(); });
    document.querySelector('header').after(pick);
  }
  const opts = await Promise.all(games.map(async (g) => {
    const st = await send({ type: 'GET_STATUS', tabId: g.id });
    const c = (st && st.state) || {};
    const srv = (g.url.match(/^https:\/\/([\w-]+)\.tanoth/) || [])[1] || '';
    return { id: g.id, label: (c.name || t('popupUnknownHero')) + (srv ? ' · ' + srv : '') };
  }));
  pick.replaceChildren(...opts.map((o) => { const op = document.createElement('option'); op.value = String(o.id); op.textContent = o.label; op.selected = o.id === targetTabId; return op; }));
}

async function control(action) {
  const r = await send({ type: 'CONTROL', action, tabId: targetTabId });
  if (!r || !r.ok) {
    // Never fail silently: after an extension reload the old game tab cannot
    // answer until it is reloaded, which looked like "Start does nothing".
    els.statusText.textContent = t(r && r.error === 'TAB_UNREACHABLE' ? 'popupReloadGame' : 'popupNoGame');
    els.noGame.classList.remove('hidden');
    return;
  }
  setTimeout(refresh, 150);
}

els.start.addEventListener('click', () => control('start'));
els.stop.addEventListener('click', () => control('stop'));
els.pause.addEventListener('click', () => {
  control(els.pause.dataset.paused === '1' ? 'resume' : 'pause');
});
// Settings open straight on the hero this popup controls (his own settings).
let currentHeroKey = null;
document.getElementById('open-options').addEventListener('click', () => {
  if (currentHeroKey) chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') + '?hero=' + encodeURIComponent(currentHeroKey) });
  else chrome.runtime.openOptionsPage();
});
document.getElementById('open-stats').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('stats/stats.html') }));
document.getElementById('show-panel').addEventListener('click', () => control('showPanel'));
const consentBox = document.getElementById('consent');
function requireConsent() {
  if (consentBox && consentBox.checked) return true;
  els.payMsg.className = 'pay-msg err';
  els.payMsg.textContent = t('legalNeedConsent');
  return false;
}
let paymentInfo = {};
document.getElementById('open-terms').addEventListener('click', () => { if (paymentInfo.termsUrl) send({ type: 'OPEN_URL', url: paymentInfo.termsUrl }); });
document.getElementById('open-privacy').addEventListener('click', () => { if (paymentInfo.privacyUrl) send({ type: 'OPEN_URL', url: paymentInfo.privacyUrl }); });
els.payMonthly.addEventListener('click', () => { if (requireConsent()) send({ type: 'OPEN_PAYMENT' }); });
els.payLifetime.addEventListener('click', () => { if (requireConsent()) send({ type: 'OPEN_PAYMENT' }); });
els.activate.addEventListener('click', () => { if (requireConsent()) activate(); });

async function activate() {
  const key = (els.key.value || '').trim();
  if (!key) return;
  els.payMsg.className = 'pay-msg';
  els.payMsg.textContent = t('uiActivating');
  const res = await send({ type: 'ACTIVATE_LICENSE', key });
  if (res && res.ok) {
    els.payMsg.className = 'pay-msg ok';
    els.payMsg.textContent = t('uiActivated');
  } else {
    els.payMsg.className = 'pay-msg err';
    els.payMsg.textContent = t(res && res.error === 'EXPIRED_KEY' ? 'uiKeyExpired' : 'uiKeyInvalid');
  }
  refreshLicense();
}

function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

async function refreshLicense() {
  const lic = await send({ type: 'GET_LICENSE' });
  if (!lic || !lic.status) return;
  entitled = !!lic.entitled;
  if (lic.payment) {
    paymentInfo = lic.payment;
    els.priceM.textContent = lic.payment.priceEur;
    els.priceL.textContent = lic.payment.lifetimePriceEur;
    const mer = document.getElementById('merchant');
    if (mer) mer.textContent = t('legalMerchant', [lic.payment.merchant || 'Carbon Stealth VCC']);
  }
  els.license.classList.toggle('expired', !!(lic.status === 'expired' || lic.wrongDevice));
  if (lic.wrongDevice) els.license.innerHTML = '<b>' + t('licWrongDevice') + '</b>';
  else if (lic.status === 'lifetime') els.license.innerHTML = t('licLifetime');
  else if (lic.status === 'active') els.license.innerHTML = t('licActive', [String(lic.daysLeft)]);
  else if (lic.status === 'trial') els.license.innerHTML = t('licTrial', [String(lic.daysLeft)]);
  else if (lic.status === 'expired') els.license.innerHTML = '<b>' + t('licExpired') + '</b>';
  else els.license.textContent = t('licChecking');
  els.subscribe.classList.toggle('hidden', entitled);
}

async function refresh() {
  const res = await send({ type: 'GET_STATUS', tabId: targetTabId });
  if (!res || !res.ok) {
    els.noGame.classList.remove('hidden');
    els.start.disabled = els.stop.disabled = els.pause.disabled = true;
    els.statusText.textContent = t(res && res.error === 'TAB_UNREACHABLE' ? 'popupReloadGame' : 'popupNoGame');
    return;
  }
  els.noGame.classList.add('hidden');
  currentHeroKey = res.heroKey || null;

  const st = res.status || {};
  els.dot.className = 'dot' + (st.running && !st.paused ? ' running' : st.paused ? ' paused' : '');
  els.statusText.textContent = !st.running ? t('uiIdle')
    : st.onBreak ? t('uiOnBreak')
    : st.paused ? t('uiPaused')
    : st.currentAction ? t('uiRunningAction', [t('mod_' + st.currentAction)]) : t('uiRunning');

  els.start.disabled = st.running || !entitled;
  els.stop.disabled = !st.running;
  els.pause.disabled = !st.running;
  els.pause.dataset.paused = st.paused ? '1' : '0';
  els.pause.textContent = st.paused ? t('uiResume') : t('uiPause');

  const c = res.state || {};
  els.char.textContent = c.loggedIn
    ? `${c.name || '?'} · ${fmt(c.gold || 0)} ${t('nfGold').toLowerCase()} · ${c.bloodstones || 0} 💎`
    : (res.protocolReady ? t('popupNoChar') : t('uiProtoWaiting'));

  const s = res.session || {};
  const rows = [
    ['statAdventures', s.adventures || 0],
    ['statCircle', s.circleNodes || 0],
    ['statGold', fmt(s.goldEarned || 0)],
    ['statXp', fmt(s.xpEarned || 0)]
  ];
  els.stats.innerHTML = rows.map(([k, v]) =>
    `<div class="row"><span>${t(k)}</span><b>${v}</b></div>`).join('');
}

localize();
refreshLicense();
resolveTarget().then(refresh);
setInterval(refresh, 1500);
setInterval(resolveTarget, 4000);   // a hero tab opened/closed while the popup is up
setInterval(refreshLicense, 5000);
