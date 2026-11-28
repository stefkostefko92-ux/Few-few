// Прегледът на документа — същото сглобяване като PDF-а (../lib/componi.js), работи и без връзка.
import { h, campo } from "./ui.js";
import { componi } from "../lib/componi.js";
import { completezza } from "../lib/completezza.js";
import { urlFoto, eliminaFoto } from "./foto.js";

function blocco(b) {
  switch (b.t) {
    case "p":
      return h("p", {}, b.testo);
    case "sotto":
      return h("h3", {}, b.testo);
    case "elenco":
      return h("ul", {}, ...b.voci.map((v) => h("li", {}, v)));
    case "tabella":
      return h("div.tabella-wrap", {}, h("table.tabella", {}, h("thead", {}, h("tr", {}, ...b.colonne.map((c) => h("th", { scope: "col" }, c)))), h("tbody", {}, ...b.righe.map((r) => h("tr", {}, ...r.map((c) => h("td", {}, c)))))));
  }
  return null;
}

export function tabAnteprima(ctx) {
  const c = componi(ctx.doc, ctx.cat);
  const problemi = ctx.doc.stato === "BOZZA" ? completezza(ctx.doc) : [];
  const foto = h("div.galleria");
  for (const f of c.foto) {
    const img = h("img", { alt: f.didascalia, loading: "lazy" });
    urlFoto(ctx.doc.id, f.id).then((u) => (img.src = u));
    foto.append(h("figure", {}, img, h("figcaption", {}, `Foto ${f.n} – ${f.didascalia}${f.ubicazione ? ` (${f.ubicazione})` : ""}`)));
  }
  return h(
    "article.anteprima",
    {},
    problemi.length ? h("div.avviso.avviso-info", {}, h("p", {}, "Prima dell'emissione mancano:"), h("ul", {}, ...problemi.map((p) => h("li", {}, p)))) : null,
    h("h2", {}, c.titolo),
    h("dl.riepilogo", {}, ...c.sommario.map((s) => h("div", {}, h("dt", {}, s.etichetta), h("dd", {}, s.valore)))),
    ...c.sezioni.flatMap((s) => [h("h2", {}, s.titolo), ...s.blocchi.map(blocco)]),
    c.foto.length ? h("h2", {}, "Report fotografico") : null,
    c.foto.length ? foto : null,
  );
}

/** Всички снимки: надпис, място, ред, триене. */
export function tabFoto(ctx) {
  const ordinate = [...ctx.doc.foto].sort((a, b) => a.ordine - b.ordine);
  const box = h("div.foto-tutte");
  if (!ordinate.length) box.append(h("p.nota", {}, "Le foto si aggiungono dalle voci della checklist, dalle osservazioni o dalle lavorazioni, con il pulsante «Foto»."));
  ordinate.forEach((f, i) => {
    const img = h("img", { alt: f.didascalia || `Foto ${i + 1}`, loading: "lazy" });
    urlFoto(ctx.doc.id, f.id).then((u) => (img.src = u));
    const sposta = (d) => {
      const altra = ordinate[i + d];
      if (!altra) return;
      [f.ordine, altra.ordine] = [altra.ordine, f.ordine];
      ctx.cambia(true);
    };
    box.append(
      h(
        "div.foto-riga",
        {},
        img,
        h(
          "div",
          {},
          campo("Didascalia", f, "didascalia", () => ctx.cambia(), { max: 500, solaLettura: ctx.solaLettura }),
          campo("Ubicazione", f, "ubicazione", () => ctx.cambia(), { max: 120, solaLettura: ctx.solaLettura }),
          ctx.solaLettura
            ? null
            : h(
                "div.riga-azioni",
                {},
                h("button.link", { type: "button", disabled: i === 0, on: { click: () => sposta(-1) } }, "Su"),
                h("button.link", { type: "button", disabled: i === ordinate.length - 1, on: { click: () => sposta(1) } }, "Giù"),
                h("button.link.pericolo-t", { type: "button", on: { click: async () => confirm("Eliminare la foto?") && (await eliminaFoto(ctx.doc, f.id), ctx.cambia(true)) } }, "Elimina"),
              ),
        ),
      ),
    );
  });
  return box;
}
