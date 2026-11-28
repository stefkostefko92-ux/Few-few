// Общите части на сглобяването: типовете на резултата и помощниците, които ползват всички видове.
import type { DocumentoCompleto, Intestazione, SezioneChecklist, TipoImpianto, VoceDocumentale } from "./tipi.js";
import { NOMI_IMPIANTO, NOMI_TIPO } from "./testi.js";
import { dataIt, elencaIt } from "./formato.js";

export type Blocco =
  | { t: "p"; testo: string }
  | { t: "sotto"; testo: string }
  | { t: "elenco"; voci: string[] }
  | { t: "tabella"; colonne: string[]; righe: string[][]; pesi?: number[] };

export interface Sezione {
  titolo: string;
  blocchi: Blocco[];
}

export interface Composto {
  titolo: string;
  sommario: Array<{ etichetta: string; valore: string }>;
  sezioni: Sezione[];
  foto: Array<{ id: string; n: number; didascalia: string; ubicazione: string }>;
}

export interface CatalogoDocumenti {
  sezioni: SezioneChecklist[];
  documenti: VoceDocumentale[];
}

export const titoloDocumento = (doc: DocumentoCompleto): string => doc.intestazione.titolo.trim() || NOMI_TIPO[doc.tipo];

export const applicabile = (a: TipoImpianto[] | undefined, tipo: TipoImpianto | ""): boolean => !a || !tipo || a.includes(tipo);

/** Номерира снимките: първо по реда на `ordinati` (id-та от точките), после свободните по `ordine`. */
export function numeraFoto(doc: DocumentoCompleto, ordinati: string[]): { numeri: Map<string, number>; foto: Composto["foto"] } {
  const per = new Map(doc.foto.map((f) => [f.id, f]));
  const sequenza: string[] = [];
  for (const id of ordinati) if (per.has(id) && !sequenza.includes(id)) sequenza.push(id);
  for (const f of [...doc.foto].sort((a, b) => a.ordine - b.ordine)) if (!sequenza.includes(f.id)) sequenza.push(f.id);
  const numeri = new Map(sequenza.map((id, i) => [id, i + 1]));
  const foto = sequenza.map((id) => {
    const f = per.get(id)!;
    return { id, n: numeri.get(id)!, didascalia: f.didascalia, ubicazione: f.ubicazione };
  });
  return { numeri, foto };
}

export function sezioneOggetto(n: number, i: Intestazione): Sezione {
  return { titolo: `${n}. Oggetto e limiti dell'incarico`, blocchi: [{ t: "p", testo: i.oggetto }, { t: "p", testo: i.limiti }] };
}

export function righeImpianto(i: Intestazione): string[][] {
  const im = i.impianto;
  const luogo = [im.indirizzo, [im.comune, im.provincia ? `(${im.provincia})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const righe: Array<[string, string]> = [
    ["Indirizzo", luogo],
    ["Tipo di impianto", im.tipo ? NOMI_IMPIANTO[im.tipo] : ""],
    ["Numero di matricola", im.matricola],
    ["Costruttore", im.costruttore],
    ["Manutentore", im.manutentore],
    ["Anno di installazione", im.anno],
    ["Fermate", im.fermate],
    ["Portata", im.portata],
    ["Note", im.note],
  ];
  return righe.filter(([, v]) => v.trim()).map(([k, v]) => [k, v]);
}

/** „Il sopralluogo si è svolto il … dalle … alle … presso …“ + присъстващите. */
export function attivitaBase(i: Intestazione, cosa: string): Blocco[] {
  const quando = i.data ? ` il ${dataIt(i.data)}` : "";
  const ore = i.oraInizio && i.oraFine ? `, dalle ${i.oraInizio} alle ${i.oraFine}` : i.oraInizio ? `, dalle ${i.oraInizio}` : "";
  const dove = [i.impianto.indirizzo, i.impianto.comune].filter(Boolean).join(", ");
  const blocchi: Blocco[] = [{ t: "p", testo: `${cosa}${quando}${ore}${dove ? ` presso ${dove}` : ""}.` }];
  const presenti = i.presenti.filter((p) => p.nome.trim()).map((p) => (p.ruolo.trim() ? `${p.nome} (${p.ruolo})` : p.nome));
  if (presenti.length) blocchi.push({ t: "p", testo: `Erano presenti: ${elencaIt(presenti)}.` });
  return blocchi;
}
