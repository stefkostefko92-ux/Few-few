// Déjà — Firefox embed адаптер (СКИЦА).
//
// Проблемът: Firefox MV3 НЯМА chrome.offscreen и НЯМА chrome.runtime.getContexts.
// Chrome-ският background.js смята embeddings в offscreen документ и общува с
// него през дълготраен Port на име 'deja-embed'. В Firefox няма къде да живее
// offscreen — затова embedding двигателят (transformers.js / ONNX-WASM) се
// bundle-ва ДИРЕКТНО в background страницата и този адаптер лъже точно толкова
// от API-то, колкото трябва, за да остане src/background.js НЕПРОМЕНЕН.
//
// Стратегия (нула промени в src/):
//   1. Този модул се import-ва ПРЕДИ src/background.js във Firefox bundle-а
//      (виж README.md → build интеграция). Инсталира shim-ове НА TOP LEVEL,
//      синхронно, преди background.js да е закачил слушателите си.
//   2. Shim за chrome.offscreen.{createDocument,closeDocument} — createDocument
//      само маркира двигателя за лениво зареждане (моделът се тегли при първия
//      embed, както в Chrome offscreen).
//   3. Shim за chrome.runtime.getContexts(['OFFSCREEN_DOCUMENT']) — връща 1
//      елемент когато „offscreen“-ът е „създаден“, иначе 0. Така ensureOffscreen()
//      и closeIdleOffscreen() в background.js работят без промяна.
//   4. Loopback над chrome.runtime.connect({name:'deja-embed'}): в Chrome този
//      connect отива към offscreen контекста; тук няма втори контекст, затова
//      връщаме локален Port, чийто „отсрещен край“ е самият embedding двигател
//      в тази страница. Протоколът е идентичен ({texts, modelHost} →
//      {ok, vectors} | {ok:false, error}).
//
// Забележка за живота на страницата: Firefox event page (background.scripts)
// НЕ се терминира докато тече слушателят на събитие / има активна работа от
// него — embedding-ът върви в СЪЩИЯ контекст като deja:page/deja:search
// хендлъра, така че няма cross-context idle гонка като при Chrome SW+offscreen.
// (Валидирай с about:debugging → Inspect по време на студено теглене — виж
// README „Топ рискове“.)

import { env, pipeline } from '@huggingface/transformers';

// --- КРИТИЧНО: promise-базиран namespace ---
// Във Firefox `chrome.*` е callback-стил (Chrome-съвместим), а `browser.*` връща
// Promise-и. src/background.js навсякъде прави `await chrome.storage.local.get(...)`,
// `await chrome.runtime.getContexts(...)` и т.н. — очаква Promise-и. Затова
// СИНХРОННО, преди background.js да се оцени, сочим глобалния `chrome` към
// нативния promise-базиран `browser`. Алтернатива за по-голям проект:
// webextension-polyfill (виж README). Тук браузърът е само Firefox, затова
// нативният `browser` стига и не влачим зависимост.
if (typeof globalThis.browser !== 'undefined') {
  globalThis.chrome = globalThis.browser;
}

// --- същата ONNX-WASM настройка като src/offscreen/offscreen.js ---
env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
env.backends.onnx.wasm.numThreads = 1; // extension страниците не са cross-origin isolated

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'; // 384d, q8, 50+ езика

let extractorPromise = null;

function getExtractor(modelHost) {
  if (!extractorPromise) {
    if (modelHost) env.remoteHost = modelHost;
    extractorPromise = (async () => {
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        try {
          return await pipeline('feature-extraction', MODEL, { device: 'webgpu', dtype: 'fp16' });
        } catch (err) {
          console.info('[Déjà/FF] WebGPU недостъпен, минавам на WASM:', String(err?.message || err));
        }
      }
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    })();
  }
  return extractorPromise;
}

// Сериализация: два застъпени run() върху една ONNX сесия нямат гаранции —
// индексиране и търсене може да пристигнат едновременно (идентично на offscreen.js).
let chain = Promise.resolve();

function runEmbed(texts, modelHost) {
  chain = chain.then(async () => {
    const extractor = await getExtractor(modelHost);
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist();
  });
  return chain;
}

// --- „offscreen създаден?“ флаг: единственото състояние, което getContexts shim-ът чете ---
let engineCreated = false;

// --- loopback Port: имитира chrome.runtime.Port само за 'deja-embed' ---
// Държим и двата края в тази страница. background.js вижда обикновен Port.
function makeLoopbackPort() {
  const msgListeners = new Set();
  const discListeners = new Set();
  let closed = false;

  const port = {
    name: 'deja-embed',
    onMessage: {
      addListener: (fn) => msgListeners.add(fn),
      removeListener: (fn) => msgListeners.delete(fn),
    },
    onDisconnect: {
      addListener: (fn) => discListeners.add(fn),
      removeListener: (fn) => discListeners.delete(fn),
    },
    // background.js вика port.postMessage({texts, modelHost}) — обработваме локално
    postMessage: (msg) => {
      if (closed) return;
      runEmbed(msg.texts, msg.modelHost || null)
        .then((vectors) => {
          if (!closed) for (const fn of msgListeners) fn({ ok: true, vectors });
        })
        .catch((err) => {
          if (!closed) for (const fn of msgListeners) fn({ ok: false, error: String(err?.message || err) });
        });
    },
    disconnect: () => {
      if (closed) return;
      closed = true;
      for (const fn of discListeners) fn();
    },
  };
  return port;
}

// --- инсталиране на shim-овете (синхронно, на import) ---
function installEmbedAdapter() {
  // 1) chrome.offscreen — само createDocument/closeDocument, колкото ползва background.js
  chrome.offscreen = {
    createDocument: async () => {
      engineCreated = true; // моделът се зарежда лениво при първия embed
    },
    closeDocument: async () => {
      // В Chrome това освобождава ~120MB RAM със затваряне на документа. Тук
      // двигателят е в самата страница; „затваряме“ логически, а Firefox
      // разтоварва event page-а при бездействие сам. Не изхвърляме extractor-а,
      // за да не плащаме повторно студено зареждане (моделът е кеширан на диск,
      // но ре-инстанцирането пак струва). Ако RAM е проблем → раскоментирай:
      // extractorPromise = null;
      engineCreated = false;
    },
  };

  // 2) chrome.runtime.getContexts — липсва в Firefox; връщаме минималния изглед,
  //    който ensureOffscreen()/closeIdleOffscreen() очакват.
  chrome.runtime.getContexts = async ({ contextTypes } = {}) => {
    if (contextTypes && !contextTypes.includes('OFFSCREEN_DOCUMENT')) return [];
    return engineCreated ? [{ contextType: 'OFFSCREEN_DOCUMENT' }] : [];
  };

  // 3) Loopback над connect() само за 'deja-embed'; всичко друго → оригинала.
  const origConnect = chrome.runtime.connect.bind(chrome.runtime);
  chrome.runtime.connect = (info) => {
    if (info && info.name === 'deja-embed') return makeLoopbackPort();
    return origConnect(info);
  };
}

installEmbedAdapter();

export { installEmbedAdapter };
