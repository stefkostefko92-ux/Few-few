// Общи части на редакторите: списъци от обекти (добави/махни/премести), заглавната част, документите.
import { h, campo, scelta, uuid, dataOggi, oraAdesso } from "./ui.js";
import { NOMI_IMPIANTO, ETICHETTE_DOCUMENTO, ESITI_DOC } from "./etichette.js";

/** Списък от обекти: render(item, i) връща елемент; бутоните пипат масива и викат cambia(true). */
export function lista(arr, ctx, { titolo, nuovo, render, aggiungi = "Aggiungi", vuoto = "" }) {
  const box = h("div.lista");
  if (titolo) box.append(h("h3", {}, titolo));
  if (!arr.length && vuoto) box.append(h("p.nota", {}, vuoto));
  arr.forEach((item, i) => {
    const comandi = ctx.solaLettura
      ? null
      : h(
          "div.riga-azioni",
          {},
          h("button.link", { type: "button", "aria-label": "Sposta su", disabled: i === 0, on: { click: () => (arr.splice(i - 1, 0, arr.splice(i, 1)[0]), ctx.cambia(true)) } }, "Su"),
          h("button.link", { type: "button", "aria-label": "Sposta giù", disabled: i === arr.length - 1, on: { click: () => (arr.splice(i + 1, 0, arr.splice(i, 1)[0]), ctx.cambia(true)) } }, "Giù"),
          h("button.link.pericolo-t", { type: "button", on: { click: () => confirm("Rimuovere questa voce?") && (arr.splice(i, 1), ctx.cambia(true)) } }, "Rimuovi"),
        );
    box.append(h("div.riga", {}, render(item, i), comandi));
  });
  if (!ctx.solaLettura) box.append(h("button.btn.btn-sec", { type: "button", on: { click: () => (arr.push(nuovo()), ctx.cambia(true)) } }, aggiungi));
  return box;
}

const QUALITA = ["Amministratore di condominio", "Proprietario", "Condomino", "Gestore immobiliare", "Impresa", "Progettista"];

export function tabDati(ctx) {
  const i = ctx.doc.intestazione;
  const c = () => ctx.cambia();
  const sl = { solaLettura: ctx.solaLettura };
  const dl = h("datalist", { id: "qualita" }, ...QUALITA.map((q) => h("option", { value: q })));
  const oraBtn = (k) => (ctx.solaLettura ? null : h("button.link", { type: "button", on: { click: () => ((i[k] = oraAdesso()), ctx.cambia(true)) } }, "Adesso"));
  return h(
    "div",
    {},
    h("section.scheda", {}, h("h2", {}, "Documento"), campo("Titolo", i, "titolo", c, { max: 200, ...sl })),
    h(
      "section.scheda",
      {},
      h("h2", {}, "Committente"),
      dl,
      campo("Nome o denominazione", i.committente, "nome", c, { max: 200, ...sl }),
      campo("In qualità di", i.committente, "qualita", c, { max: 120, lista: "qualita", ...sl }),
      campo("Condominio o immobile", i.committente, "condominio", c, { max: 200, ...sl }),
      h("div.due", {}, campo("Email", i.committente, "email", c, { max: 200, tipo: "email", ...sl }), campo("Telefono", i.committente, "telefono", c, { max: 40, tipo: "tel", ...sl })),
    ),
    h(
      "section.scheda",
      {},
      h("h2", {}, "Impianto"),
      campo("Indirizzo", i.impianto, "indirizzo", c, { max: 200, ...sl }),
      h("div.due", {}, campo("Comune", i.impianto, "comune", c, { max: 100, ...sl }), campo("Provincia", i.impianto, "provincia", c, { max: 4, placeholder: "MI", ...sl })),
      scelta("Tipo di impianto", i.impianto, "tipo", [["", "— scegliere —"], ...Object.entries(NOMI_IMPIANTO)], () => ctx.cambia(true), sl),
      h("div.due", {}, campo("Numero di matricola", i.impianto, "matricola", c, { max: 60, ...sl }), campo("Anno di installazione", i.impianto, "anno", c, { max: 10, inputmode: "numeric", ...sl })),
      h("div.due", {}, campo("Costruttore", i.impianto, "costruttore", c, { max: 120, ...sl }), campo("Manutentore", i.impianto, "manutentore", c, { max: 160, ...sl })),
      h("div.due", {}, campo("Fermate", i.impianto, "fermate", c, { max: 20, ...sl }), campo("Portata", i.impianto, "portata", c, { max: 40, placeholder: "es. 480 kg, 6 persone", ...sl })),
      campo("Note sull'impianto", i.impianto, "note", c, { area: true, max: 2000, ...sl }),
    ),
    h(
      "section.scheda",
      {},
      h("h2", {}, "Data e presenti"),
      h(
        "div.tre",
        {},
        h("div", {}, campo("Data", i, "data", c, { tipo: "date", ...sl }), !ctx.solaLettura && !i.data ? h("button.link", { type: "button", on: { click: () => ((i.data = dataOggi()), ctx.cambia(true)) } }, "Oggi") : null),
        h("div", {}, campo("Ora di inizio", i, "oraInizio", c, { tipo: "time", ...sl }), oraBtn("oraInizio")),
        h("div", {}, campo("Ora di fine", i, "oraFine", c, { tipo: "time", ...sl }), oraBtn("oraFine")),
      ),
      lista(i.presenti, ctx, {
        titolo: "Presenti",
        vuoto: "Nessun presente indicato.",
        aggiungi: "Aggiungi presente",
        nuovo: () => ({ nome: "", ruolo: "" }),
        render: (p) => h("div.due", {}, campo("Nome", p, "nome", c, { max: 120, ...sl }), campo("Ruolo / ditta", p, "ruolo", c, { max: 160, placeholder: "es. Tecnico manutentore, ditta…", ...sl })),
      }),
    ),
    h(
      "details.scheda",
      {},
      h("summary", {}, "Oggetto e limiti dell'incarico (testo standard, modificabile)"),
      campo("Oggetto", i, "oggetto", c, { area: true, righe: 4, max: 4000, ...sl }),
      campo("Limiti", i, "limiti", c, { area: true, righe: 6, max: 4000, ...sl }),
    ),
  );
}

