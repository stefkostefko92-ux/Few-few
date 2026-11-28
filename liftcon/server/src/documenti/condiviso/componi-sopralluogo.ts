// Relazione descrittiva di sopralluogo: 7 секции като на сайта + резюме и номерирани снимки.
import type { DocumentoCompleto, EsitoChecklist, Priorita, SezioneChecklist, VoceChecklist } from "./tipi.js";
import type { Blocco, CatalogoDocumenti, Composto, Sezione } from "./composto.js";
import { applicabile, attivitaBase, numeraFoto, righeImpianto, sezioneOggetto, titoloDocumento } from "./composto.js";
import { ETICHETTE_DOCUMENTO, ETICHETTE_ESITO, ETICHETTE_PRIORITA } from "./testi.js";
import { conPunto, elencaIt, rifFoto } from "./formato.js";

const ORDINE: Record<Priorita, number> = { alta: 0, media: 1, bassa: 2 };

interface Voce {
  sez: SezioneChecklist;
  voce: VoceChecklist;
  esito: EsitoChecklist;
}

export function riepilogoPriorita(p: Priorita[]): string {
  if (!p.length) return "0";
  const parti = (["alta", "media", "bassa"] as const).filter((k) => p.includes(k)).map((k) => `${k} ${p.filter((x) => x === k).length}`);
  return `${p.length} (${parti.join(", ")})`;
}

