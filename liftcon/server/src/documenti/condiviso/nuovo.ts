// Празен документ по вид — със стандартните предмет и граници. Използва се и офлайн (id идва от устройството).
import type { DatiPerTipo, DocumentoCompleto, TipoDocumento } from "./tipi.js";
import { LIMITI, NOMI_TIPO, OGGETTO } from "./testi.js";

export function datiVuoti<T extends TipoDocumento>(tipo: T): DatiPerTipo[T] {
  const v: DatiPerTipo = {
    SOPRALLUOGO: { esiti: {}, osservazioni: [], documentiVisti: [], conclusioni: "" },
    CONTROLLO_QUALITA: { riferimento: "", ditta: "", voci: [], conclusioni: "" },
    ESAME_DOCUMENTALE: { documenti: [], verbale: "", prescrizioni: [], conclusioni: "" },
    VERBALE: { sottotipo: "riunione", luogo: "", ordineDelGiorno: [], punti: [], azioni: [], avanzamento: [], prossimaRiunione: "" },
  };
  return v[tipo];
}

export function nuovoDocumento<T extends TipoDocumento>(tipo: T, id: string): DocumentoCompleto<T> {
  return {
    id,
    tipo,
    stato: "BOZZA",
    numero: null,
    revisione: 0,
    versione: 0,
    intestazione: {
      titolo: NOMI_TIPO[tipo],
      committente: { nome: "", qualita: "", condominio: "", email: "", telefono: "" },
      impianto: { indirizzo: "", comune: "", provincia: "", matricola: "", tipo: "", costruttore: "", manutentore: "", anno: "", fermate: "", portata: "", note: "" },
      data: "",
      oraInizio: "",
      oraFine: "",
      presenti: [],
      oggetto: OGGETTO[tipo],
      limiti: LIMITI[tipo],
    },
    dati: datiVuoti(tipo),
    foto: [],
    autore: { nome: "", qualifica: "" },
    emessoIl: null,
  };
}
