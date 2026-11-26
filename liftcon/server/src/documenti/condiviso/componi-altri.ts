// Controllo qualità, esame documentale, verbale — сглобяване (спецификация D5).
import type { DocumentoCompleto } from "./tipi.js";
import type { Blocco, Composto, Sezione } from "./composto.js";
import { attivitaBase, numeraFoto, righeImpianto, sezioneOggetto, titoloDocumento } from "./composto.js";
import { ETICHETTE_DOCUMENTO, ETICHETTE_LAVORO, ETICHETTE_PRESCRIZIONE } from "./testi.js";
import { conPunto, dataIt, rifFoto } from "./formato.js";

const tabellaImpianto = (doc: DocumentoCompleto): Blocco => ({ t: "tabella", colonne: ["Dato", "Valore"], righe: righeImpianto(doc.intestazione), pesi: [1, 3] });
const conclusioni = (testo: string): Blocco[] => (testo.trim() ? [{ t: "sotto", testo: "Conclusioni" }, { t: "p", testo: testo.trim() }] : []);
const oVuoto = (b: Blocco[], vuoto: string): Blocco[] => (b.length ? b : [{ t: "p", testo: vuoto }]);

export function componiControllo(doc: DocumentoCompleto<"CONTROLLO_QUALITA">): Composto {
  const d = doc.dati;
  const { numeri, foto } = numeraFoto(doc, d.voci.flatMap((v) => v.foto));
  const n = (k: number) => String(k + 1);
  const difformi = d.voci.map((v, k) => ({ v, k })).filter(({ v }) => v.esito === "difforme" || v.esito === "parziale");
  const aperte = d.voci.map((v, k) => ({ v, k })).filter(({ v }) => v.esito === "chiarire" || v.esito === "nv");
  const riferimento: Blocco[] = [tabellaImpianto(doc)];
  if (d.riferimento.trim() || d.ditta.trim()) {
    riferimento.push({ t: "p", testo: [d.riferimento.trim() && `Documento di riferimento: ${conPunto(d.riferimento)}`, d.ditta.trim() && `Impresa esecutrice: ${conPunto(d.ditta)}`].filter(Boolean).join(" ") });
  }
  const sezioni: Sezione[] = [
    sezioneOggetto(1, doc.intestazione),
    { titolo: "2. Impianto e documento di riferimento", blocchi: riferimento },
    { titolo: "3. Attività svolte", blocchi: attivitaBase(doc.intestazione, "Il controllo si è svolto") },
    {
      titolo: "4. Lavorazioni controllate",
      blocchi: oVuoto(
        d.voci.length
          ? [{ t: "tabella", colonne: ["N.", "Richiesto", "Dichiarato", "Osservato", "Esito", "Foto"], righe: d.voci.map((v, k) => [n(k), v.richiesto, v.dichiarato, [v.osservato, v.nota].filter((x) => x.trim()).join(" – "), ETICHETTE_LAVORO[v.esito], rifFoto(v.foto, numeri)]), pesi: [0.5, 2.4, 1.6, 2.4, 1.4, 1] }]
          : [],
        "Nessuna lavorazione registrata.",
      ),
    },
    { titolo: "5. Difformità osservate", blocchi: oVuoto(difformi.length ? [{ t: "elenco", voci: difformi.map(({ v, k }) => `N. ${n(k)} – ${v.richiesto}: ${conPunto(v.osservato || v.nota || ETICHETTE_LAVORO[v.esito])}`) }] : [], "Non sono state osservate difformità tra quanto richiesto e quanto osservato.") },
    { titolo: "6. Punti da chiarire", blocchi: oVuoto(aperte.length ? [{ t: "elenco", voci: aperte.map(({ v, k }) => `N. ${n(k)} – ${v.richiesto}: ${conPunto(v.nota || ETICHETTE_LAVORO[v.esito])}`) }] : [], "Non ci sono punti da chiarire.") },
    {
      titolo: "7. Raccomandazioni",
      blocchi: [
        ...oVuoto(difformi.length ? [{ t: "elenco", voci: difformi.map(({ v, k }) => `Chiedere all'impresa di completare o motivare la lavorazione n. ${n(k)} («${v.richiesto}») prima del saldo.`) }] : [], "Non ci sono raccomandazioni legate a difformità."),
        ...conclusioni(d.conclusioni),
      ],
    },
  ];
  return {
    titolo: titoloDocumento(doc),
    sommario: [
      { etichetta: "Lavorazioni controllate", valore: String(d.voci.length) },
      { etichetta: "Difformità", valore: String(difformi.length) },
      { etichetta: "Punti da chiarire", valore: String(aperte.length) },
      { etichetta: "Fotografie", valore: String(foto.length) },
    ],
    sezioni,
    foto,
  };
}