export function componiSopralluogo(doc: DocumentoCompleto<"SOPRALLUOGO">, cat: CatalogoDocumenti): Composto {
  const i = doc.intestazione;
  const d = doc.dati;
  const sezioni = cat.sezioni.filter((s) => applicabile(s.applicabile, i.impianto.tipo));
  const compilate: Voce[] = [];
  for (const sez of sezioni) {
    for (const voce of sez.voci) {
      const esito = d.esiti[voce.id];
      if (esito && applicabile(voce.applicabile, i.impianto.tipo)) compilate.push({ sez, voce, esito });
    }
  }
  const ordinati: string[] = [];
  for (const sez of sezioni) {
    for (const v of compilate.filter((c) => c.sez === sez)) ordinati.push(...v.esito.foto);
    for (const o of d.osservazioni.filter((x) => x.sezioneId === sez.id)) ordinati.push(...o.foto);
  }
  for (const o of d.osservazioni.filter((x) => !sezioni.some((s) => s.id === x.sezioneId))) ordinati.push(...o.foto);
  const { numeri, foto } = numeraFoto(doc, ordinati);

  const anomalie = compilate
    .filter((c) => c.esito.esito === "anomalia" && c.esito.anomalia)
    .sort((a, b) => ORDINE[a.esito.anomalia!.priorita] - ORDINE[b.esito.anomalia!.priorita]);
  const chiarire = compilate.filter((c) => c.esito.esito === "chiarire");
  const nonVerificabili = compilate.filter((c) => c.esito.esito === "nv");

  // 2. Impianto e documenti ricevuti
  const impianto: Blocco[] = [{ t: "tabella", colonne: ["Dato", "Valore"], righe: righeImpianto(i), pesi: [1, 3] }];
  if (d.documentiVisti.length) {
    impianto.push({ t: "sotto", testo: "Documenti ricevuti o visionati" });
    impianto.push({ t: "tabella", colonne: ["Documento", "Esito", "Note"], righe: d.documentiVisti.map((x) => [x.nome, ETICHETTE_DOCUMENTO[x.esito], x.nota]), pesi: [3, 2, 3] });
  } else impianto.push({ t: "p", testo: "Non sono stati messi a disposizione documenti dell'impianto." });

  // 3. Attività svolte
  const viste = sezioni.filter((s) => compilate.some((c) => c.sez === s && c.esito.esito !== "na" && c.esito.esito !== "nv")).map((s) => s.titolo.toLowerCase());
  const attivita = attivitaBase(i, "Il sopralluogo si è svolto");
  if (viste.length) attivita.push({ t: "p", testo: `Sono state osservate le seguenti parti dell'impianto: ${elencaIt(viste)}.` });
  if (nonVerificabili.length) {
    attivita.push({ t: "sotto", testo: "Parti non verificabili" });
    attivita.push({ t: "elenco", voci: nonVerificabili.map((c) => `${c.voce.testo} (${c.sez.ubicazione})${c.esito.nota.trim() ? `: ${c.esito.nota.trim()}` : ""}`) });
  }

  // 4. Osservazioni e fotografie — таблица по секция + свободните наблюдения
  const osservazioni: Blocco[] = [];
  for (const sez of sezioni) {
    const righe = compilate.filter((c) => c.sez === sez && c.esito.esito !== "na");
    const libere = d.osservazioni.filter((o) => o.sezioneId === sez.id && o.testo.trim());
    if (!righe.length && !libere.length) continue;
    osservazioni.push({ t: "sotto", testo: sez.titolo });
    if (righe.length) {
      osservazioni.push({
        t: "tabella",
        colonne: ["Elemento", "Esito", "Note", "Foto"],
        righe: righe.map((c) => [c.voce.testo, ETICHETTE_ESITO[c.esito.esito], c.esito.nota, rifFoto(c.esito.foto, numeri)]),
        pesi: [3, 2, 3, 1],
      });
    }
    for (const o of libere) osservazioni.push({ t: "p", testo: [conPunto(o.testo), rifFoto(o.foto, numeri) && `(${rifFoto(o.foto, numeri)})`].filter(Boolean).join(" ") });
  }
  const altre = d.osservazioni.filter((o) => !sezioni.some((s) => s.id === o.sezioneId) && o.testo.trim());
  if (altre.length) {
    osservazioni.push({ t: "sotto", testo: "Altre osservazioni" });
    for (const o of altre) osservazioni.push({ t: "p", testo: [conPunto(o.testo), rifFoto(o.foto, numeri) && `(${rifFoto(o.foto, numeri)})`].filter(Boolean).join(" ") });
  }
  if (!osservazioni.length) osservazioni.push({ t: "p", testo: "Nessuna osservazione registrata." });

  // 5. Anomalie osservate
  const blocchiAnomalie: Blocco[] = anomalie.length
    ? [
        {
          t: "tabella",
          colonne: ["N.", "Anomalia osservata", "Ubicazione", "Priorità", "Foto"],
          righe: anomalie.map((c, k) => [String(k + 1), [conPunto(c.esito.anomalia!.testo), c.esito.nota.trim()].filter(Boolean).join(" "), c.sez.ubicazione, ETICHETTE_PRIORITA[c.esito.anomalia!.priorita], rifFoto(c.esito.foto, numeri)]),
          pesi: [0.5, 4, 1.6, 1, 1],
        },
      ]
    : [{ t: "p", testo: "Nelle parti esaminate non sono state osservate anomalie." }];

  // 6. Punti da chiarire
  const domande = chiarire.map((c) => `${c.sez.ubicazione} – ${c.voce.testo}: ${conPunto(c.esito.domanda?.trim() || c.esito.nota.trim() || "da chiarire")}`);
  const blocchiChiarire: Blocco[] = domande.length ? [{ t: "elenco", voci: domande }] : [{ t: "p", testo: "Non ci sono punti da chiarire." }];

  // 7. Raccomandazioni — без повторения, по най-високия приоритет
  const racc = new Map<string, Priorita>();
  for (const c of anomalie) {
    const r = c.esito.anomalia!.raccomandazione.trim();
    if (r && (!racc.has(r) || ORDINE[c.esito.anomalia!.priorita] < ORDINE[racc.get(r)!])) racc.set(r, c.esito.anomalia!.priorita);
  }
  const voci = [...racc.entries()].sort((a, b) => ORDINE[a[1]] - ORDINE[b[1]]).map(([r, p]) => `${conPunto(r)} Priorità ${ETICHETTE_PRIORITA[p].toLowerCase()}.`);
  const blocchiRacc: Blocco[] = voci.length ? [{ t: "elenco", voci }] : [{ t: "p", testo: "Non ci sono raccomandazioni legate ad anomalie osservate." }];
  blocchiRacc.push({ t: "p", testo: "Le priorità sono indicative e servono a ordinare le attività; la valutazione tecnica degli interventi spetta al manutentore e, dove previsto, ai soggetti abilitati." });
  if (d.conclusioni.trim()) blocchiRacc.push({ t: "sotto", testo: "Conclusioni" }, { t: "p", testo: d.conclusioni.trim() });

  const sezioniOut: Sezione[] = [
    sezioneOggetto(1, i),
    { titolo: "2. Impianto e documenti ricevuti", blocchi: impianto },
    { titolo: "3. Attività svolte", blocchi: attivita },
    { titolo: "4. Osservazioni e fotografie", blocchi: osservazioni },
    { titolo: "5. Anomalie osservate", blocchi: blocchiAnomalie },
    { titolo: "6. Punti da chiarire", blocchi: blocchiChiarire },
    { titolo: "7. Raccomandazioni", blocchi: blocchiRacc },
  ];
  return {
    titolo: titoloDocumento(doc),
    sommario: [
      { etichetta: "Anomalie osservate", valore: riepilogoPriorita(anomalie.map((c) => c.esito.anomalia!.priorita)) },
      { etichetta: "Punti da chiarire", valore: String(chiarire.length) },
      { etichetta: "Parti non verificabili", valore: String(nonVerificabili.length) },
      { etichetta: "Fotografie", valore: String(foto.length) },
    ],
    sezioni: sezioniOut,
    foto,
  };
}
