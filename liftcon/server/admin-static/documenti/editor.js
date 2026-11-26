// Редакторът на един документ: табове по вида, автоматичен запис на устройството, синхронизация, действия
// (преглед, PDF, издаване, нова ревизия, дубликат, изтриване). Издаденият документ е само за четене.
import { h, toast, avviso, uuid } from "./ui.js";
import { db } from "./db.js";
import { api, online } from "./api.js";
import { salvaLocale, sincronizza, aggiornaDaServer, risolviConflitto, suEvento } from "./sync.js";
import { tabDati } from "./campi.js";
import { tabChecklist, tabOsservazioni, tabDocumentiVisti } from "./ed-sopralluogo.js";
import { tabLavorazioni, tabDocumentiEsame, tabPrescrizioni, tabRiunione } from "./ed-altri.js";
import { tabAnteprima, tabFoto } from "./anteprima.js";
import { NOMI_TIPO } from "./etichette.js";
import { datiVuoti } from "../lib/nuovo.js";
import { apriPdf, pdfPronto } from "./installa.js";

const TABS = {
  SOPRALLUOGO: [["dati", "Dati", tabDati], ["checklist", "Checklist", tabChecklist], ["osservazioni", "Osservazioni", tabOsservazioni], ["documenti", "Documenti", tabDocumentiVisti], ["foto", "Foto", tabFoto], ["anteprima", "Anteprima", tabAnteprima]],
  CONTROLLO_QUALITA: [["dati", "Dati", tabDati], ["lavorazioni", "Lavorazioni", tabLavorazioni], ["foto", "Foto", tabFoto], ["anteprima", "Anteprima", tabAnteprima]],
  ESAME_DOCUMENTALE: [["dati", "Dati", tabDati], ["documenti", "Documenti", tabDocumentiEsame], ["prescrizioni", "Prescrizioni", tabPrescrizioni], ["foto", "Foto", tabFoto], ["anteprima", "Anteprima", tabAnteprima]],
  VERBALE: [["dati", "Dati", tabDati], ["riunione", "Riunione", tabRiunione], ["foto", "Foto", tabFoto], ["anteprima", "Anteprima", tabAnteprima]],
};

