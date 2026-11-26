// Редактор на огледа: чеклист по секции (само приложимите за типа уредба), готови фрази за аномалиите и
// въпросите, снимки към всяка точка; свободни наблюдения; документи; заключение.
import { h, campo, segmenti, uuid } from "./ui.js";
import { striscia } from "./foto.js";
import { lista, documentiCatalogo } from "./campi.js";
import { ETICHETTE_PRIORITA, PRIORITA } from "./etichette.js";

const ESITI = [
  ["ok", "OK", "s-ok"],
  ["anomalia", "Anomalia", "s-anom"],
  ["chiarire", "Da chiarire", "s-chiar"],
  ["nv", "Non verif.", "s-nv"],
  ["na", "N.A.", "s-na"],
];

export const applicabile = (a, tipo) => !a || !tipo || a.includes(tipo);
export const sezioniApplicabili = (ctx) => ctx.cat.sezioni.filter((s) => applicabile(s.applicabile, ctx.doc.intestazione.impianto.tipo));
const vociApplicabili = (sez, ctx) => sez.voci.filter((v) => applicabile(v.applicabile, ctx.doc.intestazione.impianto.tipo));

function sceltaFrase(etichetta, frasi, onScelta, solaLettura, scelta = (_f) => false) {
  const sel = h("select", { "aria-label": etichetta, disabled: solaLettura }, h("option", { value: "" }, `— ${etichetta} —`), ...frasi.map((f, k) => h("option", { value: String(k), selected: scelta(f) }, f.testo)));
  sel.addEventListener("change", () => sel.value !== "" && onScelta(frasi[Number(sel.value)]));
  return sel;
}

function voce(sez, v, ctx) {
  const esiti = ctx.doc.dati.esiti;
  const e = esiti[v.id];
  const sl = ctx.solaLettura;
  const c = () => ctx.cambia();
  const imposta = (val) => {
    if (e?.esito === val && !e.foto.length) delete esiti[v.id];
    else esiti[v.id] = { ...(e ?? { nota: "", foto: [] }), esito: val };
    const n = esiti[v.id];
    if (n?.esito === "anomalia" && !n.anomalia) {
      const f = v.anomalie[0];
      n.anomalia = v.anomalie.length === 1 ? { fraseId: f.id, testo: f.testo, raccomandazione: f.raccomandazione, priorita: f.priorita } : { fraseId: "", testo: "", raccomandazione: "", priorita: "media" };
    }
    if (n?.esito === "chiarire" && n.domanda === undefined) n.domanda = v.chiarimenti.length === 1 ? v.chiarimenti[0] : "";
    ctx.cambia(true);
  };
  const corpo = [h("p.voce-t", {}, v.testo), v.aiuto ? h("p.nota", {}, v.aiuto) : null, segmenti(v.testo, e?.esito, ESITI, imposta, sl)];
  if (e?.esito === "anomalia") {
    const proprie = ctx.cat.frasi.filter((f) => f.voceId === v.id && f.tipo === "anomalia");
    const frasi = [...v.anomalie, ...proprie];
    corpo.push(
      h(
        "div.dettaglio",
        {},
        frasi.length && !sl ? sceltaFrase("scegli una frase", frasi, (f) => ((e.anomalia = { fraseId: f.id, testo: f.testo, raccomandazione: f.raccomandazione, priorita: f.priorita }), ctx.cambia(true)), sl, (f) => f.id === e.anomalia.fraseId) : null,
        campo("Anomalia osservata", e.anomalia, "testo", c, { area: true, righe: 2, max: 1500, solaLettura: sl }),
        campo("Raccomandazione", e.anomalia, "raccomandazione", c, { area: true, righe: 2, max: 1500, solaLettura: sl }),
        segmenti("Priorità", e.anomalia.priorita, PRIORITA.map((p) => [p, `Priorità ${ETICHETTE_PRIORITA[p].toLowerCase()}`, `p-${p}`]), (p) => ((e.anomalia.priorita = p), ctx.cambia(true)), sl),
      ),
    );
  }
  if (e?.esito === "chiarire") {
    const frasi = [...v.chiarimenti.map((t) => ({ testo: t })), ...ctx.cat.frasi.filter((f) => f.voceId === v.id && f.tipo === "chiarimento")];
    corpo.push(h("div.dettaglio", {}, frasi.length && !sl ? sceltaFrase("scegli una domanda", frasi, (f) => ((e.domanda = f.testo), ctx.cambia(true)), sl, (f) => f.testo === e.domanda) : null, campo("Punto da chiarire", e, "domanda", c, { area: true, righe: 2, max: 1500, solaLettura: sl })));
  }
  if (e) {
    corpo.push(campo(e.esito === "nv" ? "Perché non è verificabile" : "Nota", e, "nota", c, { area: true, righe: 1, max: 2000, solaLettura: sl }));
    corpo.push(striscia(ctx.doc, e.foto, { riferimento: v.id, ubicazione: sez.ubicazione, didascalia: v.testo }, (strutturale) => ctx.cambia(strutturale), sl));
  }
  return h(`div.voce${e ? ` esito-${e.esito}` : ""}`, { id: `v-${v.id}` }, ...corpo);
}

