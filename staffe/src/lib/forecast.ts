/**
 * Previsioni di consumo e riordino — funzioni PURE, senza database, senza rete
 * e senza modelli generativi.
 *
 * Perché deterministico e non un LLM: i dati di magazzino del cliente non
 * escono dal server (GDPR), il risultato deve essere lo stesso a ogni
 * esecuzione e ogni numero deve essere spiegabile all'operatore che firma
 * l'ordine d'acquisto. Un modello che «inventa» una quantità di riordino è
 * peggio di nessuna previsione: fa comprare merce vera con un numero finto.
 *
 * Regola non negoziabile di questo file: **se i dati non bastano si dichiara
 * `dati_insufficienti`, non si restituisce un numero**. Tutte le funzioni
 * ricevono array e numeri e restituiscono numeri e oggetti: si testano senza
 * database (vedi `__tests__/forecast.test.ts`).
 *
 * Metodo (dichiarato anche a schermo, in `/report/previsioni`):
 *  · serie giornaliera dei consumi (i giorni senza movimento valgono 0);
 *  · livellamento esponenziale con tendenza (Holt) da 14 giorni di finestra;
 *  · con almeno 4 cicli settimanali (28 giorni) si aggiunge la stagionalità
 *    additiva a periodo 7 (Holt-Winters);
 *  · punto di riordino = consumo × lead time + scorta di sicurezza
 *    (z × σ × √lead time).
 */

// ─────────────────────────── Tipi e costanti ───────────────────────────

/** Movimento in uscita ridotto ai soli campi che servono al calcolo. */
export type UscitaMovimento = {
  /** Data del movimento (`StockMovement.createdAt`). */
  data: Date | string;
  /** Quantità uscita, intera e positiva. */
  qty: number;
};

export type Confidenza = 'alta' | 'media' | 'bassa' | 'nulla';

export type Previsione =
  | {
      stato: 'ok';
      metodo: 'holt' | 'holt_winters';
      /** Consumo giornaliero atteso nel prossimo orizzonte, mai negativo. */
      consumoGiornaliero: number;
      /** Variazione giornaliera stimata del livello (positiva = domanda in crescita). */
      tendenzaGiornaliera: number;
      /** Deviazione standard campionaria del consumo giornaliero osservato. */
      deviazioneStandard: number;
      confidenza: Confidenza;
      giorniFinestra: number;
      giorniConMovimento: number;
    }
  | {
      stato: 'nessun_consumo';
      giorniFinestra: number;
      motivo: string;
    }
  | {
      stato: 'dati_insufficienti';
      giorniFinestra: number;
      giorniConMovimento: number;
      motivo: string;
      /** Fatto osservato (media grezza), NON una previsione: è dichiarato tale. */
      consumoOsservato: number;
    };

/** Finestra minima per stimare una tendenza. Sotto questa soglia non si prevede. */
export const GIORNI_MINIMI_PREVISIONE = 14;
/** Periodo stagionale: la domanda di magazzino segue la settimana lavorativa. */
export const PERIODO_STAGIONALE = 7;
/** Cicli settimanali minimi per stimare la stagionalità (4 × 7 = 28 giorni). */
export const CICLI_MINIMI_STAGIONALITA = 4;
/** Giorni con almeno un movimento sotto i quali la serie è rumore, non domanda. */
export const GIORNI_CON_MOVIMENTO_MINIMI = 3;

/** Coefficienti di livellamento (valori classici, conservativi). */
export const ALFA_PREDEFINITO = 0.3; // livello
export const BETA_PREDEFINITO = 0.1; // tendenza
export const GAMMA_PREDEFINITO = 0.3; // stagionalità

/**
 * Fattore z per il livello di servizio della scorta di sicurezza.
 * 95% è il valore predefinito: copre il 95% delle variazioni di domanda
 * durante il lead time senza immobilizzare capitale come farebbe il 99%.
 */
