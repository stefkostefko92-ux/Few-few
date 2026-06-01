/**
 * Popup: a compact remote control for the bot running in the active game tab.
 * It does not run any automation itself — it relays start/stop/pause commands
 * through the service worker and polls live status + stats for display.
 */

function t(key, subs) { return chrome.i18n.getMessage(key, subs) || key; }

function localize() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
}

const els = {
  noGame: document.getElementById('no-game'),
  dot: document.getElementById('dot'),
  statusText: document.getElementById('status-text'),
  char: document.getElementById('char'),
  stats: document.getElementById('stats'),
  start: document.getElementById('btn-start'),
  pause: document.getElementById('btn-pause'),
  stop: document.getElementById('btn-stop')
};

function send(message) {
  return chrome.runtime.sendMessage(message).catch(() => null);
}

function control(action) {
  send({ type: 'CONTROL', action }).then(() => setTimeout(refresh, 150));
}

els.start.addEventListener('click', () => control('start'));
els.stop.addEventListener('click', () => control('stop'));
els.pause.addEventListener('click', () => {
  const paused = els.pause.dataset.paused === '1';
  control(paused ? 'resume' : 'pause');
});
document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('show-panel').addEventListener('click', () => control('showPanel'));

function fmt(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
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

  els.start.disabled = st.running;
  els.stop.disabled = !st.running;
  els.pause.disabled = !st.running;
  els.pause.dataset.paused = st.paused ? '1' : '0';
  els.pause.textContent = st.paused ? t('uiResume') : t('uiPause');

  const c = res.state || {};
  els.char.textContent = c.loggedIn
    ? `${c.name || '?'} · ${t('uiLevel')} ${c.level || 0} · ${fmt(c.gold || 0)}g · ${c.bloodstones || 0}💎`
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
refresh();
setInterval(refresh, 1500);
