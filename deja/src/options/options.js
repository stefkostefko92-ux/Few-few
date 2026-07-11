// Déjà — настройки: retention, потребителски denylist, огледало на модела.

import { getSettings, patchSettings, BUILTIN_DENYLIST } from '../lib/settings.js';
import { applyI18n, t } from '../lib/i18n.js';

applyI18n();

const retentionEl = document.getElementById('retention');
const denylistEl = document.getElementById('denylist');
const builtinEl = document.getElementById('builtin');
const modelHostEl = document.getElementById('modelHost');
const saveBtn = document.getElementById('save');
const savedEl = document.getElementById('saved');

const RETENTION_CHOICES = [0, 3, 6, 12, 24];

function fillRetention(selected) {
  retentionEl.replaceChildren();
  for (const months of RETENTION_CHOICES) {
    const opt = document.createElement('option');
    opt.value = String(months);
    opt.textContent =
      months === 0 ? t('optRetentionForever') : t('optRetentionMonths', [String(months)]);
    opt.selected = months === selected;
    retentionEl.append(opt);
  }
}

async function load() {
  const settings = await getSettings();
  fillRetention(settings.retentionMonths);
  denylistEl.value = settings.userDenylist.join('\n');
  modelHostEl.value = settings.modelHost;
  builtinEl.textContent = BUILTIN_DENYLIST.join(' · ');
}

saveBtn.addEventListener('click', async () => {
  const modelHost = modelHostEl.value.trim();
  // само https (или localhost за разработка) — http огледало би течало заявки в чист текст
  if (modelHost && !/^https:\/\//.test(modelHost) && !/^http:\/\/localhost[:/]/.test(modelHost)) {
    savedEl.textContent = t('optModelHostInvalid');
    setTimeout(() => (savedEl.textContent = ''), 3000);
    return;
  }
  await patchSettings({
    retentionMonths: Number(retentionEl.value) || 0,
    userDenylist: denylistEl.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    modelHost,
  });
  savedEl.textContent = t('optSaved');
  setTimeout(() => (savedEl.textContent = ''), 2000);
});

load();
