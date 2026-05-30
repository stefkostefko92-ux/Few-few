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

const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const STATS = ['strength', 'dexterity', 'constitution', 'intelligence', 'agility'];

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
    { k: 'strategy', type: 'select', options: ['shortest', 'longest', 'maxXp', 'maxGold', 'safest'] },
    { k: 'maxDifficulty', type: 'number', min: 1, max: 10 },
    { k: 'minSuccessChance', type: 'number', min: 0, max: 100 },
    { k: 'useBloodstones', type: 'bool' },
    { k: 'bloodstoneReserve', type: 'number', min: 0 },
    { k: 'dailyLimit', type: 'number', min: 0 }
  ] },
  { id: 'combat', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'targetStrategy', type: 'select', options: ['weakest', 'lowestLevel', 'highestGold', 'random'] },
    { k: 'avoidGuildMembers', type: 'bool' },
    { k: 'minLevelDiff', type: 'number', min: -50, max: 0 },
    { k: 'maxLevelDiff', type: 'number', min: 0, max: 50 },
    { k: 'recordStats', type: 'bool' },
    { k: 'maxDuelsPerCycle', type: 'number', min: 1, max: 50 }
  ] },
  { id: 'training', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'priorityStat', type: 'select', options: STATS },
    { k: 'fallbackStat', type: 'select', options: STATS },
    { k: 'maxGoldSpend', type: 'number', min: 0 },
    { k: 'keepGoldReserve', type: 'number', min: 0 }
  ] },
  { id: 'dungeon', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'autoRun', type: 'bool' },
    { k: 'difficulty', type: 'select', options: ['easy', 'normal', 'hard'] },
    { k: 'minHealthPercent', type: 'number', min: 0, max: 100 }
  ] },
  { id: 'cave', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'useBloodstones', type: 'bool' },
    { k: 'bloodstoneReserve', type: 'number', min: 0 },
    { k: 'targetFloor', type: 'number', min: 0 }
  ] },
  { id: 'work', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'durationHours', type: 'number', min: 1, max: 10 },
    { k: 'preferredJob', type: 'text' },
    { k: 'stopWhenAdventureReady', type: 'bool' }
  ] },
  { id: 'runes', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'autoUpgrade', type: 'bool' },
    { k: 'autoSellDuplicates', type: 'bool' },
    { k: 'minRarityToKeep', type: 'select', options: RARITY }
  ] },
  { id: 'autosell', fields: [
    { k: 'enabled', type: 'bool' },
    { k: 'sellCommon', type: 'bool' },
    { k: 'sellUnique', type: 'bool' },
    { k: 'sellRunes', type: 'bool' },
    { k: 'sellPotions', type: 'bool' },
    { k: 'keepRarity', type: 'select', options: RARITY },
    { k: 'keepEquippableUpgrades', type: 'bool' }
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

function renderField(section, f) {
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

// Localize static document title/brand.
document.querySelectorAll('[data-i18n]').forEach((el) => {
  el.textContent = t(el.getAttribute('data-i18n'));
});

load();
