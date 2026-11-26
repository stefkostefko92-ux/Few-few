// Редактори за controllo qualità, esame documentale и verbale. Бързо въвеждане: поставен списък → позиции.
import { h, campo, scelta, segmenti, uuid } from "./ui.js";
import { striscia } from "./foto.js";
import { lista, documentiCatalogo } from "./campi.js";
import { applicabile } from "./ed-sopralluogo.js";
import { ETICHETTE_LAVORO, ESITI_LAVORO, ETICHETTE_PRESCRIZIONE, STATI_PRESCRIZIONE } from "./etichette.js";

/** „Incolla un elenco“: по един ред — нова позиция. */
function incolla(etichetta, ctx, crea) {
  if (ctx.solaLettura) return null;
  const ta = h("textarea", { rows: 4, maxlength: 20000, placeholder: "Una voce per riga (anche copiata dal preventivo o dal verbale)", "aria-label": etichetta });
  return h(
    "details.scheda",
    {},
    h("summary", {}, etichetta),
    ta,
    h("button.btn.btn-sec", { type: "button", on: { click: () => {
      const righe = ta.value.split(/\r?\n/).map((r) => r.replace(/^\s*[-–•*\d.)]+\s*/, "").trim()).filter(Boolean);
      righe.slice(0, 200).forEach((r) => crea(r));
      ta.value = "";
      ctx.cambia(true);
    } } }, "Aggiungi le voci"),
  );
}

export function tabLavorazioni(ctx) {
  const d = ctx.doc.dati;
  const c = () => ctx.cambia();
  const sl = ctx.solaLettura;
  const suggerimenti = h("datalist", { id: "lavori" }, ...ctx.cat.lavori.flatMap((k) => k.voci).map((v) => h("option", { value: v })));
  const nuova = (richiesto = "") => ({ id: uuid(), richiesto, dichiarato: "", osservato: "", esito: "chiarire", nota: "", foto: [] });
  return h(
    "div",
    {},
    suggerimenti,
    h("section.scheda", {}, h("h2", {}, "Riferimento"), campo("Documento di riferimento", d, "riferimento", c, { max: 500, placeholder: "Preventivo n. … del …", solaLettura: sl }), campo("Impresa esecutrice", d, "ditta", c, { max: 200, solaLettura: sl })),
    incolla("Incolla l'elenco delle lavorazioni", ctx, (r) => d.voci.push(nuova(r))),
    lista(d.voci, ctx, {
      titolo: "Lavorazioni",
      vuoto: "Aggiunga le lavorazioni del preventivo o dell'ordine.",
      aggiungi: "Aggiungi lavorazione",
      nuovo: () => nuova(),
      render: (v, i) =>
        h(
          "div",
          {},
          h("p.num", {}, `N. ${i + 1}`),
          campo("Richiesto", v, "richiesto", c, { max: 1000, lista: "lavori", solaLettura: sl }),
          campo("Dichiarato dall'impresa", v, "dichiarato", c, { max: 1000, solaLettura: sl }),
          campo("Osservato", v, "osservato", c, { area: true, righe: 2, max: 2000, solaLettura: sl }),
          segmenti("Esito", v.esito, ESITI_LAVORO.map((e) => [e, ETICHETTE_LAVORO[e], `l-${e}`]), (e) => ((v.esito = e), ctx.cambia(true)), sl),
          campo("Nota", v, "nota", c, { area: true, righe: 1, max: 2000, solaLettura: sl }),
          striscia(ctx.doc, v.foto, { riferimento: v.id, ubicazione: "", didascalia: v.richiesto }, (s) => ctx.cambia(s), sl),
        ),
    }),
    h("section.scheda", {}, h("h2", {}, "Conclusioni"), campo("Conclusioni (facoltative)", d, "conclusioni", c, { area: true, righe: 5, max: 6000, solaLettura: sl })),
  );
}

export const tabDocumentiEsame = (ctx) =>
  h(
    "div",
    {},
    h("p.nota", {}, "Per ogni documento indichi se è stato fornito; gli estremi (data, numero) aiutano a ritrovarlo."),
    documentiCatalogo(ctx.doc.dati.documenti, ctx.cat.documenti.filter((v) => applicabile(v.applicabile, ctx.doc.intestazione.impianto.tipo)), ctx, { conEstremi: true }),
  );

