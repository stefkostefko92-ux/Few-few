// Déjà — service worker: приема страници от content script-а, реже ги на
// парчета, праща ги за embedding в offscreen документа и ги пази в IndexedDB.
// Търсенето също минава оттук. Всичко е локално — нула мрежови заявки с данни
// на потребителя (единствено моделът се тегли еднократно от Hugging Face).

import { chunkText } from './lib/chunker.js';
import * as db from './lib/db.js';
import { getSettings, isDenied } from './lib/settings.js';

const EMBED_BATCH = 8; // парчета на една заявка към offscreen — пази паметта
const TOP_CHUNKS = 40; // колко парчета минават към групирането по страници
const TOP_PAGES = 10; // колко резултата връщаме

// --- offscreen документ (там живее моделът) ---

let creating = null;

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length > 0) return;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['WORKERS'],
        justification:
          'Локално изчисляване на embeddings с ONNX/WASM — съдържанието на страниците не напуска устройството.',
      })
      .catch((err) => {
        // при състезание между два extension контекста документът вече съществува
        if (!String(err).toLowerCase().includes('offscreen')) throw err;
      })
      .finally(() => {
        creating = null;
      });
  }
  await creating;
}

async function embed(texts) {
  await ensureOffscreen();
  // offscreen документът няма chrome.storage — подаваме му нужните настройки
  const { modelHost } = await getSettings();
  const res = await chrome.runtime.sendMessage({
    target: 'deja-offscreen',
    type: 'embed',
    texts,
    modelHost: modelHost || null,
  });
  if (!res || !res.ok) throw new Error(res?.error || 'embed се провали без отговор');
  return res.vectors.map((v) => new Float32Array(v));
}

// --- индексиране ---

function urlKeyOf(url) {
  const u = new URL(url);
  u.hash = '';
  return u.href.replace(/\/$/, '');
}

// FNV-1a — бърз недекриптографски хеш, стига ни за „смени ли се съдържанието“
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

// Последователна опашка — една страница се индексира в даден момент,
// за да не удавим offscreen документа при отваряне на 20 таба наведнъж.
let queue = Promise.resolve();
function enqueue(job) {
  queue = queue.then(job).catch((err) => {
    console.warn('[Déjà] индексирането пропадна:', err);
  });
  return queue;
}

async function indexPage({ url, title, text, lang }) {
  const settings = await getSettings();
  if (settings.paused) return;
  if (isDenied(url, settings.userDenylist)) return;

  const urlKey = urlKeyOf(url);
  const hash = fnv1a(text);
  const existing = await db.getPage(urlKey);
  if (existing && existing.hash === hash) return; // нищо ново за учене

  const chunks = chunkText(text);
  if (chunks.length === 0) return;

  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const batch = chunks.slice(i, i + EMBED_BATCH);
    vectors.push(...(await embed(batch)));
  }

  await db.replaceChunks(
    urlKey,
    chunks.map((chunkTextValue, i) => ({
      urlKey,
      title,
      text: chunkTextValue,
      vec: vectors[i],
    })),
  );
  await db.putPage({ urlKey, title, hash, lang, time: Date.now(), chunkCount: chunks.length });
}

// --- търсене ---

async function search(query) {
  const [qvec] = await embed([query]);

  // Векторите са нормализирани → dot product == косинусова близост.
  const scored = [];
  await db.forEachChunk((chunk) => {
    const v = chunk.vec;
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += v[i] * qvec[i];
    scored.push({ score: dot, chunk });
  });
  scored.sort((a, b) => b.score - a.score);

  // Групираме по страница — най-доброто парче представя страницата.
  const byPage = new Map();
  for (const { score, chunk } of scored.slice(0, TOP_CHUNKS)) {
    if (!byPage.has(chunk.urlKey)) byPage.set(chunk.urlKey, { score, chunk });
  }

  const results = [];
  for (const [urlKey, { score, chunk }] of byPage) {
    if (results.length >= TOP_PAGES) break;
    const page = await db.getPage(urlKey);
    results.push({
      url: urlKey,
      title: chunk.title || urlKey,
      snippet: chunk.text.slice(0, 260),
      score: Math.round(score * 100) / 100,
      time: page?.time || null,
    });
  }
  return results;
}

// --- съобщения ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'deja-offscreen') return;

  if (msg.type === 'deja:page') {
    enqueue(() => indexPage(msg));
    sendResponse({ ok: true });
    return;
  }
  if (msg.type === 'deja:search') {
    search(msg.query)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg.type === 'deja:stats') {
    db.countPages()
      .then((pages) => sendResponse({ ok: true, pages }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
  if (msg.type === 'deja:clear') {
    db.clearAll()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-search') {
    chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
  }
});

// --- retention: дневна проверка, трие по-старото от settings.retentionMonths ---

const RETENTION_ALARM = 'deja-retention';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function pruneByRetention() {
  const { retentionMonths } = await getSettings();
  if (!retentionMonths) return; // 0 = пази завинаги
  const pruned = await db.pruneOlderThan(Date.now() - retentionMonths * MONTH_MS);
  if (pruned > 0) console.info(`[Déjà] retention: изтрити ${pruned} стари страници`);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(RETENTION_ALARM, { periodInMinutes: 24 * 60 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(RETENTION_ALARM, { periodInMinutes: 24 * 60 });
  pruneByRetention();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETENTION_ALARM) pruneByRetention();
});