export const Z_LIVELLO_SERVIZIO = {
  90: 1.2816,
  95: 1.6449,
  97.5: 1.96,
  99: 2.3263,
} as const;

export type LivelloServizio = keyof typeof Z_LIVELLO_SERVIZIO;

const GIORNO_MS = 86_400_000;

// ─────────────────────────── Utilità numeriche ───────────────────────────

/** Mezzanotte del giorno civile, in millisecondi UTC: evita i salti d'ora legale. */
function inizioGiorno(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function comeData(v: Date | string): Date | null {
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Arrotondamento a `decimali` cifre, per stabilizzare i confronti e la resa. */
export function arrotonda(valore: number, decimali = 3): number {
  if (!Number.isFinite(valore)) return 0;
  const f = 10 ** decimali;
  return Math.round(valore * f) / f;
}

export function media(serie: readonly number[]): number {
  if (serie.length === 0) return 0;
  return serie.reduce((a, b) => a + b, 0) / serie.length;
}

/**
 * Deviazione standard **campionaria** (n − 1): la serie è un campione della
 * domanda, non la popolazione. Con meno di due punti non è definita → 0.
 */
export function deviazioneStandard(serie: readonly number[]): number {
  if (serie.length < 2) return 0;
  const m = media(serie);
  const somma = serie.reduce((acc, v) => acc + (v - m) ** 2, 0);
  return Math.sqrt(somma / (serie.length - 1));
}

/** Coefficiente di variazione (σ/μ). `null` quando la media è 0: non è definito. */
export function coefficienteDiVariazione(serie: readonly number[]): number | null {
  const m = media(serie);
  if (m <= 0) return null;
  return deviazioneStandard(serie) / m;
}

// ─────────────────────────── Serie e consumo medio ───────────────────────────

/**
 * Serie dei consumi giornalieri, dal più vecchio al più recente, lunga `giorni`.
 * I giorni senza movimento valgono 0 — ometterli gonfierebbe la media: un
 * prodotto venduto una volta al mese non consuma «10 pezzi al giorno».
 */
export function serieGiornaliera(
  movimenti: readonly UscitaMovimento[],
  giorni: number,
  riferimento: Date = new Date(),
): number[] {
  const n = Math.max(0, Math.floor(giorni));
  const serie = new Array<number>(n).fill(0);
  if (n === 0) return serie;

  const fine = inizioGiorno(riferimento);
  for (const m of movimenti) {
    const q = Number(m.qty);
    if (!Number.isFinite(q) || q <= 0) continue;
    const d = comeData(m.data);
    if (!d) continue;
    const distanza = Math.round((fine - inizioGiorno(d)) / GIORNO_MS);
    if (distanza < 0 || distanza >= n) continue;
    serie[n - 1 - distanza] += q;
  }
  return serie;
}

/**
 * Consumo medio giornaliero = quantità uscita nella finestra ÷ giorni della
 * finestra (denominatore = tutti i giorni, non solo quelli con movimento).
 * Finestra non positiva → 0: non si divide per zero.
 */
export function consumoMedioGiornaliero(
  movimenti: readonly UscitaMovimento[],
  giorni: number,
  riferimento: Date = new Date(),
): number {
  const n = Math.floor(giorni);
  if (n <= 0) return 0;
  const serie = serieGiornaliera(movimenti, n, riferimento);
  return arrotonda(serie.reduce((a, b) => a + b, 0) / n, 4);
}

// ─────────────────────────── Livellamento esponenziale ───────────────────────────

export type EsitoLivellamento = {
  livello: number;
  tendenza: number;
  /** Previsione a `k` giorni avanti, mai negativa. */
  previsione: (k: number) => number;
};

/**
 * Holt — livellamento esponenziale con tendenza. Il livello segue il valore
 * corrente, la tendenza segue la variazione del livello.
 */
export function livellamentoConTendenza(
  serie: readonly number[],
  alfa: number = ALFA_PREDEFINITO,
  beta: number = BETA_PREDEFINITO,
): EsitoLivellamento {
  if (serie.length === 0) {
    return { livello: 0, tendenza: 0, previsione: () => 0 };
  }
  let livello = serie[0];
  let tendenza = serie.length > 1 ? serie[1] - serie[0] : 0;
  for (let t = 1; t < serie.length; t += 1) {
    const nuovoLivello = alfa * serie[t] + (1 - alfa) * (livello + tendenza);
    tendenza = beta * (nuovoLivello - livello) + (1 - beta) * tendenza;
    livello = nuovoLivello;
  }
  return {
    livello,
    tendenza,
    previsione: (k: number) => Math.max(0, livello + k * tendenza),
  };
}

export type EsitoStagionale = EsitoLivellamento & {
  /** Componenti stagionali additive, una per giorno del periodo. */
  stagionalita: number[];
};

/**
 * Holt-Winters additivo a periodo `periodo`. Additivo e non moltiplicativo
 * perché la domanda di ricambi ha giorni a zero: un modello moltiplicativo
 * dividerebbe per zero.
 */
export function livellamentoStagionale(
  serie: readonly number[],
  periodo: number = PERIODO_STAGIONALE,
  alfa: number = ALFA_PREDEFINITO,
  beta: number = BETA_PREDEFINITO,
  gamma: number = GAMMA_PREDEFINITO,
): EsitoStagionale {
  const m = Math.max(1, Math.floor(periodo));
  if (serie.length < 2 * m) {
    const semplice = livellamentoConTendenza(serie, alfa, beta);
    return { ...semplice, stagionalita: new Array<number>(m).fill(0) };
  }

  const primoCiclo = serie.slice(0, m);
  const secondoCiclo = serie.slice(m, 2 * m);
  let livello = media(primoCiclo);
  let tendenza = (media(secondoCiclo) - media(primoCiclo)) / m;
  const stagionalita = primoCiclo.map((v) => v - livello);

  for (let t = 0; t < serie.length; t += 1) {
    const i = t % m;
    const stagionale = stagionalita[i];
    const nuovoLivello =
      alfa * (serie[t] - stagionale) + (1 - alfa) * (livello + tendenza);
    const nuovaTendenza = beta * (nuovoLivello - livello) + (1 - beta) * tendenza;
    stagionalita[i] = gamma * (serie[t] - nuovoLivello) + (1 - gamma) * stagionale;
    livello = nuovoLivello;
    tendenza = nuovaTendenza;
  }

  const n = serie.length;
  return {
    livello,
    tendenza,
    stagionalita,
    previsione: (k: number) =>
      Math.max(0, livello + k * tendenza + stagionalita[(n - 1 + k) % m]),
  };
}

// ─────────────────────────── Previsione del consumo ───────────────────────────

export type OpzioniPrevisione = {
  /** Ampiezza della finestra di osservazione, in giorni. */
  giorni?: number;
  riferimento?: Date;
  alfa?: number;
  beta?: number;
  gamma?: number;
};

/**
 * Previsione del consumo giornaliero. Sceglie il metodo in base a quanti dati
 * ci sono e **rifiuta di rispondere** quando non bastano.
 *
 * · nessun movimento nella finestra → `nessun_consumo`;
 * · finestra < 14 giorni, o meno di 3 giorni con movimento → `dati_insufficienti`;
 * · finestra ≥ 28 giorni → Holt-Winters (stagionalità settimanale);
 * · altrimenti → Holt (livello + tendenza).
 */
export function prevediConsumo(
  movimenti: readonly UscitaMovimento[],
  opzioni: OpzioniPrevisione = {},
): Previsione {
  const giorni = Math.max(0, Math.floor(opzioni.giorni ?? 90));
  const riferimento = opzioni.riferimento ?? new Date();
  const serie = serieGiornaliera(movimenti, giorni, riferimento);
  const totale = serie.reduce((a, b) => a + b, 0);
  const giorniConMovimento = serie.filter((v) => v > 0).length;

  if (totale <= 0) {
    return {
      stato: 'nessun_consumo',
      giorniFinestra: giorni,
      motivo: `Nessuna uscita registrata negli ultimi ${giorni} giorni.`,
    };
  }

  const consumoOsservato = arrotonda(totale / Math.max(1, giorni), 4);

  if (giorni < GIORNI_MINIMI_PREVISIONE) {
    return {
      stato: 'dati_insufficienti',
      giorniFinestra: giorni,
      giorniConMovimento,
      consumoOsservato,
      motivo: `Finestra di ${giorni} giorni: servono almeno ${GIORNI_MINIMI_PREVISIONE} giorni per stimare una tendenza.`,
    };
  }
  if (giorniConMovimento < GIORNI_CON_MOVIMENTO_MINIMI) {
    return {
      stato: 'dati_insufficienti',
      giorniFinestra: giorni,
      giorniConMovimento,
      consumoOsservato,
      motivo: `Solo ${giorniConMovimento} giorni con movimento su ${giorni}: troppo pochi per distinguere una tendenza dal caso.`,
    };
  }

  const stagionale = giorni >= CICLI_MINIMI_STAGIONALITA * PERIODO_STAGIONALE;
  const alfa = opzioni.alfa ?? ALFA_PREDEFINITO;
  const beta = opzioni.beta ?? BETA_PREDEFINITO;

  let consumoGiornaliero: number;
  let tendenza: number;
  if (stagionale) {
    const esito = livellamentoStagionale(
      serie,
      PERIODO_STAGIONALE,
      alfa,
      beta,
      opzioni.gamma ?? GAMMA_PREDEFINITO,
    );
    // Media del prossimo ciclo: le componenti stagionali si compensano, quindi
    // il numero resta confrontabile con un consumo medio giornaliero.
    const prossimoCiclo: number[] = [];
    for (let k = 1; k <= PERIODO_STAGIONALE; k += 1) {
      prossimoCiclo.push(esito.previsione(k));
    }
    consumoGiornaliero = media(prossimoCiclo);
    tendenza = esito.tendenza;
  } else {
    const esito = livellamentoConTendenza(serie, alfa, beta);
    consumoGiornaliero = esito.previsione(1);
    tendenza = esito.tendenza;
  }

  return {
    stato: 'ok',
    metodo: stagionale ? 'holt_winters' : 'holt',
    consumoGiornaliero: arrotonda(Math.max(0, consumoGiornaliero), 4),
    tendenzaGiornaliera: arrotonda(tendenza, 4),
    deviazioneStandard: arrotonda(deviazioneStandard(serie), 4),
    confidenza: valutaConfidenza(serie, giorni, giorniConMovimento),
    giorniFinestra: giorni,
    giorniConMovimento,
  };
}

/**
 * Confidenza dichiarata: dipende da quanti dati ci sono e da quanto sono
 * regolari (coefficiente di variazione). Non è una probabilità, è un'etichetta
 * di affidabilità — e come tale va letta.
 */
export function valutaConfidenza(
  serie: readonly number[],
  giorni: number,
  giorniConMovimento: number,
): Confidenza {
  if (giorni < GIORNI_MINIMI_PREVISIONE || giorniConMovimento === 0) return 'nulla';
  const cv = coefficienteDiVariazione(serie);
  if (cv === null) return 'nulla';
  if (giorni >= 60 && giorniConMovimento >= 20 && cv <= 1) return 'alta';
  if (giorni >= 30 && giorniConMovimento >= 8 && cv <= 2) return 'media';
  return 'bassa';
}

// ─────────────────────────── Copertura e riordino ───────────────────────────

/**
 * Giorni di copertura = disponibile ÷ consumo giornaliero.
 * `null` quando il consumo è 0: la copertura non è «infinita», è **non
 * calcolabile** — mostrarla come ∞ farebbe passare per sano un articolo fermo.
 */
export function giorniDiCopertura(
  disponibile: number,
  consumoGiornaliero: number,
): number | null {
  if (!Number.isFinite(consumoGiornaliero) || consumoGiornaliero <= 0) return null;
  if (disponibile <= 0) return 0;
  return arrotonda(disponibile / consumoGiornaliero, 1);
}

export type IngressiRiordino = {
  consumoGiornaliero: number;
  leadTimeGiorni: number;
  /** σ del consumo giornaliero; 0 quando non stimabile. */
  deviazioneStandard?: number;
  livelloServizio?: LivelloServizio;
};

export type EsitoPuntoDiRiordino = {
  puntoDiRiordino: number;
  /** Domanda attesa durante il lead time (senza scorta di sicurezza). */
  domandaLeadTime: number;
  scortaSicurezza: number;
  z: number;
};

/**
 * Punto di riordino = domanda durante il lead time + scorta di sicurezza.
 * La scorta di sicurezza è z × σ × √leadTime: la variabilità si somma in
 * varianza, quindi cresce con la RADICE del lead time, non linearmente.
 * Il risultato è arrotondato per eccesso — i pezzi sono interi e arrotondare
 * per difetto significa restare scoperti.
 */
export function puntoDiRiordino({
  consumoGiornaliero,
  leadTimeGiorni,
  deviazioneStandard: sigma = 0,
  livelloServizio = 95,
}: IngressiRiordino): EsitoPuntoDiRiordino {
  const lt = Math.max(0, leadTimeGiorni);
  const consumo = Math.max(0, consumoGiornaliero);
  const z = Z_LIVELLO_SERVIZIO[livelloServizio] ?? Z_LIVELLO_SERVIZIO[95];
  const domandaLeadTime = consumo * lt;
  const scortaSicurezza = Math.ceil(z * Math.max(0, sigma) * Math.sqrt(lt));
  return {
    puntoDiRiordino: Math.ceil(domandaLeadTime) + scortaSicurezza,
    domandaLeadTime: arrotonda(domandaLeadTime, 2),
    scortaSicurezza,
    z,
  };
}

export type IngressiQuantita = {
  disponibile: number;
  /** Merce già ordinata e non ancora ricevuta. */
  inArrivo?: number;
  puntoDiRiordino: number;
  maxStock?: number | null;
  consumoGiornaliero?: number;
  /** Copertura obiettivo quando manca `maxStock`. */
  giorniObiettivo?: number;
};

export type EsitoQuantita = {
  quantita: number;
  obiettivo: number;
  /** Spiegazione in italiano del criterio usato — il numero non arriva mai nudo. */
  nota: string;
};

/**
 * Quantità da riordinare. Confronta la POSIZIONE di stock (disponibile + in
 * arrivo) con il punto di riordino: ignorare la merce già ordinata è il modo
 * classico di comprare due volte la stessa cosa.
 */
export function quantitaDiRiordino({
  disponibile,
  inArrivo = 0,
  puntoDiRiordino: rop,
  maxStock = null,
  consumoGiornaliero = 0,
  giorniObiettivo = 30,
}: IngressiQuantita): EsitoQuantita {
  const posizione = disponibile + inArrivo;
  if (posizione > rop) {
    return {
      quantita: 0,
      obiettivo: rop,
      nota: `Posizione di stock ${posizione} sopra il punto di riordino ${rop}: nessun ordine necessario.`,
    };
  }

  if (maxStock != null && maxStock > 0) {
    const obiettivo = Math.max(maxStock, rop);
    const nota =
      maxStock >= rop
        ? `Riordino fino alla scorta massima ${maxStock}.`
        : `Scorta massima ${maxStock} inferiore al punto di riordino ${rop}: si riordina fino al punto di riordino (rivedere i parametri dell'anagrafica).`;
    return { quantita: Math.max(0, Math.ceil(obiettivo - posizione)), obiettivo, nota };
  }

  const obiettivo = rop + Math.ceil(Math.max(0, consumoGiornaliero) * giorniObiettivo);
  return {
    quantita: Math.max(0, Math.ceil(obiettivo - posizione)),
    obiettivo,
    nota: `Scorta massima non impostata: obiettivo = punto di riordino + ${giorniObiettivo} giorni di consumo.`,
  };
}

/**
 * Lotto economico di acquisto (EOQ, Wilson): √(2 × domanda annua × costo
 * d'ordine ÷ costo di mantenimento unitario annuo). `null` con ingressi non
 * sensati: un EOQ calcolato su costi inventati è un numero senza significato.
 */
export function eoq(
  domandaAnnuale: number,
  costoOrdineCents: number,
  costoMantenimentoUnitarioAnnuoCents: number,
): number | null {
  if (
    !Number.isFinite(domandaAnnuale) ||
    !Number.isFinite(costoOrdineCents) ||
    !Number.isFinite(costoMantenimentoUnitarioAnnuoCents) ||
    domandaAnnuale <= 0 ||
    costoOrdineCents <= 0 ||
    costoMantenimentoUnitarioAnnuoCents <= 0
  ) {
    return null;
  }
  return Math.ceil(
    Math.sqrt(
      (2 * domandaAnnuale * costoOrdineCents) / costoMantenimentoUnitarioAnnuoCents,
    ),
  );
}

// ─────────────────────────── Giacenza lenta e morta ───────────────────────────

export type StatoMovimentazione = 'senza_giacenza' | 'morto' | 'lento' | 'regolare';

export type ArticoloDaClassificare = {
  id: string;
  giacenza: number;
  /** Data dell'ultima uscita; `null` se non ne esiste nessuna. */
  ultimaUscita?: Date | string | null;
  /** Giorni di copertura già calcolati; `null` se non calcolabili. */
  copertura?: number | null;
};

export type ArticoloClassificato = ArticoloDaClassificare & {
  stato: StatoMovimentazione;
  /** Giorni dall'ultima uscita; `null` se non c'è mai stata un'uscita. */
  giorniDaUltimaUscita: number | null;
  motivo: string;
};

export type OpzioniLentiMovimenti = {
  /** Giorni senza uscite oltre i quali la giacenza è considerata morta. */
  giorniMorto?: number;
  /** Copertura oltre la quale l'articolo è lento (capitale fermo). */
  giorniLento?: number;
  riferimento?: Date;
};

/**
 * Classifica la giacenza per movimentazione. La giacenza morta è capitale
 * immobilizzato e spazio occupato: va vista, non calcolata «in media».
 */
export function rilevaLentiMovimenti(
  articoli: readonly ArticoloDaClassificare[],
  {
    giorniMorto = 90,
    giorniLento = 180,
    riferimento = new Date(),
  }: OpzioniLentiMovimenti = {},
): ArticoloClassificato[] {
  const oggi = inizioGiorno(riferimento);
  return articoli.map((a) => {
    const data = a.ultimaUscita ? comeData(a.ultimaUscita) : null;
    const giorniDaUltimaUscita = data
      ? Math.max(0, Math.round((oggi - inizioGiorno(data)) / GIORNO_MS))
      : null;

    if (a.giacenza <= 0) {
      return {
        ...a,
        stato: 'senza_giacenza' as const,
        giorniDaUltimaUscita,
        motivo: 'Nessuna giacenza da valutare.',
      };
    }
    if (giorniDaUltimaUscita === null) {
      return {
        ...a,
        stato: 'morto' as const,
        giorniDaUltimaUscita,
        motivo: 'Nessuna uscita mai registrata.',
      };
    }
    if (giorniDaUltimaUscita >= giorniMorto) {
      return {
        ...a,
        stato: 'morto' as const,
        giorniDaUltimaUscita,
        motivo: `Ferma da ${giorniDaUltimaUscita} giorni (soglia ${giorniMorto}).`,
      };
    }
    if (a.copertura != null && a.copertura > giorniLento) {
      return {
        ...a,
        stato: 'lento' as const,
        giorniDaUltimaUscita,
        motivo: `Copertura di ${a.copertura} giorni, oltre la soglia di ${giorniLento}.`,
      };
    }
    return {
      ...a,
      stato: 'regolare' as const,
      giorniDaUltimaUscita,
      motivo: `Ultima uscita ${giorniDaUltimaUscita} giorni fa.`,
    };
  });
}

// ─────────────────────────── Riepilogo testuale ───────────────────────────

export type VoceTendenza = {
  nome: string;
  consumoGiornaliero: number;
  tendenzaGiornaliera: number;
  copertura: number | null;
  quantitaSuggerita: number;
  statoPrevisione: Previsione['stato'];
};

/**
 * Riepilogo in italiano delle tendenze d'acquisto, **composto da un modello di
 * frase riempito con i numeri già calcolati** — nessun testo generato da un
 * modello linguistico. Ogni affermazione è verificabile nella tabella accanto.
 */
export function riepilogoTendenzeAcquisti(
  voci: readonly VoceTendenza[],
  { sogliaCoperturaCritica = 15 }: { sogliaCoperturaCritica?: number } = {},
): string[] {
  if (voci.length === 0) {
    return ['Nessun articolo da analizzare nel periodo selezionato.'];
  }

  const righe: string[] = [];
  const daRiordinare = voci.filter((v) => v.quantitaSuggerita > 0);
  const pezziTotali = daRiordinare.reduce((a, v) => a + v.quantitaSuggerita, 0);
  const critici = voci
    .filter((v) => v.copertura != null && v.copertura <= sogliaCoperturaCritica)
    .sort((a, b) => (a.copertura ?? 0) - (b.copertura ?? 0));
  const inCrescita = voci.filter(
    (v) => v.statoPrevisione === 'ok' && v.tendenzaGiornaliera > 0.05,
  );
  const inCalo = voci.filter(
    (v) => v.statoPrevisione === 'ok' && v.tendenzaGiornaliera < -0.05,
  );
  const senzaConsumo = voci.filter((v) => v.statoPrevisione === 'nessun_consumo');
  const senzaDati = voci.filter((v) => v.statoPrevisione === 'dati_insufficienti');

  righe.push(
    daRiordinare.length === 0
      ? `Nessun articolo sotto il punto di riordino su ${voci.length} analizzati.`
      : `${daRiordinare.length} articoli su ${voci.length} sono sotto il punto di riordino, per un totale di ${pezziTotali} pezzi suggeriti.`,
  );

  if (critici.length > 0) {
    const primi = critici
      .slice(0, 3)
      .map((v) => `${v.nome} (${v.copertura} gg)`)
      .join(', ');
    righe.push(
      `Copertura sotto ${sogliaCoperturaCritica} giorni per ${critici.length} articoli — i più urgenti: ${primi}.`,
    );
  }

  if (inCrescita.length > 0 || inCalo.length > 0) {
    righe.push(
      `Tendenza dei consumi: ${inCrescita.length} articoli in crescita, ${inCalo.length} in calo, ${voci.length - inCrescita.length - inCalo.length} stabili o non stimabili.`,
    );
  }

  if (senzaConsumo.length > 0) {
    righe.push(
      `${senzaConsumo.length} articoli non hanno avuto uscite nella finestra: capitale fermo da verificare.`,
    );
  }
  if (senzaDati.length > 0) {
    righe.push(
      `${senzaDati.length} articoli hanno dati insufficienti: per questi non viene proposta alcuna quantità.`,
    );
  }

  return righe;
}
