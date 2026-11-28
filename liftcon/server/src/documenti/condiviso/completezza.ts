// Проверка за пълнота преди издаване (спецификация D12): списък с липсите на италиански, за човека.
import type { DocumentoCompleto } from "./tipi.js";

export function completezza(doc: DocumentoCompleto): string[] {
  const p: string[] = [];
  const i = doc.intestazione;
  if (!i.committente.nome.trim()) p.push("Manca il nome del committente.");
  if (!i.impianto.indirizzo.trim() || !i.impianto.comune.trim()) p.push("Mancano indirizzo e comune dell'impianto.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.data)) p.push("Manca la data.");
  if (!i.oggetto.trim()) p.push("Manca l'oggetto dell'incarico.");
  if (!i.limiti.trim()) p.push("Mancano i limiti dell'incarico.");
  [...doc.foto].sort((a, b) => a.ordine - b.ordine).forEach((f, k) => {
    if (!f.didascalia.trim()) p.push(`La fotografia n. ${k + 1} non ha una didascalia.`);
  });
  switch (doc.tipo) {
    case "SOPRALLUOGO": {
      const d = (doc as DocumentoCompleto<"SOPRALLUOGO">).dati;
      if (!i.impianto.tipo) p.push("Manca il tipo di impianto.");
      const esiti = Object.entries(d.esiti);
      if (!esiti.length && !d.osservazioni.length) p.push("Non è stata registrata nessuna osservazione.");
      for (const [id, e] of esiti) {
        if (e.esito === "anomalia" && !e.anomalia?.testo.trim()) p.push(`Un'anomalia (${id}) non ha la descrizione.`);
        if (e.esito === "anomalia" && !e.anomalia?.raccomandazione.trim()) p.push(`Un'anomalia (${id}) non ha la raccomandazione.`);
        if (e.esito === "chiarire" && !e.domanda?.trim() && !e.nota.trim()) p.push(`Un punto da chiarire (${id}) non ha il testo.`);
      }
      break;
    }
    case "CONTROLLO_QUALITA": {
      const d = (doc as DocumentoCompleto<"CONTROLLO_QUALITA">).dati;
      if (!d.voci.length) p.push("Non è stata registrata nessuna lavorazione.");
      d.voci.forEach((v, k) => {
        if (!v.richiesto.trim()) p.push(`La lavorazione n. ${k + 1} non ha la descrizione.`);
      });
      break;
    }
    case "ESAME_DOCUMENTALE": {
      const d = (doc as DocumentoCompleto<"ESAME_DOCUMENTALE">).dati;
      if (!d.documenti.length) p.push("Non è stato registrato nessun documento.");
      break;
    }
    case "VERBALE": {
      const d = (doc as DocumentoCompleto<"VERBALE">).dati;
      if (!d.punti.length && !d.ordineDelGiorno.some((x) => x.trim())) p.push("Mancano l'ordine del giorno e i punti discussi.");
      d.azioni.forEach((a, k) => {
        if (!a.cosa.trim() || !a.chi.trim()) p.push(`L'attività n. ${k + 1} non indica che cosa e chi.`);
      });
      break;
    }
  }
  return p;
}
