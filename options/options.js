/**
 * Options page. Renders a settings form straight from a declarative schema
 * that mirrors DEFAULT_SETTINGS, so adding a field is a one-line change here
 * plus a label in the locale file. Labels/descriptions resolve through
 * chrome.i18n, which falls back to the default (English) locale for any key a
 * translation is missing — that is how the 6 supported languages degrade
 * gracefully for advanced options.
 */
import { DEFAULT_SETTINGS, mergeSettings } from '../src/shared/defaults.js';

function t(key, subs) { return chrome.i18n.getMessage(key, subs) || key; }

const STATS = ['mix', 'strength', 'dexterity', 'constitution', 'intelligence'];
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Arcane Circle nodes (names from the Tanoth wiki) -> RPC node number.
const CIRCLE_NODES = [
  { n: 1, label: 'Jade — +exp' }, { n: 2, label: 'Aquamarine — potion duration' },
  { n: 3, label: 'Sapphire — fame' }, { n: 4, label: 'Emerald — sell price' },
  { n: 5, label: 'Ruby — potion power' }, { n: 6, label: 'Topaz — inventory slots' },
  { n: 7, label: 'Amber — work salary' }, { n: 8, label: 'Amethyst — adventure gold' },
  { n: 9, label: 'Diamond — shop discount' }, { n: 10, label: "Tiger's Eye — travel speed" },
  { n: 11, label: 'Negotiation Rune — INT' }, { n: 12, label: 'Wisdom Rune — CON' },
  { n: 13, label: 'Diligence Rune — DEX' }, { n: 14, label: 'Courage Rune — STR' },
  { n: 15, label: 'Glory Rune — drop rate' }, { n: 16, label: 'Demon Skull — major bonuses' }
];

// Map location fields (names from the Tanoth wiki), index = map slot.
const MAP_LOCATIONS = [
  'Forest of the Hanged Men', 'Forest of the Hanged Men — Rat',
  'Swamp of the Forgotten', 'Swamp of the Forgotten — Old Ruins', 'Swamp of the Forgotten — Goblin',
  'Sea of Dunes', 'Sea of Dunes — Large Forge', 'Sea of Dunes — Ocr', 'Sea of Dunes — Giant Rat',
  'Old Shore', 'Old Shore — Hell Wolf', 'Old Shore — Scorpion', "Old Shore — Sanctum of Shal'ah",
  'Lowlands of Thun', 'Frozen Peaks', 'Dragon Lair', 'Forgotten Crypt'
];

/* Field types: bool | number | text | time | select(options) */
const SCHEMA = [
  { id: 'general', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'startOnLoad', type: 'bool' },
    { k: 'humanize', type: 'bool' },
    { k: 'minActionDelayMs', type: 'number', min: 300, max: 60000, step: 100 },
    { k: 'maxActionDelayMs', type: 'number', min: 500, max: 120000, step: 100 },
    { k: 'pauseAfterErrors', type: 'number', min: 0, max: 50 },
    { k: 'keepGoldReserve', type: 'number', min: 0 },
    { k: 'notifications', type: 'bool' },
    { k: 'notifyOnLevelUp', type: 'bool' },
    { k: 'notifyOnStop', type: 'bool' },
    { k: 'theme', type: 'select', options: ['dark', 'light'] },
    { k: 'panelPosition', type: 'select', options: ['right', 'left'] }
  ] },
  { id: 'adventures', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'strategy', type: 'select', options: ['gold', 'experience', 'shortest', 'longest'] },
    { k: 'difficulty', type: 'select', options: ['easy', 'medium', 'difficult', 'very_difficult'] },
    { k: 'serverSpeed', type: 'number', min: 1, max: 100 },
    { k: 'useBloodstones', type: 'bool' },
    { k: 'bloodstoneReserve', type: 'number', min: 0 }
  ] },
  { id: 'circle', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'mode', type: 'select', options: ['auto', 'manual'] },
    { k: 'manualNodes', type: 'circleNodes' },
    { k: 'currency', type: 'select', options: ['gold', 'bs'] },
    { k: 'multiple', type: 'select', options: [1, 10] },
    { k: 'stopAtCenterLevel', type: 'number', min: 1, max: 10 },
    { k: 'keepGoldReserve', type: 'number', min: 0 }
  ] },
  { id: 'training', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'priorityStat', type: 'select', options: STATS },
    { k: 'maxGoldSpend', type: 'number', min: 0 },
    { k: 'keepGoldReserve', type: 'number', min: 0 }
  ] },
  { id: 'dungeon', fields: [
    { k: 'enabled', type: 'bool' }
  ] },
  { id: 'map', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'encounters', type: 'bool' },
    { k: 'buyEnergy', type: 'bool' },
    { k: 'locations', type: 'mapLocations' },
    { k: 'illusionCave', type: 'bool' },
    { k: 'dragon', type: 'bool' },
    { k: 'cooldownMinutes', type: 'number', min: 5, max: 600 }
  ] },
  { id: 'pvp', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'opponents', type: 'text' },
    { k: 'maxPerDay', type: 'number', min: 0, max: 100 },
    { k: 'cooldownSeconds', type: 'number', min: 5, max: 600 }
  ] },
  { id: 'work', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'durationHours', type: 'number', min: 1, max: 24 },
    { k: 'stopWhenAdventureReady', type: 'bool' }
  ] },
  { id: 'autosell', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'sellCommon', type: 'bool' },
    { k: 'sellSpecial', type: 'bool' },
    { k: 'dumpSchema', type: 'bool' }
  ] },
  { id: 'autologin', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'reloadOnDisconnect', type: 'bool' },
    { k: 'maxReloadAttempts', type: 'number', min: 1, max: 50 }
  ] },
  { id: 'scheduler', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'activeFrom', type: 'time' },
    { k: 'activeTo', type: 'time' },
    { k: 'randomBreaks', type: 'bool' },
    { k: 'breakEveryMinutes', type: 'number', min: 5, max: 600 },
    { k: 'breakDurationMinutes', type: 'number', min: 1, max: 180 }
  ] }
];