export function tabChecklist(ctx) {
  const sezioni = sezioniApplicabili(ctx);
  const tutte = sezioni.flatMap((s) => vociApplicabili(s, ctx));
  const fatte = tutte.filter((v) => ctx.doc.dati.esiti[v.id]).length;
  const box = h("div.checklist-corpo", {});
  // Индекс на секциите: отстрани на таблет/компютър, падащо меню на телефон.
  const vai = (id) => {
    ctx.aperte.add(id);
    ctx.ridisegna();
    requestAnimationFrame(() => document.getElementById(`s-${id}`)?.scrollIntoView({ block: "start" }));
  };
  const conta = (s) => {
    const voci = vociApplicabili(s, ctx);
    return { n: voci.filter((v) => ctx.doc.dati.esiti[v.id]).length, tot: voci.length, anom: voci.filter((v) => ctx.doc.dati.esiti[v.id]?.esito === "anomalia").length };
  };
  const indice = h(
    "nav.indice",
    { "aria-label": "Sezioni della checklist" },
    ...sezioni.map((s) => {
      const c = conta(s);
      return h(`button${c.n === c.tot ? ".completa" : ""}`, { type: "button", on: { click: () => vai(s.id) } }, h("span", {}, s.titolo), h("span.sez-n", {}, `${c.n}/${c.tot}${c.anom ? ` · ${c.anom} anom.` : ""}`));
    }),
  );
  const salto = h("select.salto", { "aria-label": "Vai alla sezione" }, h("option", { value: "" }, "Vai alla sezione…"), ...sezioni.map((s) => h("option", { value: s.id }, `${s.titolo} (${conta(s).n}/${conta(s).tot})`)));
  salto.addEventListener("change", () => salto.value && vai(salto.value));
  box.append(salto);
  if (!ctx.doc.intestazione.impianto.tipo) box.append(h("p.avviso.avviso-info", {}, "Scelga il tipo di impianto nella scheda «Dati»: la checklist mostrerà solo le voci pertinenti."));
  box.append(h("div.progresso", { role: "status" }, h("progress", { max: tutte.length, value: fatte }), h("span", {}, `${fatte} di ${tutte.length} voci compilate`)));
  for (const sez of sezioni) {
    const voci = vociApplicabili(sez, ctx);
    const n = voci.filter((v) => ctx.doc.dati.esiti[v.id]).length;
    const anomalie = voci.filter((v) => ctx.doc.dati.esiti[v.id]?.esito === "anomalia").length;
    const tutteOk = ctx.solaLettura || n === voci.length
      ? null
      : h("button.btn.btn-sec.piccolo", { type: "button", on: { click: () => {
          for (const v of voci) if (!ctx.doc.dati.esiti[v.id]) ctx.doc.dati.esiti[v.id] = { esito: "ok", nota: "", foto: [] };
          ctx.cambia(true);
        } } }, "Le voci rimanenti: nessuna anomalia");
    const det = h(
      "details.sezione",
      { open: ctx.aperte.has(sez.id), id: `s-${sez.id}` },
      h("summary", {}, h("span.sez-t", {}, sez.titolo), h("span.sez-n", {}, `${n}/${voci.length}${anomalie ? ` · ${anomalie} anomalie` : ""}`)),
      tutteOk,
      ...voci.map((v) => voce(sez, v, ctx)),
    );
    det.addEventListener("toggle", () => (det.open ? ctx.aperte.add(sez.id) : ctx.aperte.delete(sez.id)));
    box.append(det);
  }
  return h("div.checklist", {}, indice, box);
}

export function tabOsservazioni(ctx) {
  const d = ctx.doc.dati;
  const sezioni = sezioniApplicabili(ctx);
  const c = () => ctx.cambia();
  return h(
    "div",
    {},
    lista(d.osservazioni, ctx, {
      titolo: "Osservazioni libere",
      vuoto: "Annoti qui ciò che non rientra nella checklist.",
      aggiungi: "Aggiungi osservazione",
      nuovo: () => ({ id: uuid(), sezioneId: "", testo: "", foto: [] }),
      render: (o) => {
        const sel = h("select", { "aria-label": "Parte dell'impianto", disabled: ctx.solaLettura }, h("option", { value: "" }, "Altro"), ...sezioni.map((s) => h("option", { value: s.id, selected: o.sezioneId === s.id }, s.titolo)));
        sel.addEventListener("change", () => ((o.sezioneId = sel.value), ctx.cambia()));
        const ubic = sezioni.find((s) => s.id === o.sezioneId)?.ubicazione ?? "";
        return h("div", {}, sel, campo("Osservazione", o, "testo", c, { area: true, max: 3000, solaLettura: ctx.solaLettura }), striscia(ctx.doc, o.foto, { riferimento: o.id, ubicazione: ubic, didascalia: "" }, (s) => ctx.cambia(s), ctx.solaLettura));
      },
    }),
    h("section.scheda", {}, h("h2", {}, "Conclusioni"), campo("Conclusioni (facoltative)", d, "conclusioni", c, { area: true, righe: 5, max: 6000, solaLettura: ctx.solaLettura })),
  );
}

export const tabDocumentiVisti = (ctx) =>
  h("div", {}, h("p.nota", {}, "Documenti ricevuti o visionati durante il sopralluogo."), documentiCatalogo(ctx.doc.dati.documentiVisti, ctx.cat.documenti.filter((v) => applicabile(v.applicabile, ctx.doc.intestazione.impianto.tipo)), ctx, { conEstremi: false }));
