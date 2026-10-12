// Déjà — отметките в паметта (по избор). Един-единствен механизъм — reconcile():
// сравнява дървото с отметки с паметта и прави само разликата. Той е и първият
// импорт, и живият синхрон, и възстановяването след прекъснат service worker
// (идемпотентен е — пуснат отново, довършва каквото е останало).
//
// Състоянието е в chrome.storage.local, НЕ в паметта на SW:
//   bookmarkSync  — { state, done, total, count, folders, at } → прогрес за UI-а
//   bookmarkDirty — имало е промяна в отметките, която още не е отразена
//   bookmarkSkip  — отметки, които потребителят изрично е „забравил“ в Déjà

import * as db from './lib/db.js';
import { getSettings, patchSettings, isDenied } from './lib/settings.js';
import { bookmarkText, flattenTree, planSync } from './lib/bookmarks.js';

const BATCH = 32; // кратки текстове → по-голяма партида от страниците
const DEBOUNCE_MS = 1500;

export function createBookmarkSync({ embed, urlKeyOf, onChange }) {
  let running = null;
  let again = false;
  let generation = 0; // изключването вдига поколението → текущият reconcile спира
  let timer = null;
  let listening = false;

  const setStatus = (patch) =>
    chrome.storage.local
      .get('bookmarkSync')
      .then(({ bookmarkSync }) =>
        chrome.storage.local.set({ bookmarkSync: { ...bookmarkSync, ...patch, at: Date.now() } }),
      );

  async function skipSet() {
    const { bookmarkSkip = [] } = await chrome.storage.local.get('bookmarkSkip');
    return new Set(bookmarkSkip);
  }

  // най-пълните папки → подсказки „Опитай: …“ след импорта
  function topFolders(bookmarks) {
    const counts = new Map();
    for (const bm of bookmarks.values()) {
      const leaf = bm.folder.split(' › ').pop();
      if (leaf) counts.set(leaf, (counts.get(leaf) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
  }

  async function runOnce(gen) {
    const settings = await getSettings();
    if (!settings.bookmarks || !chrome.bookmarks?.getTree) return;
    if (settings.paused) {
      await setStatus({ state: 'paused' });
      return;
    }
    await chrome.storage.local.set({ bookmarkDirty: false });
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = flattenTree(tree, {
      urlKeyOf,
      allowed: (url) => !isDenied(url, settings.userDenylist),
    });
    const skip = await skipSet();
    const plan = planSync(bookmarks, await db.getAllPages(), skip);
    // най-новите първо: тях търсиш най-често — стават търсими в първите секунди,
    // докато старият архив още се учи (3000 отметки ≈ 1.5 мин на WASM)
    plan.index.sort((a, b) => b.time - a.time);
    const count = [...bookmarks.keys()].filter((k) => !skip.has(k)).length;
    await setStatus({
      state: 'running',
      done: 0,
      total: plan.index.length,
      count,
      folders: topFolders(bookmarks),
    });

    for (let i = 0; i < plan.index.length; i += BATCH) {
      if (gen !== generation) return; // изключено междувременно
      const batch = plan.index.slice(i, i + BATCH);
      const texts = batch.map(bookmarkText);
      const vectors = await embed(texts);
      if (gen !== generation) return;
      await db.putBookmarks(
        batch.map((bm, j) => ({
          text: texts[j],
          vector: vectors[j],
          page: {
            urlKey: bm.urlKey,
            title: bm.title,
            kind: 'bookmark',
            bookmark: { folder: bm.folder },
            time: bm.time || Date.now(),
            chunkCount: 1,
            dim: vectors[j].length,
          },
        })),
      );
      await setStatus({ done: Math.min(i + BATCH, plan.index.length) });
      onChange?.();
    }
    for (const bm of plan.mark) await db.setBookmarkMark(bm.urlKey, { folder: bm.folder });
    for (const key of plan.unmark) await db.setBookmarkMark(key, null);
    for (const key of plan.remove) await db.deletePage(key);
    // забравени отметки, които вече ги няма в браузъра — чистим списъка
    if (skip.size) {
      const alive = [...skip].filter((k) => bookmarks.has(k));
      if (alive.length !== skip.size) await chrome.storage.local.set({ bookmarkSkip: alive });
    }
    if (gen !== generation) return;
    await setStatus({ state: 'done', done: plan.index.length });
    if (plan.index.length || plan.remove.length) onChange?.();
  }

  // Един reconcile в даден момент; заявка по време на работа → още един кръг след нея
  async function reconcile() {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await runOnce(generation);
        } while (again);
      } catch (err) {
        console.warn('[Déjà] синхронът на отметките пропадна:', err);
        await setStatus({ state: 'error', error: String(err?.message || err) });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  function markDirty() {
    chrome.storage.local.set({ bookmarkDirty: true });
    clearTimeout(timer);
    timer = setTimeout(reconcile, DEBOUNCE_MS);
  }

  // Слушателите се закачат синхронно на най-горното ниво на SW-а (иначе
  // събитие не го събужда). chrome.bookmarks съществува само с даденото право.
  function ensureListeners() {
    if (listening || !chrome.bookmarks?.onCreated) return;
    listening = true;
    for (const name of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onImportEnded']) {
      chrome.bookmarks[name]?.addListener(markDirty);
    }
  }

  async function enable() {
    await patchSettings({ bookmarks: true });
    ensureListeners();
    await chrome.storage.local.set({ bookmarkSync: { state: 'running', done: 0, total: 0 } });
    reconcile(); // не чакаме — прогресът тече през storage
    return { started: true };
  }

  // Изключване = чисто излизане: спомените само-от-отметки се забравят,
  // прочетените страници остават (само губят знака), правото се връща на Chrome.
  async function disable() {
    generation++;
    await patchSettings({ bookmarks: false });
    for (const page of await db.getAllPages()) {
      if (!page.bookmark) continue;
      if (page.kind === 'bookmark') await db.deletePage(page.urlKey);
      else await db.setBookmarkMark(page.urlKey, null);
    }
    await chrome.storage.local.remove(['bookmarkSync', 'bookmarkSkip', 'bookmarkDirty']);
    await chrome.permissions?.remove({ permissions: ['bookmarks'] }).catch(() => {});
    onChange?.();
  }

  // Потребителят забрави спомен, който е и отметка — синхронът не бива да го върне
  async function noteForgotten(page) {
    if (!page?.bookmark) return;
    const skip = await skipSet();
    skip.add(page.urlKey);
    await chrome.storage.local.set({ bookmarkSkip: [...skip] });
  }

  // При събуждане: довърши прекъснат импорт или неотразена промяна
  async function resume() {
    const settings = await getSettings();
    if (!settings.bookmarks) return;
    const { bookmarkSync, bookmarkDirty } = await chrome.storage.local.get([
      'bookmarkSync',
      'bookmarkDirty',
    ]);
    if (bookmarkDirty || bookmarkSync?.state === 'running' || bookmarkSync?.state === 'paused') {
      reconcile();
    }
  }

  return { ensureListeners, enable, disable, reconcile, resume, noteForgotten };
}
