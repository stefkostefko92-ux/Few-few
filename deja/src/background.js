// Déjà — service worker: приема страници от content script-а, реже ги на
// парчета, праща ги за embedding в offscreen документа и ги пази в IndexedDB.
// Търсенето също минава оттук. Всичко е локално — нула мрежови заявки с данни
// на потребителя (единствено моделът се тегли еднократно от Hugging Face).

import { chunkText } from './lib/chunker.js';
import * as db from './lib/db.js';
import { getSettings, isDenied } from './lib/settings.js';

const EMBED_BATCH = 8; // парчета на една заявка към offscreen — пази паметта
const TOP_PAGES = 10; // колко резултата връщаме
const MAX_INDEX_TRIES = 3; // опити на страница, преди да я зарежем (отровен запис)
const OFFSCREEN_IDLE_MIN = 10; // минути без embed → затваряме offscreen (~120MB RAM)
const RETENTION_ALARM = 'deja-retention';
const OFFSCREEN_GC_ALARM = 'deja-offscreen-gc';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

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

// Embed през дълготраен Port: отвореният порт държи SW жив, докато offscreen
// тегли модела/смята. Еднократен sendMessage НЕ ресетира idle-таймера на SW —
// при първото теглене (~120MB) SW умираше след 30 сек и заявката увисваше.
async function embed(texts) {
  await ensureOffscreen();
  const { modelHost } = await getSettings();
  await chrome.storage.local.set({ lastEmbedAt: Date.now() });
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connect({ name: 'deja-embed' });
    let settled = false;
    port.onMessage.addListener((res) => {
      settled = true;
      port.disconnect();
      if (res?.ok) resolve(res.vectors.map((v) => new Float32Array(v)));
      else reject(new Error(res?.error || 'embed се провали без отговор'));
    });
    port.onDisconnect.addListener(() => {
      if (!settled) {
        reject(new Error(chrome.runtime.lastError?.message || 'портът към offscreen се затвори'));
      }
    });
    port.postMessage({ texts, modelHost: modelHost || null });
  });
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
  await db.putPage({
    urlKey,
    title,
    hash,
    lang,
    time: Date.now(),
    chunkCount: chunks.length,
    dim: vectors[0]?.length || 0,
  });
}

// --- устойчива опашка: чакащите страници живеят в chrome.storage.local,
// не в паметта на SW — рестарт по средата не губи нищо ---

// Всички мутации на `pending` минават през този лок с ПРЕСЕН прочит вътре —
// иначе дълго индексиране записва остаряло копие и изтрива междувременно
// пристигнали страници (read-modify-write конфликт).
let pendingLock = Promise.resolve();

function mutatePending(fn) {
  const run = pendingLock.then(async () => {
    const { pending = {} } = await chrome.storage.local.get('pending');
    fn(pending);
    await chrome.storage.local.set({ pending });
    return pending;
  });
  pendingLock = run.catch(() => {});
  return run;
}

function addPending(page) {
  return mutatePending((pending) => {
    pending[urlKeyOf(page.url)] = { ...page, tries: 0 };
  });
}

let draining = false;

async function drainPending() {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const { pending = {} } = await chrome.storage.local.get('pending');
      const key = Object.keys(pending)[0];
      if (!key) break;
      const item = pending[key];
      let failed = false;
      try {
        await indexPage(item);
      } catch (err) {
        console.warn('[Déjà] индексирането пропадна:', err);
        failed = true;
      }
      let keptForLater = false;
      await mutatePending((fresh) => {
        if (!failed) {
          delete fresh[key];
          return;
        }
        const tries = (fresh[key]?.tries || 0) + 1;
        if (tries >= MAX_INDEX_TRIES) delete fresh[key];
        else {
          fresh[key] = { ...item, tries };
          keptForLater = true;
        }
      });
      // провалилата се страница остава за следващо събуждане — не въртим на място
      if (keptForLater) break;
    }
  } finally {
    draining = false;
  }
}

// SW се събуди (или се инсталира) — довърши недовършеното
drainPending();

// --- търсене ---

async function search(query) {
  const [qvec] = await embed([query]);

  // Векторите са нормализирани → dot product == косинусова близост.
  // Пазим само нужното за ранкинга, не референции към целите chunk обекти —
  // иначе при 20k+ парчета държим всички вектори в паметта едновременно.
  const scored = [];
  await db.forEachChunk((chunk) => {
    const v = chunk.vec;
    if (!v || v.length !== qvec.length) return; // друг модел/размерност — прескачаме
    let dot = 0;
    for (let i = 0; i < v.length; i++) dot += v[i] * qvec[i];
    scored.push({ score: dot, urlKey: chunk.urlKey, title: chunk.title, text: chunk.text });
  });
  scored.sort((a, b) => b.score - a.score);

  // Групираме по страница по ЦЕЛИЯ сортиран списък — най-доброто парче
  // представя страницата. (Рязане на топ-N парчета преди групирането води до
  // 1-2 резултата, когато една дълга страница доминира върха.)
  const byPage = new Map();
  for (const s of scored) {
    if (!byPage.has(s.urlKey)) {
      byPage.set(s.urlKey, s);
      if (byPage.size >= TOP_PAGES) break;
    }
  }

  const results = [];
  for (const [urlKey, s] of byPage) {
    const page = await db.getPage(urlKey);
    results.push({
      url: urlKey,
      title: s.title || urlKey,
      snippet: s.text.slice(0, 260),
      score: Math.round(s.score * 100) / 100,
      time: page?.time || null,
    });
  }
  return results;
}

// --- съобщения ---

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'deja:page') {
    addPending(msg).then(drainPending);
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

// --- alarms: retention (дневно) + offscreen GC (на 5 мин) ---

function armAlarms() {
  chrome.alarms.create(RETENTION_ALARM, { periodInMinutes: 24 * 60 });
  chrome.alarms.create(OFFSCREEN_GC_ALARM, { periodInMinutes: 5 });
}

async function pruneByRetention() {
  const { retentionMonths } = await getSettings();
  if (!retentionMonths) return; // 0 = пази завинаги
  const pruned = await db.pruneOlderThan(Date.now() - retentionMonths * MONTH_MS);
  if (pruned > 0) console.info(`[Déjà] retention: изтрити ${pruned} стари страници`);
}

// Offscreen документ без AUDIO_PLAYBACK reason живее вечно → моделът държи
// ~120MB RAM. Затваряме го след бездействие; следващият embed го пресъздава.
async function closeIdleOffscreen() {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  if (contexts.length === 0) return;
  const { lastEmbedAt = 0, pending = {} } = await chrome.storage.local.get([
    'lastEmbedAt',
    'pending',
  ]);
  if (Object.keys(pending).length > 0) return; // има чакаща работа
  if (Date.now() - lastEmbedAt > OFFSCREEN_IDLE_MIN * 60_000) {
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  armAlarms();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});
chrome.runtime.onStartup.addListener(() => {
  armAlarms();
  pruneByRetention();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETENTION_ALARM) pruneByRetention();
  if (alarm.name === OFFSCREEN_GC_ALARM) closeIdleOffscreen();
});
