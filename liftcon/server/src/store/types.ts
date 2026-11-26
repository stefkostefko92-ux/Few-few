// Слоят за данните: интерфейс, който Prisma изпълнява в продукция, а паметта — в тестовете.
// Типовете са на домейна (не на Prisma), за да не изтича ORM в маршрутите.

export const RUOLI = ["MASTER", "ADMIN", "DIREZIONE", "RESPONSABILE", "TECNICO", "OPERATORE", "CLIENTE"] as const;
export type Ruolo = (typeof RUOLI)[number];

export const STATI_RICHIESTA = ["NUOVA", "IN_LAVORAZIONE", "PROPOSTA_INVIATA", "INCARICO", "CHIUSA"] as const;
export type StatoRichiesta = (typeof STATI_RICHIESTA)[number];

export interface Utente {
  id: string;
  email: string;
  nome: string;
  passwordHash: string;
  ruolo: Ruolo;
  attivo: boolean;
  cambiarePassword: boolean;
  totpSecretEnc: string | null;
  totpAttivaDal: Date | null;
  totpUltimoPasso: number | null;
  codiciRecupero: string[];
  tentativiFalliti: number;
  bloccatoFino: Date | null;
  ultimoAccesso: Date | null;
  creatoIl: Date;
}

export type NuovoUtente = Pick<Utente, "email" | "nome" | "passwordHash" | "ruolo"> & { cambiarePassword: boolean };

export interface Sessione {
  id: string;
  utenteId: string;
  stato: "PARZIALE" | "COMPLETA";
  csrf: string;
  creataIl: Date;
  ultimoUso: Date;
  scadeIl: Date;
}

export interface Richiesta {
  id: string;
  nome: string;
  email: string;
  telefono: string;
  ruolo: string;
  comune: string;
  servizio: string;
  messaggio: string;
  stato: StatoRichiesta;
  note: string;
  creataIl: Date;
  aggiornataIl: Date;
  eliminareDopo: Date | null;
}

export type NuovaRichiesta = Pick<Richiesta, "nome" | "email" | "telefono" | "ruolo" | "comune" | "servizio" | "messaggio"> & {
  eliminareDopo: Date;
};

export interface FiltroRichieste {
  stato?: StatoRichiesta | undefined;
  testo?: string | undefined;
  limite: number;
  offset: number;
}

export interface Contenuto {
  id: string;
  tipo: string;
  dati: unknown;
  aggiornatoIl: Date;
  autoreId: string | null;
}

export interface Pubblicazione {
  id: string;
  iniziataIl: Date;
  finitaIl: Date | null;
  esito: "IN_CORSO" | "OK" | "ERRORE";
  errore: string | null;
  versione: string | null;
  autoreId: string | null;
}

export interface Evento {
  id: string;
  creatoIl: Date;
  utenteId: string | null;
  azione: string;
  oggetto: string | null;
  dettagli: Record<string, unknown> | null;
  ipHmac: string | null;
}

export interface Store {
  utenti: {
    conta(): Promise<number>;
    tutti(): Promise<Utente[]>;
    perId(id: string): Promise<Utente | null>;
    perEmail(email: string): Promise<Utente | null>;
    crea(u: NuovoUtente): Promise<Utente>;
    aggiorna(id: string, patch: Partial<Omit<Utente, "id" | "creatoIl">>): Promise<Utente>;
    /** Атомарно +1 на грешните опити; при `max` — заключване до `fino` и нулиране. Връща дали е заключен. */
    registraFallimento(id: string, max: number, fino: Date): Promise<boolean>;
    /** Приема TOTP стъпката само ако е по-голяма от последната (атомарно — повторен код не минава). */
    consumaPassoTotp(id: string, passo: number): Promise<boolean>;
    /** Маха резервния код (HMAC) атомарно; false, ако вече го няма. */
    consumaCodice(id: string, hmac: string): Promise<boolean>;
  };
  sessioni: {
    crea(s: Omit<Sessione, "id" | "creataIl" | "ultimoUso">): Promise<Sessione>;
    perId(id: string): Promise<Sessione | null>;
    aggiorna(id: string, patch: Partial<Pick<Sessione, "stato" | "ultimoUso" | "csrf">>): Promise<void>;
    elimina(id: string): Promise<void>;
    eliminaDiUtente(utenteId: string): Promise<void>;
    eliminaScadute(ora: Date): Promise<number>;
  };
  richieste: {
    crea(r: NuovaRichiesta): Promise<Richiesta>;
    perId(id: string): Promise<Richiesta | null>;
    cerca(f: FiltroRichieste): Promise<{ righe: Richiesta[]; totale: number }>;
    contaPerStato(): Promise<Record<StatoRichiesta, number>>;
    aggiorna(id: string, patch: Partial<Pick<Richiesta, "stato" | "note" | "eliminareDopo">>): Promise<Richiesta>;
    elimina(id: string): Promise<void>;
    eliminaScadute(ora: Date): Promise<number>;
  };
  contenuti: {
    tutti(): Promise<Contenuto[]>;
    perId(id: string): Promise<Contenuto | null>;
    salva(id: string, tipo: string, dati: unknown, autoreId: string | null): Promise<Contenuto>;
    elimina(id: string): Promise<void>;
    revisioni(id: string, limite: number): Promise<Array<{ id: string; creataIl: Date; autoreId: string | null }>>;
  };
  pubblicazioni: {
    crea(autoreId: string | null): Promise<Pubblicazione>;
    chiudi(id: string, esito: "OK" | "ERRORE", dati: { errore?: string; versione?: string }): Promise<void>;
    ultime(limite: number): Promise<Pubblicazione[]>;
  };
  impostazioni: {
    leggi(chiave: string): Promise<{ valore: unknown; aggiornatoIl: Date } | null>;
    salva(chiave: string, valore: unknown, autoreId: string | null): Promise<void>;
  };
  eventi: {
    registra(e: Omit<Evento, "id" | "creatoIl">): Promise<void>;
    ultimi(limite: number, offset: number): Promise<Evento[]>;
    eliminaPrimaDi(data: Date): Promise<number>;
  };
}
