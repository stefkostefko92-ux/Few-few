// Déjà — настройки: retention, потребителски denylist, огледало на модела.

import { getSettings, patchSettings, BUILTIN_DENYLIST } from '../lib/settings.js';
import { applyI18n, t } from '../lib/i18n.js';
import { initAmbient } from '../lib/ambient.js';
import { availability, pickLanguage } from '../lib/answer.js';
import {
  enableBookmarks,
  disableBookmarks,
  watchBookmarks,
  statusLine,
} from '../lib/bookmarks-ui.js';

applyI18n();
initAmbient();

const retentionEl = document.getElementById('retention');
const denylistEl = document.getElementById('denylist');
const builtinEl = document.getElementById('builtin');
const modelHostEl = document.getElementById('modelHost');
const saveBtn = document.getElementById('save');
const savedEl = document.getElementById('saved');
const ambientEl = document.getElementById('ambientMotion');

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
  ambientEl.checked = settings.ambientMotion !== false;
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
    ambientMotion: ambientEl.checked,
  });
  savedEl.textContent = t('optSaved');
  setTimeout(() => (savedEl.textContent = ''), 2000);
});

// Отметките: ключът действа веднага (правото се иска в момента на клика —
// жестът на потребителя не бива да чака бутона „Запази“)
const bookmarksEl = document.getElementById('bookmarks');
const bookmarksStatusEl = document.getElementById('bookmarksStatus');
if (!chrome.permissions) bookmarksEl.closest('.card').hidden = true;

bookmarksEl.addEventListener('change', async () => {
  bookmarksEl.disabled = true;
  try {
    if (bookmarksEl.checked) {
      const ok = await enableBookmarks();
      if (!ok) {
        bookmarksEl.checked = false;
        bookmarksStatusEl.textContent = t('bmDenied');
      }
    } else {
      await disableBookmarks();
      bookmarksStatusEl.textContent = '';
    }
  } catch (err) {
    bookmarksStatusEl.textContent = t('statusError', [String(err?.message || err)]);
  } finally {
    bookmarksEl.disabled = false;
  }
});

// Отговорите: ключът действа веднага; статусът казва честно какво може устройството
const answersEl = document.getElementById('answers');
const answersStatusEl = document.getElementById('answersStatus');
const ANSWER_STATUS = {
  available: 'optAnswersAvailable',
  downloadable: 'optAnswersDownloadable',
  downloading: 'optAnswersDownloadable',
  unavailable: 'optAnswersUnavailable',
  unsupported: 'optAnswersUnsupported',
};
answersEl.addEventListener('change', () => patchSettings({ answers: answersEl.checked }));
(async () => {
  answersEl.checked = (await getSettings()).answers !== false;
  // латинска проба: при BG/IT интерфейс отговорите са възможни за въпроси на английски
  const state = await availability(pickLanguage(chrome.i18n.getUILanguage(), 'a'));
  answersStatusEl.textContent = t(ANSWER_STATUS[state] || 'optAnswersUnavailable');
})();

watchBookmarks((status, enabled) => {
  bookmarksEl.checked = enabled;
  if (enabled) bookmarksStatusEl.textContent = statusLine(status);
});

load();
