// Слоят за данните на документите (relazioni): интерфейс, изпълнен от Prisma (продукция) и паметта (тестове).
import type { TipoDocumento } from "../documenti/condiviso/tipi.js";

export interface DocumentoRiga {
  id: string;
  tipo: TipoDocumento;
  stato: "BOZZA" | "EMESSO";
  numero: string | null;
  revisione: number;
  revisioneDi: string | null;
  versione: number;
  titolo: string;
  intestazione: unknown;
  dati: unknown;
  richiestaId: string | null;
  autoreId: string | null;
  autoreNome: string;
  autoreQualifica: string;
  creatoIl: Date;
  aggiornatoIl: Date;
  emessoIl: Date | null;
  pdfSha256: string | null;
}

export type DocumentoSintesi = Omit<DocumentoRiga, "intestazione" | "dati">;

export interface FotoRiga {
  id: string;
  documentoId: string;
  ordine: number;
  didascalia: string;
  ubicazione: string;
  riferimento: string;
  larghezza: number;
  altezza: number;
  byte: number;
  sha256: string;
  creataIl: Date;
}

export interface FraseRiga {
  id: string;
  voceId: string;
  tipo: "anomalia" | "chiarimento";
  testo: string;
  raccomandazione: string;
  priorita: string;
  attiva: boolean;
  autoreId: string | null;
  creataIl: Date;
  aggiornataIl: Date;
}

export type PatchFoto = Partial<Pick<FotoRiga, "ordine" | "didascalia" | "ubicazione" | "riferimento">>;

export interface StoreDocumenti {
  documenti: {
    elenco(f: { testo?: string | undefined; limite: number; offset: number }): Promise<{ righe: DocumentoSintesi[]; totale: number }>;
    perId(id: string): Promise<DocumentoRiga | null>;
    crea(r: Omit<DocumentoRiga, "creatoIl" | "aggiornatoIl">): Promise<DocumentoRiga>;
    /** Атомарно: записва само чернова с `versione === attesa` (и я увеличава); иначе null. */
    aggiorna(id: string, attesa: number, patch: Pick<DocumentoRiga, "titolo" | "intestazione" | "dati">): Promise<DocumentoRiga | null>;
    /** Атомарно: чернова с `versione === attesa` → EMESSO с номер; иначе null. */
    emetti(id: string, attesa: number, e: { numero: string; emessoIl: Date; pdfSha256: string; autoreNome: string; autoreQualifica: string }): Promise<DocumentoRiga | null>;
    elimina(id: string): Promise<void>;
    /** Следващият номер за префикс и година — атомарно (паралелните издавания не получават един и същ). */
    prossimoNumero(prefisso: string, anno: number): Promise<number>;
  };
  foto: {
    perDocumento(documentoId: string): Promise<FotoRiga[]>;
    perId(id: string): Promise<FotoRiga | null>;
    crea(r: Omit<FotoRiga, "creataIl">): Promise<FotoRiga>;
    aggiorna(id: string, patch: PatchFoto): Promise<void>;
    elimina(id: string): Promise<void>;
  };
  frasi: {
    tutte(): Promise<FraseRiga[]>;
    perId(id: string): Promise<FraseRiga | null>;
    crea(r: Omit<FraseRiga, "id" | "creataIl" | "aggiornataIl">): Promise<FraseRiga>;
    aggiorna(id: string, patch: Partial<Pick<FraseRiga, "testo" | "raccomandazione" | "priorita" | "attiva">>): Promise<void>;
  };
}