let settings = mergeSettings(null);

const navEl = document.getElementById('nav');
const formEl = document.getElementById('form');
const hintEl = document.getElementById('saved-hint');

function fieldLabel(section, key) { return t(`opt_${section}_${key}`); }
function optionLabel(value) { return t(`optv_${value}`); }

function render() {
  navEl.innerHTML = '';
  formEl.innerHTML = '';

  SCHEMA.forEach((group, gi) => {
    const a = document.createElement('a');
    a.textContent = t(`optgrp_${group.id}`);
    a.href = `#sec-${group.id}`;
    if (gi === 0) a.classList.add('active');
    a.addEventListener('click', () => {
      navEl.querySelectorAll('a').forEach((n) => n.classList.remove('active'));
      a.classList.add('active');
    });
    navEl.appendChild(a);

    const sec = document.createElement('section');
    sec.className = 'group';
    sec.id = `sec-${group.id}`;
    sec.innerHTML = `<h2>${t(`optgrp_${group.id}`)}</h2><p class="desc">${t(`optgrp_${group.id}_d`)}</p>`;

    group.fields.forEach((f) => sec.appendChild(renderField(group.id, f)));
    formEl.appendChild(sec);
  });
}

function renderChecklist(section, f) {
  const row = document.createElement('div');
  row.className = 'field checklist-field';
  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b>${fieldLabel(section, f.k)}</b>`;
  row.appendChild(label);

  const box = document.createElement('div');
  box.className = 'checklist';

  // Circle stores node NUMBERS; map stores location NAMES.
  const isCircle = f.type === 'circleNodes';
  const items = isCircle
    ? CIRCLE_NODES.map((c) => ({ value: c.n, label: c.label }))
    : MAP_LOCATIONS.map((name, i) => ({ value: name, label: `${i}. ${name}` }));

  const current = String(settings[section][f.k] || '').split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const selected = new Set(current.map((s) => isCircle ? String(parseInt(s, 10)) : s.toLowerCase()));

  function commit() {
    const chosen = Array.from(box.querySelectorAll('input:checked')).map((cb) => cb.value);
    settings[section][f.k] = chosen.join(', ');
    if (isCircle) settings.circle.mode = chosen.length ? 'manual' : 'auto';
  }

  items.forEach((it) => {
    const lab = document.createElement('label');
    lab.className = 'check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = String(it.value);
    cb.checked = isCircle ? selected.has(String(it.value)) : selected.has(String(it.value).toLowerCase());
    cb.addEventListener('change', commit);
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode(' ' + it.label));
    box.appendChild(lab);
  });

  row.appendChild(box);
  return row;
}

function renderField(section, f) {
  if (f.type === 'circleNodes' || f.type === 'mapLocations') return renderChecklist(section, f);
  const val = settings[section][f.k];
  const row = document.createElement('div');
  row.className = 'field';

  const label = document.createElement('div');
  label.className = 'label';
  label.innerHTML = `<b>${fieldLabel(section, f.k)}</b>`;

  const control = document.createElement('div');
  control.className = 'control';

  let input;
  if (f.type === 'bool') {
    input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!val;
    input.addEventListener('change', () => { settings[section][f.k] = input.checked; });
  } else if (f.type === 'select') {
    input = document.createElement('select');
    f.options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = optionLabel(opt);
      if (opt === val) o.selected = true;
      input.appendChild(o);
    });
    input.addEventListener('change', () => { settings[section][f.k] = input.value; });
  } else if (f.type === 'number') {
    input = document.createElement('input');
    input.type = 'number';
    if (f.min != null) input.min = f.min;
    if (f.max != null) input.max = f.max;
    if (f.step != null) input.step = f.step;
    input.value = val;
    input.addEventListener('change', () => { settings[section][f.k] = Number(input.value); });
  } else if (f.type === 'time') {
    input = document.createElement('input');
    input.type = 'time';
    input.value = val;
    input.addEventListener('change', () => { settings[section][f.k] = input.value; });
  } else {
    input = document.createElement('input');
    input.type = 'text';
    input.value = val;
    input.addEventListener('change', () => { settings[section][f.k] = input.value; });
  }

  control.appendChild(input);
  row.appendChild(label);
  row.appendChild(control);
  return row;
}

async function load() {
  settings = mergeSettings(await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }));
  render();
}

document.getElementById('save').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'SAVE_SETTINGS', settings });
  hintEl.textContent = t('optSaved');
  setTimeout(() => { hintEl.textContent = ''; }, 2500);
});

document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm(t('optConfirmReset'))) return;
  const r = await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' });
  settings = mergeSettings(r.settings || DEFAULT_SETTINGS);
  render();
  hintEl.textContent = t('optResetDone');
  setTimeout(() => { hintEl.textContent = ''; }, 2500);
});

document.getElementById('reset-stats').addEventListener('click', async () => {
  if (!confirm(t('optConfirmResetStats'))) return;
  await chrome.runtime.sendMessage({ type: 'RESET_STATS' });
  hintEl.textContent = t('optStatsReset');
  setTimeout(() => { hintEl.textContent = ''; }, 2500);
});

/* ----------------------------- subscription ---------------------------- */

const subEl = {
  card: document.getElementById('sub'),
  price: document.getElementById('sub-price'),
  status: document.getElementById('sub-status'),
  pay: document.getElementById('sub-pay'),
  key: document.getElementById('sub-key'),
  activate: document.getElementById('sub-activate'),
  msg: document.getElementById('sub-msg'),
  note: document.querySelector('.sub-note')
};

subEl.pay.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'OPEN_PAYMENT' }));
subEl.activate.addEventListener('click', async () => {
  const key = (subEl.key.value || '').trim();
  if (!key) return;
  subEl.msg.className = 'sub-msg';
  subEl.msg.textContent = t('uiActivating');
  const res = await chrome.runtime.sendMessage({ type: 'ACTIVATE_LICENSE', key });
  if (res && res.ok) {
    subEl.msg.className = 'sub-msg ok';
    subEl.msg.textContent = t('uiActivated');
  } else {
    subEl.msg.className = 'sub-msg err';
    subEl.msg.textContent = t(res && res.error === 'EXPIRED_KEY' ? 'uiKeyExpired' : 'uiKeyInvalid');
  }
  renderSubscription();
});

async function renderSubscription() {
  const lic = await chrome.runtime.sendMessage({ type: 'GET_LICENSE' });
  if (!lic || !lic.status) return;
  if (lic.payment) subEl.price.textContent = '€' + lic.payment.priceEur;
  subEl.note.textContent = t('subNote', [String(lic.payment ? lic.payment.trialDays : 3)]);
  subEl.card.classList.toggle('expired', lic.status === 'expired');
  if (lic.status === 'active') subEl.status.innerHTML = t('licActive', [String(lic.daysLeft)]);
  else if (lic.status === 'trial') subEl.status.innerHTML = t('licTrial', [String(lic.daysLeft)]);
  else if (lic.status === 'expired') subEl.status.innerHTML = '<b>' + t('licExpired') + '</b>';
  else subEl.status.textContent = t('licChecking');
}

// Localize static document title/brand + placeholders.
document.querySelectorAll('[data-i18n]').forEach((el) => {
  el.textContent = t(el.getAttribute('data-i18n'));
});
document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
  el.placeholder = t(el.getAttribute('data-i18n-ph'));
});

load();
renderSubscription();
