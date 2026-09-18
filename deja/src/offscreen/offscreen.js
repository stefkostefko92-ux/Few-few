// Déjà — offscreen документ: тук живее локалният embedding модел.
// ONNX Runtime върви върху WASM, доставен В пакета (Chrome Web Store забранява
// отдалечен код). Теглата на модела се теглят еднократно от Hugging Face
// (данни, не код) и се кешират в Cache API на браузъра.

import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
env.backends.onnx.wasm.numThreads = 1; // extension страниците не са cross-origin isolated

// 384 измерения, 50+ езика (вкл. български), ~120MB q8 — сладката точка за MVP
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let extractorPromise = null;

// ВНИМАНИЕ: offscreen документите нямат chrome.storage — настройките (напр.
// modelHost — собствено огледало на модела за enterprise/офлайн среди) идват
// от background-а със самото съобщение.
function getExtractor(modelHost) {
  if (!extractorPromise) {
    if (modelHost) env.remoteHost = modelHost;
    extractorPromise = (async () => {
      // Първо опит за WebGPU (fp16); offscreen документите често нямат GPU
      // достъп и тогава тихо падаме към WASM (q8) — той работи навсякъде.
      if (typeof navigator !== 'undefined' && navigator.gpu) {
        try {
          return await pipeline('feature-extraction', MODEL, { device: 'webgpu', dtype: 'fp16' });
        } catch (err) {
          console.info('[Déjà] WebGPU недостъпен, минавам на WASM:', String(err?.message || err));
        }
      }
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    })();
  }
  return extractorPromise;
}

// Сериализация: два застъпени run() върху една ONNX сесия нямат гаранции —
// индексиране и търсене могат да пристигнат едновременно.
let chain = Promise.resolve();

// Дълготраен Port вместо sendMessage: отвореният порт държи service worker-а
// жив, докато тук тече дълга работа (първото теглене на модела е минути).
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'deja-embed') return;
  port.onMessage.addListener((msg) => {
    chain = chain
      .then(async () => {
        const extractor = await getExtractor(msg.modelHost);
        const output = await extractor(msg.texts, { pooling: 'mean', normalize: true });
        port.postMessage({ ok: true, vectors: output.tolist() });
      })
      .catch((err) => {
        try {
          port.postMessage({ ok: false, error: String(err?.message || err) });
        } catch {
          // портът вече е затворен — SW ще получи onDisconnect
        }
      });
  });
});
