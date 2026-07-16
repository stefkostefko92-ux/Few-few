// Déjà — service worker: приема страници от content script-а, реже ги на
// парчета, праща ги за embedding в offscreen документа и ги пази в IndexedDB.
// Търсенето също минава оттук. Всичко е локално — нула мрежови заявки с данни
// на потребителя (единствено моделът се тегли еднократно от Hugging Face).

import { chunkText } from './lib/chunker.js';
import * as db from './lib/db.js';
import { getSettings, isDenied } from './lib/settings.js';

const EMBED_BATCH = 8; // парчета на една заявка към offscreen — пази паметта
const TOP_PAGES = 10; // колко резултата връщаме
const RELATED_COUNT = 3; // „свързани спомени“ на страница
const MAX_INDEX_TRIES = 3; // опити на страница, преди да я зарежем (отровен запис)
const OFFSCREEN_IDLE_MIN = 10; // минути без embed → затваряме offscreen (~120MB RAM)
const RETENTION_ALARM = 'deja-retention';
const OFFSCREEN_GC_ALARM = 'deja-offscreen-gc';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

// --- offscreen документ (там живее моделът) ---

let creating = null;
// In-memory е безопасно: отвореният Port държи SW жив през целия embed —
// ако SW умре, няма in-flight embed за пазене.
let embedInFlight = 0;

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
  embedInFlight++;
  try {
    return await new Promise((resolve, reject) => {
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
  } finally {
    embedInFlight--;
    // idle часовникът на GC-то тръгва СЛЕД работата, не в началото ѝ
    chrome.storage.local.set({ lastEmbedAt: Date.now() });
  }
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

  const now = Date.now();
  await db.replacePage(urlKey, now, chunks, vectors);
  await db.putPage({
    urlKey,
    title,
    hash,
    lang,
    time: now,
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
    // tok = самоличност на записа: drain-ът пипа записа само ако е СЪЩАТА
    // версия — иначе междувременно пристигнала v2 на страницата се затрива
    pending[urlKeyOf(page.url)] = { ...page, tries: 0, tok: crypto.randomUUID() };
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
        if (fresh[key]?.tok !== item.tok) return; // дошла е по-нова версия — не я пипай
        if (!failed) {
          delete fresh[key];
          return;
        }
        const tries = (fresh[key]?.tries || 0) + 1;
        if (tries >= MAX_INDEX_TRIES) delete fresh[key];
        else {
          fresh[key] = { ...item, tries }; // item носи същия tok
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

// Кратък дословен цитат от парчето → text fragment (#:~:text=) скача и
// маркира точния абзац в страницата.
function makeQuote(text) {
  const words = text.split(' ').filter(Boolean);
  return words.slice(0, 8).join(' ');
}

// dot product на заявката срещу всички редове на пакетиран страничен запис;
// връща най-добрия ред. Векторите са нормализирани → dot == косинус.
function bestRow(qvec, pv) {
  const { data, dim, count } = pv;
  let best = -Infinity;
  let bestPos = 0;
  for (let row = 0; row < count; row++) {
    const off = row * dim;
    let dot = 0;
    for (let i = 0; i < dim; i++) dot += data[off + i] * qvec[i];
    if (dot > best) {
      best = dot;
      bestPos = row;
    }
  }
  return { score: best, pos: bestPos };
}

async function search(query, minTime = 0) {
  const [qvec] = await embed([query]);

  // Един IDB запис на страница (пакетирани вектори) — групирането по
  // страница идва безплатно, а четенията са ~20× по-малко от чете-всяко-парче.
  const scored = [];
  await db.forEachPageVec((pv) => {
    if (!pv.data || pv.dim !== qvec.length) return; // друг модел/размерност
    if (minTime && pv.time && pv.time < minTime) return; // датов филтър
    const { score, pos } = bestRow(qvec, pv);
    scored.push({ urlKey: pv.urlKey, score, pos });
  });
  scored.sort((a, b) => b.score - a.score);

  const results = [];
  for (const s of scored.slice(0, TOP_PAGES)) {
    const [page, text] = await Promise.all([
      db.getPage(s.urlKey),
      db.getChunkText(s.urlKey, s.pos),
    ]);
    results.push({
      url: s.urlKey,
      title: page?.title || s.urlKey,
      snippet: text.slice(0, 260),
      quote: makeQuote(text),
      score: Math.round(s.score * 100) / 100,
      time: page?.time || null,
    });
  }
  return results;
}

// „Свързани спомени“: центроидът на страницата срещу всички други страници.
async function related(urlKey) {
  const pv = await db.getPageVec(urlKey);
  if (!pv || !pv.count) return [];
  const { data, dim, count } = pv;
  const centroid = new Float32Array(dim);
  for (let row = 0; row < count; row++) {
    const off = row * dim;
    for (let i = 0; i < dim; i++) centroid[i] += data[off + i];
  }
  let norm = 0;
  for (let i = 0; i < dim; i++) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) centroid[i] /= norm;

  const scored = [];
  await db.forEachPageVec((other) => {
    if (other.urlKey === urlKey || other.dim !== dim) return;
    const { score } = bestRow(centroid, other);
    scored.push({ urlKey: other.urlKey, score });
  });
  scored.sort((a, b) => b.score - a.score);

  const results = [];
  for (const s of scored.slice(0, RELATED_COUNT)) {
    const page = await db.getPage(s.urlKey);
    results.push({
      url: s.urlKey,
      title: page?.title || s.urlKey,
      score: Math.round(s.score * 100) / 100,
      time: page?.time || null,
    });
  }
  return results;
}

// --- съобщения ---

const handlers = {
  'deja:search': (msg) => search(msg.query, msg.minTime || 0),
  'deja:related': (msg) => related(msg.urlKey),
  'deja:stats': async () => ({ pages: await db.countPages() }),
  'deja:clear': () => db.clearAll(),
  'deja:memory:list': async () => {
    const pages = await db.getAllPages();
    pages.sort((a, b) => (b.time || 0) - (a.time || 0));
    return pages.map(({ urlKey, title, time, chunkCount }) => ({
      urlKey,
      title,
      time,
      chunkCount,
    }));
  },
  'deja:memory:delete': (msg) => db.deletePage(msg.urlKey),
  'deja:memory:export': () => db.exportAll(),
  'deja:memory:import': (msg) => db.importAll(msg.dump),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'deja:page') {
    addPending(msg).then(drainPending);
    sendResponse({ ok: true });
    return;
  }
  const handler = handlers[msg.type];
  if (handler) {
    handler(msg)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((err) => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'open-search') {
    chrome.tabs.create({ url: chrome.runtime.getURL('search.html') });
  }
});

// --- omnibox: „dj как се гледат домати“ директно от адресната лента ---

chrome.omnibox.setDefaultSuggestion({
  description: chrome.i18n.getMessage('omniboxDefault') || 'Déjà',
});
chrome.omnibox.onInputEntered.addListener((text) => {
  const url = chrome.runtime.getURL('search.html') + '?q=' + encodeURIComponent(text.trim());
  chrome.tabs.create({ url });
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
  if (embedInFlight > 0) return; // тече дълъг embed (напр. студено теглене на модела)
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