export async function apriEditor(root, id, app) {
  let rec = await db.documento(id);
  if ((!rec || rec.solaSintesi) && online()) {
    await aggiornaDaServer(id);
    rec = await db.documento(id);
  }
  if (!rec?.doc) {
    root.replaceChildren(h("p", {}, h("a", { href: "#/" }, "← Documenti")), avviso("info", online() ? "Documento non trovato." : "Questo documento non è ancora sul dispositivo: lo apra una volta con la connessione."));
    return () => {};
  }
  const doc = rec.doc;
  const ctx = { doc, cat: app.catalogo, aperte: new Set(), solaLettura: doc.stato !== "BOZZA" || !app.sessione.permessi.modifica, cambia, ridisegna: () => disegnaTab() };
  let tab = sessionStorage.getItem(`tab-${id}`) ?? "dati";
  let timer;
  let pendente = false; // редакция, която още не е записана на устройството
  const statoEl = h("span.chip");
  const banner = h("div.banner");
  const contenuto = h("div.tab-corpo");

  async function aggiornaStato() {
    const r = await db.documento(id);
    if (!r) return;
    statoEl.className = `chip ${r.conflitto ? "chip-conflitto" : r.sporco ? "chip-sporco" : doc.stato === "EMESSO" ? "chip-emesso" : "chip-ok"}`;
    statoEl.textContent = r.conflitto ? "Conflitto" : doc.stato === "EMESSO" ? `Emesso ${doc.numero} · Rev. ${doc.revisione}` : r.sporco ? "Da sincronizzare" : "Sincronizzato";
    banner.replaceChildren();
    if (r.errore) banner.append(avviso("errore", r.errore));
    if (r.conflitto) {
      banner.append(
        h(
          "div.avviso.avviso-errore",
          {},
          h("p", {}, `Il documento è stato modificato anche da un altro dispositivo (versione ${r.conflitto.versione} sul server). Scelga quale tenere:`),
          h("button.btn", { type: "button", on: { click: async () => {
            await risolviConflitto(id, "mia");
            doc.versione = (await db.documento(id))?.doc?.versione ?? doc.versione; // моето съдържание върху версията на сървъра
            toast("Verrà salvata la sua versione.");
            aggiornaStato();
          } } }, "Mantieni la mia"),
          " ",
          h("button.btn.btn-sec", { type: "button", on: { click: async () => {
            // Неизпратената редакция се отказва — иначе затварянето на редактора би я записало обратно.
            clearTimeout(timer);
            pendente = false;
            await risolviConflitto(id, "server");
            app.vai(`#/d/${id}`, true);
          } } }, "Usa quella del server"),
        ),
      );
    }
  }

  function disegnaTab() {
    const y = window.scrollY;
    const def = TABS[doc.tipo].find(([k]) => k === tab) ?? TABS[doc.tipo][0];
    contenuto.replaceChildren(def[2](ctx));
    if (def[0] === "dati" && gestione.length) contenuto.append(h("section.scheda", {}, h("h2", {}, "Gestione del documento"), h("div.azioni-riga", {}, ...gestione)));
    nav.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === def[0])));
    window.scrollTo(0, y);
  }

  async function cambia(strutturale = false) {
    clearTimeout(timer);
    const salva = async () => {
      await salvaLocale(doc);
      aggiornaStato();
    };
    if (strutturale) {
      // Първо екранът (без чакане на IndexedDB), после записът.
      pendente = false;
      disegnaTab();
      await salva();
    } else {
      pendente = true;
      timer = setTimeout(() => ((pendente = false), salva()), 500);
    }
  }

  const nav = h(
    "nav.tabs",
    { role: "tablist", "aria-label": "Sezioni del documento" },
    ...TABS[doc.tipo].map(([k, t]) => h("button", { type: "button", role: "tab", dataset: { tab: k }, on: { click: () => ((tab = k), sessionStorage.setItem(`tab-${id}`, k), disegnaTab()) } }, t)),
  );

  async function primaSincronizza() {
    if (!online()) return toast("Serve la connessione.", "errore"), false;
    // PDF/издаване само когато и снимките са на сървъра (иначе остават извън издадения документ завинаги).
    const fotoInAttesa = async () => (await db.fotoDi(id)).filter((f) => !f.caricata);
    if (pendente) {
      clearTimeout(timer);
      pendente = false;
      await salvaLocale(doc);
    }
    const e = await sincronizza();
    const r = await db.documento(id);
    if (e !== "ok" || r?.sporco || r?.conflitto) return toast(e === "sessione" ? "Sessione scaduta: acceda di nuovo." : "Sincronizzazione non riuscita.", "errore"), false;
    const attesa = await fotoInAttesa();
    if (attesa.length) {
      toast(attesa.some((f) => f.errore) ? "Una foto non è stata accettata dal server: la elimini e la scatti di nuovo." : `Caricamento delle foto in corso (${attesa.length}): riprovi tra poco.`, "errore");
      return false;
    }
    return true;
  }

  const azioni = [];
  const gestione = [];
  azioni.push(h("button.btn.btn-sec", { type: "button", on: { click: async () => {
    const url = `/admin/documenti/${id}/pdf`;
    if (pdfPronto(url) || (await primaSincronizza())) await apriPdf(url, (t) => toast(t));
  } } }, doc.stato === "EMESSO" ? "PDF" : "PDF (bozza)"));
  if (doc.stato === "BOZZA" && app.sessione.permessi.emetti) {
    azioni.push(h("button.btn", { type: "button", on: { click: async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled || !confirm("Emettere il documento? Riceverà un numero e non sarà più modificabile (si potrà fare una nuova revisione).")) return;
      btn.disabled = true; // un solo «Emetti» alla volta (doppio tocco)
      try {
        if (!(await primaSincronizza())) return;
        const r = await api(`/documenti/${id}/emetti`, { method: "POST", json: { versione: (await db.documento(id)).base } });
        if (r.stato === 422) return ((tab = "anteprima"), disegnaTab(), toast("Mancano alcuni dati: veda l'elenco.", "errore"));
        if (r.stato === 409 && r.dati?.errore === "occupato") return toast("Emissione o caricamento di foto già in corso: riprovi tra poco.", "errore");
        if (r.stato !== 200) return toast("Emissione non riuscita.", "errore");
        await aggiornaDaServer(id);
        toast(`Emesso: ${r.dati.numero}`, "ok");
        app.vai(`#/d/${id}`, true);
      } finally {
        btn.disabled = false;
      }
    } } }, "Emetti"));
  }
  if (doc.stato === "EMESSO" && app.sessione.permessi.modifica) {
    azioni.push(h("button.btn", { type: "button", on: { click: async () => {
      if (!online()) return toast("Serve la connessione.", "errore");
      const r = await api(`/documenti/${id}/revisione`, { method: "POST", json: {} });
      if (r.stato !== 201) return toast("Operazione non riuscita.", "errore");
      await aggiornaDaServer(r.dati.id);
      app.vai(`#/d/${r.dati.id}`);
    } } }, "Nuova revisione"));
  }
  if (app.sessione.permessi.modifica) {
    gestione.push(h("button.btn.btn-sec", { type: "button", on: { click: async () => {
      const nuovo = structuredClone(doc);
      Object.assign(nuovo, { id: uuid(), stato: "BOZZA", numero: null, revisione: 0, versione: 0, foto: [], emessoIl: null, dati: datiVuoti(doc.tipo) });
      nuovo.intestazione.impianto.matricola = "";
      nuovo.intestazione.impianto.note = "";
      await salvaLocale(nuovo);
      toast("Duplicato per un altro impianto (senza foto e senza esiti).", "ok");
      app.vai(`#/d/${nuovo.id}`);
    } } }, "Duplica per un altro impianto"));
    gestione.push(h("button.btn.btn-pericolo", { type: "button", on: { click: async () => {
      if (!confirm(doc.stato === "EMESSO" ? "Eliminare definitivamente il documento emesso e i suoi file?" : "Eliminare la bozza e le sue foto?")) return;
      const r0 = await db.documento(id);
      if (r0.base >= 1) {
        if (!online()) return toast("Serve la connessione.", "errore");
        const r = await api(`/documenti/${id}`, { method: "DELETE" });
        if (r.stato !== 204 && r.stato !== 404) return toast(r.stato === 403 ? "Non ha il permesso di eliminarlo." : "Eliminazione non riuscita.", "errore");
      }
      await db.eliminaDocumento(id);
      app.vai("#/");
    } } }, "Elimina"));
  }

  root.replaceChildren(
    h("p.indietro", {}, h("a", { href: "#/" }, "← Documenti")),
    h("div.doc-testa", {}, h("h1", {}, doc.intestazione.titolo || NOMI_TIPO[doc.tipo]), statoEl),
    banner,
    nav,
    contenuto,
    h("div.azioni.barra", {}, ...azioni),
  );
  disegnaTab();
  aggiornaStato();
  // След синхронизация: собствен запис → само новата версия в паметта; документът е обновен от друго
  // устройство (свален от сървъра) → редакторът се презарежда; изтрит → към списъка.
  const stop = suEvento(async (e) => {
    if (e.tipo === "eliminato" && e.id === id) {
      toast("Il documento è stato eliminato da un altro utente.", "errore");
      return app.vai("#/");
    }
    if (e.tipo !== "fine") return;
    const r = await db.documento(id);
    if (r?.doc && r.doc.versione !== doc.versione) {
      if (r.fonte === "server" && !r.sporco && !pendente) {
        toast("Aggiornato con le modifiche fatte su un altro dispositivo.");
        return app.vai(`#/d/${id}`, true);
      }
      if (r.fonte === "locale") Object.assign(doc, { versione: r.doc.versione, stato: r.doc.stato, numero: r.doc.numero, revisione: r.doc.revisione, emessoIl: r.doc.emessoIl, autore: r.doc.autore });
    }
    aggiornaStato();
  });
  return () => {
    clearTimeout(timer);
    stop();
    if (pendente) void salvaLocale(doc).catch(() => {});
  };
}
