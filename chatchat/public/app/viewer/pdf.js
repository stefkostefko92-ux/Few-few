// pdf.js от СОБСТВЕНИЯ домейн (/vendor/pdfjs, сервира се от node_modules — без CDN, CSP `script-src 'self'`).
// Без eval; без WebAssembly (CSP не позволява `wasm-unsafe-eval`): JPX/JBIG2 минават през JS резервните
// декодери, а ако и те не тръгнат — изображението просто не се декодира, страницата се показва.

const BASE = '/vendor/pdfjs/';
let libPromise = null;

export function loadPdfjs() {
  libPromise ??= import(`${BASE}build/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${BASE}build/pdf.worker.min.mjs`;
    return lib;
  });
  return libPromise;
}

/** → { lib, pdf, destroy } или хвърля (повреден файл, изтекъл адрес, отказан достъп). */
export async function openPdf(url) {
  const lib = await loadPdfjs();
  // Байтовете ги вземаме сами (бисквитка на сесията, подписан адрес) — pdf.js получава готов буфер.
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`pdf ${res.status}`);
  const task = lib.getDocument({
    data: new Uint8Array(await res.arrayBuffer()),
    isEvalSupported: false,
    enableXfa: false,
    useWasm: false,
    wasmUrl: `${BASE}wasm/`,
    cMapUrl: `${BASE}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${BASE}standard_fonts/`,
    iccUrl: `${BASE}iccs/`,
  });
  const pdf = await task.promise;
  return { lib, pdf, destroy: () => task.destroy() };
}
