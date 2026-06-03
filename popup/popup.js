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

let entitled = true;

function send(message) { return chrome.runtime.sendMessage(message).catch(() => null); }
function control(action) { send({ type: 'CONTROL', action }).then(() => setTimeout(refresh, 150)); }

els.start.addEventListener('click', () => control('start'));
els.stop.addEventListener('click', () => control('stop'));
els.pause.addEventListener('click', () => {
  control(els.pause.dataset.paused === '1' ? 'resume' : 'pause');
});
document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('show-panel').addEventListener('click', () => control('showPanel'));
els.payMonthly.addEventListener('click', () => send({ type: 'OPEN_PAYMENT' }));
els.payLifetime.addEventListener('click', () => send({ type: 'OPEN_PAYMENT' }));
els.activate.addEventListener('click', activate);

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
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}

async function refreshLicense() {
  const lic = await send({ type: 'GET_LICENSE' });
  if (!lic || !lic.status) return;
  entitled = !!lic.entitled;
  if (lic.payment) {
    els.priceM.textContent = lic.payment.priceEur;
    els.priceL.textContent = lic.payment.lifetimePriceEur;
  }
  els.license.classList.toggle('expired', lic.status === 'expired' || lic.wrongDevice);
  if (lic.wrongDevice) els.license.innerHTML = '<b>' + t('licWrongDevice') + '</b>';
  else if (lic.status === 'lifetime') els.license.innerHTML = t('licLifetime');
  else if (lic.status === 'active') els.license.innerHTML = t('licActive', [String(lic.daysLeft)]);
  else if (lic.status === 'trial') els.license.innerHTML = t('licTrial', [String(lic.daysLeft)]);
  else if (lic.status === 'expired') els.license.innerHTML = '<b>' + t('licExpired') + '</b>';
  else els.license.textContent = t('licChecking');
  els.subscribe.classList.toggle('hidden', entitled);
}

async function refresh() {
  const res = await send({ type: 'GET_STATUS' });
  if (!res || !res.ok) {
    els.noGame.classList.remove('hidden');
    els.start.disabled = els.stop.disabled = els.pause.disabled = true;
    els.statusText.textContent = t('popupNoGame');
    return;
  }
  els.noGame.classList.add('hidden');

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
    ? `${c.name || '?'} · ${fmt(c.gold || 0)}g · ${c.bloodstones || 0}💎`
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
refresh();
setInterval(refresh, 1500);
setInterval(refreshLicense, 5000);