export function componiEsame(doc: DocumentoCompleto<"ESAME_DOCUMENTALE">): Composto {
  const d = doc.dati;
  const { numeri, foto } = numeraFoto(doc, d.prescrizioni.flatMap((p) => p.foto));
  const mancanti = d.documenti.filter((x) => x.esito === "assente" || x.esito === "richiedere" || x.esito === "incompleto");
  const aperte = d.prescrizioni.map((p, k) => ({ p, k })).filter(({ p }) => p.stato !== "risolta");
  const prescrizioni: Blocco[] = [];
  if (d.verbale.trim()) prescrizioni.push({ t: "p", testo: `Verbale di riferimento: ${conPunto(d.verbale)}` });
  if (d.prescrizioni.length) {
    prescrizioni.push({ t: "tabella", colonne: ["N.", "Prescrizione", "Stato", "Note", "Foto"], righe: d.prescrizioni.map((p, k) => [String(k + 1), p.testo, ETICHETTE_PRESCRIZIONE[p.stato], p.nota, rifFoto(p.foto, numeri)]), pesi: [0.5, 4, 1.4, 2.4, 1] });
  }
  const sezioni: Sezione[] = [
    sezioneOggetto(1, doc.intestazione),
    { titolo: "2. Impianto", blocchi: [tabellaImpianto(doc)] },
    { titolo: "3. Documenti esaminati", blocchi: oVuoto(d.documenti.length ? [{ t: "tabella", colonne: ["Documento", "Esito", "Estremi", "Note"], righe: d.documenti.map((x) => [x.nome, ETICHETTE_DOCUMENTO[x.esito], x.estremi, x.nota]), pesi: [3, 1.6, 1.8, 2.6] }] : [], "Nessun documento registrato.") },
    { titolo: "4. Prescrizioni dell'ultimo verbale", blocchi: oVuoto(prescrizioni, "Non sono state indicate prescrizioni.") },
    { titolo: "5. Documenti da richiedere", blocchi: oVuoto(mancanti.length ? [{ t: "elenco", voci: mancanti.map((x) => `${x.nome} (${ETICHETTE_DOCUMENTO[x.esito].toLowerCase()})${x.nota.trim() ? `: ${conPunto(x.nota)}` : ""}`) }] : [], "Non ci sono documenti da richiedere.") },
    { titolo: "6. Punti aperti prima della verifica", blocchi: [...oVuoto(aperte.length ? [{ t: "elenco", voci: aperte.map(({ p, k }) => `N. ${k + 1} – ${conPunto(p.testo)} Stato: ${ETICHETTE_PRESCRIZIONE[p.stato].toLowerCase()}.`) }] : [], "Non risultano punti aperti."), ...conclusioni(d.conclusioni)] },
  ];
  return {
    titolo: titoloDocumento(doc),
    sommario: [
      { etichetta: "Documenti esaminati", valore: String(d.documenti.length) },
      { etichetta: "Documenti da richiedere", valore: String(mancanti.length) },
      { etichetta: "Prescrizioni aperte", valore: String(aperte.length) },
      { etichetta: "Fotografie", valore: String(foto.length) },
    ],
    sezioni,
    foto,
  };
}

export function componiVerbale(doc: DocumentoCompleto<"VERBALE">): Composto {
  const d = doc.dati;
  const i = doc.intestazione;
  const { numeri, foto } = numeraFoto(doc, d.avanzamento.flatMap((a) => a.foto));
  const dati = attivitaBase(i, d.sottotipo === "avanzamento" ? "Il sopralluogo di avanzamento lavori si è svolto" : "La riunione si è svolta");
  if (d.luogo.trim()) dati.push({ t: "p", testo: `Luogo: ${conPunto(d.luogo)}` });
  const punti: Blocco[] = d.punti.flatMap((p): Blocco[] => [
    { t: "sotto", testo: p.titolo },
    ...(p.discussione.trim() ? [{ t: "p" as const, testo: p.discussione.trim() }] : []),
    ...(p.decisione.trim() ? [{ t: "p" as const, testo: `Decisione: ${conPunto(p.decisione)}` }] : []),
  ]);
  const sezioni: Sezione[] = [
    { titolo: "1. Dati della riunione", blocchi: [...dati, { t: "p", testo: i.oggetto }] },
    { titolo: "2. Ordine del giorno", blocchi: oVuoto(d.ordineDelGiorno.filter((x) => x.trim()).length ? [{ t: "elenco", voci: d.ordineDelGiorno.filter((x) => x.trim()) }] : [], "Non indicato.") },
    { titolo: "3. Discussione e decisioni", blocchi: oVuoto(punti, "Nessun punto registrato.") },
    { titolo: "4. Attività concordate", blocchi: oVuoto(d.azioni.length ? [{ t: "tabella", colonne: ["N.", "Attività", "Responsabile", "Entro", "Stato"], righe: d.azioni.map((a, k) => [String(k + 1), a.cosa, a.chi, dataIt(a.entro), a.stato === "aperta" ? "Aperta" : "Chiusa"]), pesi: [0.5, 4, 2, 1.3, 1.1] }] : [], "Nessuna attività concordata.") },
  ];
  if (d.avanzamento.length) {
    sezioni.push({ titolo: "5. Avanzamento dei lavori", blocchi: [{ t: "tabella", colonne: ["Lavorazione", "Avanzamento", "Note", "Foto"], righe: d.avanzamento.map((a) => [a.lavorazione, `${Math.max(0, Math.min(100, Math.round(a.percentuale)))}%`, a.nota, rifFoto(a.foto, numeri)]), pesi: [3, 1.2, 3, 1] }] });
  }
  const ultimi: Blocco[] = [];
  if (d.prossimaRiunione.trim()) ultimi.push({ t: "p", testo: `Prossima riunione: ${conPunto(/^\d{4}-\d{2}-\d{2}$/.test(d.prossimaRiunione) ? dataIt(d.prossimaRiunione) : d.prossimaRiunione)}` });
  ultimi.push({ t: "p", testo: i.limiti });
  sezioni.push({ titolo: `${sezioni.length + 1}. Note`, blocchi: ultimi });
  return {
    titolo: titoloDocumento(doc),
    sommario: [
      { etichetta: "Punti discussi", valore: String(d.punti.length) },
      { etichetta: "Attività aperte", valore: String(d.azioni.filter((a) => a.stato === "aperta").length) },
      { etichetta: "Fotografie", valore: String(foto.length) },
    ],
    sezioni,
    foto,
  };
}