export function tabPrescrizioni(ctx) {
  const d = ctx.doc.dati;
  const c = () => ctx.cambia();
  const sl = ctx.solaLettura;
  const nuova = (testo = "") => ({ id: uuid(), testo, stato: "aperta", nota: "", foto: [] });
  return h(
    "div",
    {},
    h("section.scheda", {}, campo("Verbale di riferimento", d, "verbale", c, { max: 500, placeholder: "Verbale di verifica del … (organismo …)", solaLettura: sl })),
    incolla("Incolla le prescrizioni del verbale", ctx, (r) => d.prescrizioni.push(nuova(r))),
    lista(d.prescrizioni, ctx, {
      titolo: "Prescrizioni",
      vuoto: "Nessuna prescrizione inserita.",
      aggiungi: "Aggiungi prescrizione",
      nuovo: () => nuova(),
      render: (p, i) =>
        h(
          "div",
          {},
          h("p.num", {}, `N. ${i + 1}`),
          campo("Prescrizione", p, "testo", c, { area: true, righe: 2, max: 2000, solaLettura: sl }),
          segmenti("Stato", p.stato, STATI_PRESCRIZIONE.map((s) => [s, ETICHETTE_PRESCRIZIONE[s], `ps-${s}`]), (s) => ((p.stato = s), ctx.cambia(true)), sl),
          campo("Nota / documento che la chiude", p, "nota", c, { area: true, righe: 1, max: 1500, solaLettura: sl }),
          striscia(ctx.doc, p.foto, { riferimento: p.id, ubicazione: "", didascalia: p.testo.slice(0, 120) }, (s) => ctx.cambia(s), sl),
        ),
    }),
    h("section.scheda", {}, h("h2", {}, "Conclusioni"), campo("Conclusioni (facoltative)", d, "conclusioni", c, { area: true, righe: 5, max: 6000, solaLettura: sl })),
  );
}

export function tabRiunione(ctx) {
  const d = ctx.doc.dati;
  const c = () => ctx.cambia();
  const sl = ctx.solaLettura;
  const odg = d.ordineDelGiorno.map((testo) => ({ testo }));
  const salvaOdg = () => ((d.ordineDelGiorno = odg.map((x) => x.testo)), ctx.cambia());
  return h(
    "div",
    {},
    h(
      "section.scheda",
      {},
      scelta("Tipo di verbale", d, "sottotipo", [["riunione", "Verbale di riunione"], ["avanzamento", "Rapporto di avanzamento lavori"]], () => ctx.cambia(true), { solaLettura: sl }),
      campo("Luogo", d, "luogo", c, { max: 200, solaLettura: sl }),
      campo("Prossima riunione", d, "prossimaRiunione", c, { max: 200, placeholder: "data, ora e luogo", solaLettura: sl }),
    ),
    lista(odg, { ...ctx, cambia: (s) => ((d.ordineDelGiorno = odg.map((x) => x.testo)), ctx.cambia(s)) }, {
      titolo: "Ordine del giorno",
      aggiungi: "Aggiungi argomento",
      nuovo: () => ({ testo: "" }),
      render: (x) => campo("Argomento", x, "testo", salvaOdg, { max: 500, solaLettura: sl }),
    }),
    lista(d.punti, ctx, {
      titolo: "Discussione e decisioni",
      aggiungi: "Aggiungi punto",
      nuovo: () => ({ id: uuid(), titolo: "", discussione: "", decisione: "" }),
      render: (p) => h("div", {}, campo("Punto", p, "titolo", c, { max: 300, solaLettura: sl }), campo("Discussione", p, "discussione", c, { area: true, righe: 3, max: 5000, solaLettura: sl }), campo("Decisione", p, "decisione", c, { area: true, righe: 2, max: 2000, solaLettura: sl })),
    }),
    lista(d.azioni, ctx, {
      titolo: "Attività concordate",
      aggiungi: "Aggiungi attività",
      nuovo: () => ({ id: uuid(), cosa: "", chi: "", entro: "", stato: "aperta" }),
      render: (a) => h("div", {}, campo("Che cosa", a, "cosa", c, { max: 1000, solaLettura: sl }), h("div.tre", {}, campo("Chi", a, "chi", c, { max: 200, solaLettura: sl }), campo("Entro", a, "entro", c, { tipo: "date", solaLettura: sl }), scelta("Stato", a, "stato", [["aperta", "Aperta"], ["chiusa", "Chiusa"]], c, { solaLettura: sl }))),
    }),
    d.sottotipo === "avanzamento" || d.avanzamento.length
      ? lista(d.avanzamento, ctx, {
          titolo: "Avanzamento dei lavori",
          aggiungi: "Aggiungi lavorazione",
          nuovo: () => ({ id: uuid(), lavorazione: "", percentuale: 0, nota: "", foto: [] }),
          render: (a) => {
            const pc = h("input", { type: "number", min: 0, max: 100, step: 5, value: a.percentuale, "aria-label": "Percentuale", disabled: sl });
            pc.addEventListener("input", () => ((a.percentuale = Math.max(0, Math.min(100, Number(pc.value) || 0))), ctx.cambia()));
            return h("div", {}, campo("Lavorazione", a, "lavorazione", c, { max: 300, solaLettura: sl }), h("label", {}, "Avanzamento (%)"), pc, campo("Nota", a, "nota", c, { area: true, righe: 1, max: 2000, solaLettura: sl }), striscia(ctx.doc, a.foto, { riferimento: a.id, ubicazione: "", didascalia: a.lavorazione }, (s) => ctx.cambia(s), sl));
          },
        })
      : null,
  );
}
