// Снимки на устройството: камера/галерия → смаляване в браузъра (до 2560 px, JPEG) → IndexedDB → качване при
// връзка. Показват се от локалния blob или от сървъра (миниатюрата, кеширана от service worker-а).
import { h, uuid, toast } from "./ui.js";
import { db } from "./db.js";

const URLS = new Map();

async function ridimensiona(file, lato) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const k = Math.min(1, lato / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", lato > 1000 ? 0.85 : 0.75));
  return { blob, larghezza: c.width, altezza: c.height };
}

/** Отваря камерата/галерията; за всяка снимка: смаляване, запис локално, метаданни в doc.foto. Връща id-тата. */
export function scattaFoto(doc, meta) {
  return new Promise((risolvi) => {
    const input = h("input", { type: "file", accept: "image/*", capture: "environment", multiple: true, class: "nascosto" });
    input.addEventListener("change", async () => {
      const ids = [];
      for (const file of input.files ?? []) {
        try {
          const grande = await ridimensiona(file, 2560);
          const mini = await ridimensiona(file, 640);
          const id = uuid();
          await db.salvaFoto({ id, docId: doc.id, blob: grande.blob, mini: mini.blob, caricata: false });
          const ordine = Math.max(0, ...doc.foto.map((f) => f.ordine)) + 1;
          doc.foto.push({ id, ordine, didascalia: meta.didascalia ?? "", ubicazione: meta.ubicazione ?? "", riferimento: meta.riferimento ?? "", larghezza: grande.larghezza, altezza: grande.altezza });
          ids.push(id);
        } catch {
          toast("Impossibile leggere una delle immagini.", "errore");
        }
      }
      input.remove();
      risolvi(ids);
    });
    document.body.append(input);
    input.click();
  });
}

export async function urlFoto(docId, fotoId) {
  if (URLS.has(fotoId)) return URLS.get(fotoId);
  const loc = await db.foto(fotoId);
  const url = loc?.mini ? URL.createObjectURL(loc.mini) : `/admin/documenti/${docId}/foto/${fotoId}?mini=1`;
  URLS.set(fotoId, url);
  return url;
}

/** Маха снимката от документа и от всички списъци `foto` в данните; на сървъра — през опашката. */
export async function eliminaFoto(doc, fotoId) {
  doc.foto = doc.foto.filter((f) => f.id !== fotoId);
  const togli = (v) => {
    if (Array.isArray(v)) v.forEach(togli);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) k === "foto" && Array.isArray(x) ? (v[k] = x.filter((id) => id !== fotoId)) : togli(x);
  };
  togli(doc.dati);
  const loc = await db.foto(fotoId);
  if (!loc || loc.caricata) await db.accoda({ docId: doc.id, fotoId });
  await db.eliminaFotoLocale(fotoId);
}

/** Миниатюри с надпис (редактируем) за списък от id-та; „Foto“ бутон добавя нови към списъка. */
export function striscia(doc, ids, meta, onCambio, solaLettura) {
  const box = h("div.striscia");
  const disegna = () => {
    box.replaceChildren();
    for (const id of ids) {
      const f = doc.foto.find((x) => x.id === id);
      if (!f) continue;
      const img = h("img", { alt: f.didascalia || "Foto", loading: "lazy", width: 96, height: 72 });
      urlFoto(doc.id, id).then((u) => (img.src = u));
      const did = h("input", { value: f.didascalia, maxlength: 500, placeholder: "Didascalia", "aria-label": "Didascalia della foto", disabled: solaLettura });
      did.addEventListener("input", () => {
        f.didascalia = did.value;
        onCambio();
      });
      box.append(h("figure.mini", {}, img, did));
    }
    if (!solaLettura) {
      box.append(
        h("button.btn-foto", { type: "button", on: { click: async () => {
          const nuovi = await scattaFoto(doc, meta);
          if (!nuovi.length) return;
          ids.push(...nuovi);
          onCambio(true);
          disegna();
        } } }, "Foto"),
      );
    }
  };
  disegna();
  return box;
}
