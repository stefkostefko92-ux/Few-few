/**
 * Limite ai tentativi di accesso falliti.
 *
 * Senza freno, il modulo di login accetta password a raffica: un elenco di
 * password comuni contro gli indirizzi aziendali (che si indovinano da soli:
 * nome.cognome@azienda) è il modo più economico per entrare in un gestionale.
 * Bcrypt a 12 round rallenta l'attaccante, ma rallenta anche il server — un
 * attacco continuo diventa anche un blocco del servizio.
 *
 * COSA COPRE E COSA NO. Il conteggio vive in memoria di processo: si azzera al
 * riavvio e non è condiviso fra più istanze. Per questo deploy (un container
 * applicativo, `docker-compose.yml`) è la difesa giusta al costo giusto. Se un
 * giorno le istanze diventano due, il contatore va spostato su Redis o su una
 * tabella — è scritto qui perché il limite si veda, invece di scoprirlo dopo.
 *
 * Il blocco è sulla COPPIA identificativa (indirizzo + IP): bloccare il solo
 * indirizzo permetterebbe a un estraneo di chiudere fuori un collega
 * sbagliando la sua password di proposito.
 */

export type EsitoLimite = {
  consentito: boolean;
  /** Tentativi ancora disponibili prima del blocco. */
  rimanenti: number;
  /** Secondi da attendere quando il blocco è attivo. */
  attesaSecondi: number;
};

export const MAX_TENTATIVI = 8;
export const FINESTRA_MS = 15 * 60 * 1000; // 15 minuti

type Voce = { tentativi: number; primoTentativo: number; bloccatoFino: number };

/** Registro dei tentativi. Esposto solo per i test. */
export class RegistroTentativi {
  private readonly voci = new Map<string, Voce>();

  constructor(
    private readonly max = MAX_TENTATIVI,
    private readonly finestraMs = FINESTRA_MS,
  ) {}

  /** Verifica senza consumare tentativi. */
  controlla(chiave: string, adesso = Date.now()): EsitoLimite {
    const voce = this.voci.get(chiave);
    if (!voce) return { consentito: true, rimanenti: this.max, attesaSecondi: 0 };

    if (voce.bloccatoFino > adesso) {
      return {
        consentito: false,
        rimanenti: 0,
        attesaSecondi: Math.ceil((voce.bloccatoFino - adesso) / 1000),
      };
    }
    if (adesso - voce.primoTentativo > this.finestraMs) {
      this.voci.delete(chiave);
      return { consentito: true, rimanenti: this.max, attesaSecondi: 0 };
    }
    return {
      consentito: true,
      rimanenti: Math.max(0, this.max - voce.tentativi),
      attesaSecondi: 0,
    };
  }

  /** Registra un tentativo fallito. */
  fallito(chiave: string, adesso = Date.now()): EsitoLimite {
    const voce = this.voci.get(chiave);
    if (!voce || adesso - voce.primoTentativo > this.finestraMs) {
      this.voci.set(chiave, {
        tentativi: 1,
        primoTentativo: adesso,
        bloccatoFino: 0,
      });
      return { consentito: true, rimanenti: this.max - 1, attesaSecondi: 0 };
    }

    voce.tentativi += 1;
    if (voce.tentativi >= this.max) {
      voce.bloccatoFino = adesso + this.finestraMs;
      return {
        consentito: false,
        rimanenti: 0,
        attesaSecondi: Math.ceil(this.finestraMs / 1000),
      };
    }
    return {
      consentito: true,
      rimanenti: this.max - voce.tentativi,
      attesaSecondi: 0,
    };
  }

  /** L'accesso è riuscito: si riparte da zero. */
  riuscito(chiave: string): void {
    this.voci.delete(chiave);
  }

  /** Elimina le voci scadute — la mappa non deve crescere all'infinito. */
  pulisci(adesso = Date.now()): void {
    for (const [chiave, voce] of this.voci) {
      const scaduta =
        voce.bloccatoFino < adesso && adesso - voce.primoTentativo > this.finestraMs;
      if (scaduta) this.voci.delete(chiave);
    }
  }

  get dimensione(): number {
    return this.voci.size;
  }
}

const globalPerLimite = globalThis as unknown as {
  registroAccessi?: RegistroTentativi;
};

export const registroAccessi =
  globalPerLimite.registroAccessi ?? new RegistroTentativi();

if (process.env.NODE_ENV !== 'production') {
  globalPerLimite.registroAccessi = registroAccessi;
}

/**
 * Chiave del limite: indirizzo + IP del chiamante.
 *
 * L'IP arriva dal reverse proxy (`X-Forwarded-For`, primo valore). È
 * falsificabile da chi parla direttamente con l'applicazione, ma il gestionale
 * ascolta solo su localhost dietro il proxy — e l'indirizzo e-mail nella chiave
 * mantiene comunque un freno anche se l'IP cambia a ogni tentativo.
 */
export function chiaveAccesso(email: string, request: Request): string {
  const inoltrato = request.headers.get('x-forwarded-for');
  const ip = (inoltrato?.split(',')[0] ?? '').trim() || 'sconosciuto';
  return `${email.toLowerCase().trim()}|${ip}`;
}
