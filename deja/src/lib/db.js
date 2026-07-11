// IndexedDB слой: pages (метаданни по URL) + chunks (текст + вектор).
// Векторите са Float32Array — structured clone ги пази без загуба.

const DB_NAME = 'deja';
const DB_VERSION = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('pages', { keyPath: 'urlKey' });
      const chunks = db.createObjectStore('chunks', { autoIncrement: true });
      chunks.createIndex('byUrlKey', 'urlKey');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getPage(urlKey) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('pages').objectStore('pages').get(urlKey);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function putPage(page) {
  const db = await open();
  const tx = db.transaction('pages', 'readwrite');
  tx.objectStore('pages').put(page);
  return done(tx);
}

// Изтрива старите парчета на страница и записва новите в една транзакция.
export async function replaceChunks(urlKey, chunks) {
  const db = await open();
  const tx = db.transaction('chunks', 'readwrite');
  const store = tx.objectStore('chunks');
  const index = store.index('byUrlKey');
  const range = IDBKeyRange.only(urlKey);
  await new Promise((resolve, reject) => {
    const cursorReq = index.openKeyCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  for (const chunk of chunks) store.add(chunk);
  return done(tx);
}

// Обхожда всички парчета с cursor — паметта остава плоска и при голям индекс.
export async function forEachChunk(fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('chunks').objectStore('chunks').openCursor();
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

export async function countPages() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction('pages').objectStore('pages').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Retention: трие страниците (и парчетата им), четени преди cutoff.
export async function pruneOlderThan(cutoffTs) {
  const db = await open();
  const tx = db.transaction(['pages', 'chunks'], 'readwrite');
  const pages = tx.objectStore('pages');
  const chunks = tx.objectStore('chunks');
  const byUrlKey = chunks.index('byUrlKey');
  let pruned = 0;
  await new Promise((resolve, reject) => {
    const req = pages.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      const page = cursor.value;
      if (page.time && page.time < cutoffTs) {
        pruned++;
        cursor.delete();
        const chunkReq = byUrlKey.openKeyCursor(IDBKeyRange.only(page.urlKey));
        chunkReq.onsuccess = () => {
          const chunkCursor = chunkReq.result;
          if (chunkCursor) {
            chunks.delete(chunkCursor.primaryKey);
            chunkCursor.continue();
          }
        };
      }
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
  await done(tx);
  return pruned;
}

export async function clearAll() {
  const db = await open();
  const tx = db.transaction(['pages', 'chunks'], 'readwrite');
  tx.objectStore('pages').clear();
  tx.objectStore('chunks').clear();
  return done(tx);
}
