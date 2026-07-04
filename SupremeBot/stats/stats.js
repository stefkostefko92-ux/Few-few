/**
 * Statistics dashboard: totals, per-hour rates and an activity breakdown chart.
 * Reads accumulated stats from the service worker (GET_STATS).
 */
function t(key, subs) { return chrome.i18n.getMessage(key, subs) || key; }
function fmt(n) {
  if (n == null) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(Math.round(n));
}

const CARDS = [
  ['adventures', 'statAdventures'],
  ['encounters', 'statEncounters'],
  ['dungeonRuns', 'statDungeon'],
  ['shadowRuns', 'statShadow'],
  ['eventQuests', 'statEvent'],
  ['caveRuns', 'statCave'],
  ['dragonRuns', 'statDragon'],
  ['workShifts', 'statWork'],
  ['circleNodes', 'statCircle'],
  ['attributesRaised', 'statTraining'],
  ['itemsSold', 'statSold'],
  ['goldEarned', 'statGold'],
  ['goldDonated', 'statDonated'],
  ['xpEarned', 'statXp'],
  ['errors', 'statErrors']
];

const CHART = [
  ['adventures', 'statAdventures'],
  ['encounters', 'statEncounters'],
  ['dungeonRuns', 'statDungeon'],
  ['caveRuns', 'statCave'],
  ['dragonRuns', 'statDragon'],
  ['workShifts', 'statWork'],
  ['circleNodes', 'statCircle'],
  ['attributesRaised', 'statTraining'],
  ['duelsWon', 'statDuels'],
  ['itemsSold', 'statSold']
];

async function render() {
  const s = await chrome.runtime.sendMessage({ type: 'GET_STATS' });
  if (!s) return;
  const since = s.since || Date.now();
  const hours = Math.max(0.01, (Date.now() - since) / 3600000);
  document.getElementById('since').textContent =
    t('statsSince', [new Date(since).toLocaleString(), hours.toFixed(1)]);

  document.getElementById('cards').innerHTML = CARDS.map(([k, label]) => {
    const v = s[k] || 0;
    const rate = v / hours;
    return `<div class="card"><div class="v">${fmt(v)}</div>
      <div class="l">${t(label)}</div>
      <div class="r">${fmt(rate)}/${t('statsPerHour')}</div></div>`;
  }).join('');

  const max = Math.max(1, ...CHART.map(([k]) => s[k] || 0));
  document.getElementById('chart').innerHTML = CHART.map(([k, label]) => {
    const v = s[k] || 0;
    const pct = Math.round((v / max) * 100);
    return `<div class="bar"><span class="name">${t(label)}</span>
      <span class="track"><span class="fill" style="width:${pct}%"></span></span>
      <span class="val">${fmt(v)}</span></div>`;
  }).join('');
}

document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm(t('statsResetConfirm'))) return;
  await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
  render();
});

document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.getAttribute('data-i18n')); });
render();
setInterval(render, 5000);
