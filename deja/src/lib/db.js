// IndexedDB слой, v2: pages (метаданни) + chunks (само текст, ключ [urlKey,pos])
// + pagevecs (ЕДИН запис на страница с всички вектори, пакетирани в Float32Array).
// Пакетирането по страница смъква четенията при търсене от „по едно на парче“
// на „по едно на страница“ (~20×) — това е стъпалото към 50k+ парчета.

const DB_NAME = 'deja';
const DB_VERSION = 2;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      if (event.oldVersion < 1) {
        db.createObjectStore('pages', { keyPath: 'urlKey' });
      }
      if (event.oldVersion === 1) {
        // v1→v2: векторите се местят от chunks в pagevecs; chunks се преизгражда
        migrateV1toV2(db, tx);
      } else if (event.oldVersion < 1 || event.oldVersion === 0) {
        db.createObjectStore('chunks', { keyPath: ['urlKey', 'pos'] });
        db.createObjectStore('pagevecs', { keyPath: 'urlKey' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// Миграция в самата versionchange транзакция: старите chunks (autoinc,
// {urlKey,title,text,vec}) → нови chunks {urlKey,pos,text} + pagevecs.
function migrateV1toV2(db, tx) {
  const old = tx.objectStore('chunks');
  const byPage = new Map();
  old.openCursor().onsuccess = (event) => {
    const cursor = event.target.result;
    if (cursor) {
      const { urlKey, text, vec } = cursor.value;
      if (!byPage.has(urlKey)) byPage.set(urlKey, []);
      byPage.get(urlKey).push({ text, vec });
      cursor.continue();
      return;
    }
    // старите записи са изчетени — пресъздаваме stores и пишем в новия формат
    db.deleteObjectStore('chunks');
    const chunks = db.createObjectStore('chunks', { keyPath: ['urlKey', 'pos'] });
    const pagevecs = db.createObjectStore('pagevecs', { keyPath: 'urlKey' });
    const pages = tx.objectStore('pages');
    for (const [urlKey, rows] of byPage) {
      const dim = rows[0]?.vec?.length || 0;
      const data = new Float32Array(rows.length * dim);
      rows.forEach((row, pos) => {
        chunks.add({ urlKey, pos, text: row.text });
        if (row.vec) data.set(row.vec, pos * dim);
      });
      const pageReq = pages.get(urlKey);
      pageReq.onsuccess = () => {
        pagevecs.add({ urlKey, time: pageReq.result?.time || 0, dim, count: rows.length, data });
      };
    }
  };
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function reqAsPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getPage(urlKey) {
  const db = await open();
  return (await reqAsPromise(db.transaction('pages').objectStore('pages').get(urlKey))) || null;
}

export async function putPage(page) {
  const db = await open();
  const tx = db.transaction('pages', 'readwrite');
  tx.objectStore('pages').put(page);
  return done(tx);
}

// Записва страница наведнъж: текстове + пакетирани вектори (замества старите).
export async function replacePage(urlKey, time, texts, vectors) {
  const db = await open();
  const dim = vectors[0]?.length || 0;
  const data = new Float32Array(texts.length * dim);
  vectors.forEach((vec, pos) => data.set(vec, pos * dim));

  const tx = db.transaction(['chunks', 'pagevecs'], 'readwrite');
  const chunks = tx.objectStore('chunks');
  const range = IDBKeyRange.bound([urlKey, 0], [urlKey, Infinity]);
  chunks.delete(range);
  texts.forEach((text, pos) => chunks.add({ urlKey, pos, text }));
  tx.objectStore('pagevecs').put({ urlKey, time, dim, count: texts.length, data });
  return done(tx);
}

// Обхожда пакетираните вектори — по един запис на страница.
export async function forEachPageVec(fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('pagevecs').objectStore('pagevecs').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        fn(cursor.value);
        cursor.continue();
      } else {
        resolve();
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPageVec(urlKey) {
  const db = await open();
  return (
    (await reqAsPromise(db.transaction('pagevecs').objectStore('pagevecs').get(urlKey))) || null
  );
}

export async function getChunkText(urlKey, pos) {
  const db = await open();
  const row = await reqAsPromise(db.transaction('chunks').objectStore('chunks').get([urlKey, pos]));
  return row?.text || '';
}

export async function getAllPages() {
  const db = await open();
  return (await reqAsPromise(db.transaction('pages').objectStore('pages').getAll())) || [];
}

export async function deletePage(urlKey) {
  const db = await open();
  const tx = db.transaction(['pages', 'chunks', 'pagevecs'], 'readwrite');
  tx.objectStore('pages').delete(urlKey);
  tx.objectStore('chunks').delete(IDBKeyRange.bound([urlKey, 0], [urlKey, Infinity]));
  tx.objectStore('pagevecs').delete(urlKey);
  return done(tx);
}

export async function countPages() {
  const db = await open();
  return reqAsPromise(db.transaction('pages').objectStore('pages').count());
}

// Retention: трие страниците (и данните им), четени преди cutoff.
export async function pruneOlderThan(cutoffTs) {
  const pages = await getAllPages();
  let pruned = 0;
  for (const page of pages) {
    if (page.time && page.time < cutoffTs) {
      await deletePage(page.urlKey);
      pruned++;
    }
  }
  return pruned;
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['pages', 'chunks', 'pagevecs'], 'readwrite');
  tx.objectStore('pages').clear();
  tx.objectStore('chunks').clear();
  tx.objectStore('pagevecs').clear();
  return done(tx);
}

// --- export / import („Моята памет“) ---

export async function exportAll() {
  const db = await open();
  const [pages, chunks, pagevecs] = await Promise.all([
    reqAsPromise(db.transaction('pages').objectStore('pages').getAll()),
    reqAsPromise(db.transaction('chunks').objectStore('chunks').getAll()),
    reqAsPromise(db.transaction('pagevecs').objectStore('pagevecs').getAll()),
  ]);
  return {
    format: 'deja-memory',
    version: 2,
    exportedAt: Date.now(),
    pages,
    chunks,
    pagevecs: pagevecs.map((pv) => ({ ...pv, data: Array.from(pv.data) })),
  };
}

export async function importAll(dump) {
  if (dump?.format !== 'deja-memory' || dump.version !== 2) {
    throw new Error('непознат формат на архива');
  }
  const db = await open();
  const tx = db.transaction(['pages', 'chunks', 'pagevecs'], 'readwrite');
  for (const page of dump.pages || []) tx.objectStore('pages').put(page);
  for (const chunk of dump.chunks || []) tx.objectStore('chunks').put(chunk);
  for (const pv of dump.pagevecs || []) {
    tx.objectStore('pagevecs').put({ ...pv, data: new Float32Array(pv.data) });
  }
  await done(tx);
  return (dump.pages || []).length;
}