/** Документите (за оглед и за esame): каталожните + собствени; „—“ маха записа. */
export function documentiCatalogo(arr, voci, ctx, { conEstremi }) {
  const c = () => ctx.cambia();
  const riga = (rec, nome, voceId) => {
    const sel = h("select", { "aria-label": `Esito: ${nome}`, disabled: ctx.solaLettura }, h("option", { value: "" }, "—"), ...ESITI_DOC.map((e) => h("option", { value: e, selected: rec?.esito === e }, ETICHETTE_DOCUMENTO[e])));
    sel.addEventListener("change", () => {
      const k = arr.findIndex((x) => x.voceId === voceId && x.nome === nome);
      if (!sel.value && k >= 0) arr.splice(k, 1);
      else if (sel.value && k >= 0) arr[k].esito = sel.value;
      else if (sel.value) arr.push({ voceId, nome, esito: sel.value, nota: "", ...(conEstremi ? { estremi: "" } : {}) });
      ctx.cambia(true);
    });
    return h(
      "div.doc-riga",
      {},
      h("div.doc-nome", {}, nome, voci.find((v) => v.id === voceId)?.riferimento ? h("span.nota", {}, ` · ${voci.find((v) => v.id === voceId).riferimento}`) : null),
      sel,
      rec && conEstremi ? campo("Estremi", rec, "estremi", c, { max: 200, placeholder: "data, numero…", solaLettura: ctx.solaLettura }) : null,
      rec ? campo("Nota", rec, "nota", c, { max: 1000, solaLettura: ctx.solaLettura }) : null,
    );
  };
  const box = h("div.scheda", {}, ...voci.map((v) => riga(arr.find((x) => x.voceId === v.id), v.nome, v.id)));
  for (const altro of arr.filter((x) => !x.voceId || x.voceId.startsWith("altro-"))) box.append(riga(altro, altro.nome, altro.voceId));
  if (!ctx.solaLettura) {
    const nome = h("input", { placeholder: "Altro documento…", maxlength: 200, "aria-label": "Nome di un altro documento" });
    box.append(h("div.aggiungi-riga", {}, nome, h("button.btn.btn-sec", { type: "button", on: { click: () => nome.value.trim() && (arr.push({ voceId: `altro-${uuid().slice(0, 8)}`, nome: nome.value.trim(), esito: "presente", nota: "", ...(conEstremi ? { estremi: "" } : {}) }), ctx.cambia(true)) } }, "Aggiungi")));
  }
  return box;
}
