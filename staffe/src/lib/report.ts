import { z } from 'zod';

/**
 * Report — definizioni delle metriche, periodi ed esportazione.
 *
 * Regola del modulo: **nessun numero senza definizione**. Ogni metrica mostrata
 * a schermo ha una voce in `DEFINIZIONI` che dice che cosa conta, qual è il
 * denominatore, quale finestra temporale usa e che cosa esclude — ed è la
 * stessa definizione che il componente `Metodo` stampa sotto la tabella. Due
 * report che dicono numeri diversi distruggono la fiducia nel gestionale: la
 * cura è una sola definizione scritta, in un solo posto.
 *
 * Qui NON si accede al database (nessun import di Prisma): sono definizioni,
 * calcoli puri e formattazione, quindi si testano senza PostgreSQL. Le query
 * vivono in `src/app/(app)/report/_dati.ts`.
 */

// ─────────────────────────── Definizioni delle metriche ───────────────────────────

export type Definizione = {
  /** Nome della metrica come appare all'utente. */
  nome: string;
  /** Che cosa conta esattamente il numeratore. */
  cosaConta: string;
  /** Denominatore, quando la metrica è un rapporto o una media. */
  denominatore?: string;
  /** Finestra temporale e campo data usato per filtrare. */
  finestra: string;
  /** Che cosa resta fuori dal conteggio. */
  esclusioni: string;
  /** Limiti noti del calcolo, dichiarati invece che nascosti. */
  limiti?: string;
};

export const DEFINIZIONI = {
  valorizzazione: {
    nome: 'Valorizzazione del magazzino',
    cosaConta:
      'Somma, su tutti i prodotti attivi, di (giacenza × costo unitario). La giacenza è la somma di StockItem.qty (tutte le ubicazioni e i lotti, impegnato incluso). Il costo unitario è il COSTO MEDIO PONDERATO dei movimenti di ricevimento: Σ(qty × unitCostCents) ÷ Σ(qty). Se per il prodotto non esiste alcun ricevimento con costo, si usa Product.costCents (costo di anagrafica) e la riga è marcata «anagrafica».',
    denominatore: 'Nessuno: è un valore assoluto in euro.',
    finestra:
      'Giacenza alla data odierna. Il periodo selezionato limita i ricevimenti che entrano nella media ponderata (predefinito: tutto lo storico).',
    esclusioni:
      'Prodotti disattivati; ricevimenti con costo unitario zero (non informano il costo); movimenti diversi dal ricevimento.',
    limiti:
      'Non è un LIFO/FIFO fiscale: il costo medio ponderato è un criterio gestionale. Cambiando il periodo cambia la media, quindi cambia il valore: il periodo va sempre letto insieme al numero.',
  },
  movimenti: {
    nome: 'Movimenti e rotazione',
    cosaConta:
      'Quantità entrate e uscite per prodotto nel periodo. Entrata = movimento con ubicazione di destinazione valorizzata; uscita = movimento con ubicazione di partenza valorizzata. Il trasferimento è escluso da entrambe: sposta merce dentro il magazzino, non la fa entrare né uscire.',
    denominatore: 'Indice di rotazione = quantità uscita nel periodo ÷ giacenza attuale.',
    finestra: 'Data del movimento (StockMovement.createdAt) dentro il periodo scelto.',
    esclusioni: 'Trasferimenti interni; movimenti di prodotti cancellati (non esistono: si disattiva).',
    limiti:
      'Al denominatore della rotazione c’è la giacenza di OGGI, non la giacenza media del periodo: il sistema non conserva fotografie giornaliere delle scorte. Con giacenza attuale zero l’indice non è definito (mostrato «—»), non «infinito».',
  },
  vendite: {
    nome: 'Vendite',
    cosaConta:
      'Fatturato = imponibile degli ordini di vendita del periodo: Σ righe (qty × prezzo unitario − sconto riga) meno lo sconto di testata, ripartito proporzionalmente. IVA e spese di spedizione ESCLUSE.',
    denominatore:
      'Ordine medio = fatturato ÷ numero di ordini del periodo (stessa selezione al numeratore e al denominatore).',
    finestra:
      'Data dell’ordine (SalesOrder.orderedAt); se assente, data di creazione (createdAt).',
    esclusioni:
      'Ordini in stato Bozza, Preventivo e Annullato: un preventivo non è un ricavo.',
    limiti:
      'Il fatturato è il valore degli ORDINI, non delle fatture emesse né degli incassi: ordini consegnati e non pagati sono comunque contati.',
  },
  acquisti: {
    nome: 'Acquisti',
    cosaConta:
      'Spesa = imponibile degli ordini di acquisto del periodo: Σ righe (qty × costo unitario − sconto riga), più le spese di trasporto della testata. IVA esclusa.',
    denominatore: 'Ordine medio = spesa ÷ numero di ordini di acquisto del periodo.',
    finestra:
      'Data dell’ordine (PurchaseOrder.orderedAt); se assente, data di creazione (createdAt).',
    esclusioni: 'Ordini in stato Bozza e Annullato.',
    limiti:
      'È l’IMPEGNO di spesa dell’ordine, non la merce effettivamente ricevuta né la fattura del fornitore.',
  },
  fornitori: {
    nome: 'Prestazione dei fornitori',
    cosaConta:
      'Lead time reale = giorni fra data ordine (orderedAt) e data di ricevimento (receivedAt), mediato sugli ordini ricevuti nel periodo. Ordini completi = ordini in cui ogni riga ha receivedQty ≥ qty. Ritardo = receivedAt oltre expectedAt.',
    denominatore:
      '% completi e % puntuali sul numero di ordini ricevuti del fornitore nel periodo (per la puntualità: solo quelli con data prevista compilata).',
    finestra: 'Ordini con receivedAt dentro il periodo.',
    esclusioni:
      'Ordini annullati; ordini senza data di ordine o senza data di ricevimento (il lead time non sarebbe calcolabile); per la puntualità, ordini senza data prevista.',
    limiti:
      'Media aritmetica su pochi ordini è instabile: la colonna «ordini» va letta insieme al lead time. Il lead time dichiarato in anagrafica non entra nel calcolo, è mostrato solo come confronto.',
  },
  scorte: {
    nome: 'Stato delle scorte',
    cosaConta:
      'Esaurito = giacenza ≤ 0. Sotto scorta = giacenza > 0 e giacenza ≤ Product.minStock. Giacenza morta = giacenza > 0 e nessuna uscita da almeno N giorni (N impostabile, predefinito 90).',
    denominatore: 'Percentuali calcolate sul totale dei prodotti attivi.',
    finestra:
      'Giacenza alla data odierna; per la giacenza morta si guarda la data dell’ultima uscita, su tutto lo storico.',
    esclusioni: 'Prodotti disattivati.',
    limiti:
      'La soglia minima è quella dell’anagrafica: se minStock non è aggiornato, «sotto scorta» dice quanto è vecchio il parametro, non quanto serve la merce.',
  },
  previsioni: {
    nome: 'Previsioni di consumo e riordino',
    cosaConta:
      'Consumo giornaliero previsto per prodotto, da livellamento esponenziale con tendenza (Holt) sulla serie giornaliera delle uscite; con almeno 28 giorni di finestra si aggiunge la stagionalità settimanale additiva (Holt-Winters). Punto di riordino = consumo × lead time + z × σ × √lead time (z = 1,64 per un livello di servizio del 95%).',
    denominatore:
      'Consumo medio giornaliero = quantità uscita nella finestra ÷ GIORNI della finestra (i giorni senza movimento contano come zero).',
    finestra:
      'Uscite per ordine di vendita (prelievo e spedizione) negli ultimi N giorni, N impostabile (predefinito 90).',
    esclusioni:
      'Scarti, resi a fornitore, trasferimenti e rettifiche: non sono domanda del cliente. Prodotti disattivati.',
    limiti:
      'Calcolo DETERMINISTICO, senza alcun modello linguistico: gli stessi dati danno sempre lo stesso numero. Con meno di 14 giorni di finestra o meno di 3 giorni movimentati non viene proposta alcuna previsione («dati insufficienti»): un numero inventato farebbe comprare merce vera. Il metodo estrapola il passato: non conosce commesse straordinarie, promozioni o fermi impianto.',
  },
  cruscotto: {
    nome: 'Cruscotto',
    cosaConta:
      'Riepilogo delle stesse metriche dei report, calcolate sui periodi indicati su ogni riquadro. Valorizzazione e margini seguono la definizione del report «Valorizzazione» e sono visibili solo con il permesso costi:leggi.',
    denominatore: 'Variazione % = (mese corrente − mese precedente) ÷ mese precedente.',
    finestra:
      'Mese corrente dal giorno 1 a oggi, confrontato con lo STESSO intervallo di giorni del mese precedente.',
    esclusioni: 'Come nei report di origine (bozze, preventivi e annullati esclusi).',
    limiti:
      'Il mese in corso è parziale: il confronto usa lo stesso numero di giorni del mese precedente, altrimenti il calo sarebbe solo un effetto del calendario.',
  },
} as const satisfies Record<string, Definizione>;

export type NomeReport = keyof typeof DEFINIZIONI;

/** Report esportabili come file (il cruscotto non lo è: è una vista, non un elenco). */
export const REPORT_ESPORTABILI = [
  'valorizzazione',
  'movimenti',
  'vendite',
  'acquisti',
  'fornitori',
  'scorte',
  'previsioni',
] as const;

export type ReportEsportabile = (typeof REPORT_ESPORTABILI)[number];

/** Report che espongono costi o margini: richiedono anche il permesso costi:leggi. */
export const REPORT_CON_COSTI: readonly ReportEsportabile[] = [
  'valorizzazione',
  'acquisti',
];

// ─────────────────────────── Direzione dei movimenti ───────────────────────────

/**
 * Tipi di movimento che rappresentano DOMANDA DEL CLIENTE. Sono gli unici che
 * alimentano la previsione: uno scarto consuma giacenza ma non è domanda, e
 * riordinare per gli scarti significa ricomprare merce che si rompe.
 */
export const TIPI_CONSUMO = ['PRELIEVO', 'SPEDIZIONE'] as const;

/** Tipi di movimento che tolgono merce dal magazzino, a qualunque titolo. */
export const TIPI_USCITA = [
  'PRELIEVO',
  'SPEDIZIONE',
  'SCARTO',
  'RESO_FORNITORE',
] as const;

/** Il trasferimento non è né entrata né uscita: sposta merce fra ubicazioni. */
export const TIPI_INTERNI = ['TRASFERIMENTO'] as const;

// ─────────────────────────── Periodi ───────────────────────────

export type PresetPeriodo =
  | 'oggi'
  | '7g'
  | '30g'
  | '90g'
  | 'mese'
  | 'mese_scorso'
  | 'anno'
  | 'tutto'
  | 'personalizzato';

export const ETICHETTE_PERIODO: Record<PresetPeriodo, string> = {
  oggi: 'Oggi',
  '7g': 'Ultimi 7 giorni',
  '30g': 'Ultimi 30 giorni',
  '90g': 'Ultimi 90 giorni',
  mese: 'Mese corrente',
  mese_scorso: 'Mese scorso',
  anno: 'Anno corrente',
  tutto: 'Tutto lo storico',
  personalizzato: 'Periodo personalizzato',
};

export type Periodo = {
  preset: PresetPeriodo;
  /** Inizio incluso; `null` significa «dall'inizio dello storico». */
  da: Date | null;
  /** Fine inclusa (fine giornata). */
  a: Date;
  etichetta: string;
};

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Campo data del filtro. Il campo vuoto («») è un'assenza, non un errore: il
 * modulo di ricerca invia sempre tutti i campi, anche quelli non compilati, e
 * rifiutarli farebbe cadere l'intero filtro sul predefinito senza spiegazione.
 */
const campoData = z
  .union([z.literal(''), z.string().regex(RE_DATA, 'Data non valida (formato AAAA-MM-GG).')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const schemaFiltroPeriodo = z.object({
  periodo: z
    .union([
      z.literal(''),
      z.enum(['oggi', '7g', '30g', '90g', 'mese', 'mese_scorso', 'anno', 'tutto', 'personalizzato']),
    ])
    .optional()
    .transform((v) => (v ? v : undefined)),
  da: campoData,
  a: campoData,
});

export type FiltroPeriodo = z.infer<typeof schemaFiltroPeriodo>;

function inizioGiorno(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fineGiorno(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function giorniPrima(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - n);
  return x;
}

/**
 * Traduce i parametri della query in un periodo con estremi certi. Ingressi
 * illeggibili non generano un errore silenzioso: si ricade sul predefinito e
 * l'etichetta mostrata a schermo dice quale periodo è stato davvero usato.
 */
export function risolviPeriodo(
  filtro: FiltroPeriodo,
  predefinito: PresetPeriodo = '30g',
  adesso: Date = new Date(),
): Periodo {
  const daEsplicito = filtro.da && RE_DATA.test(filtro.da) ? new Date(`${filtro.da}T00:00:00`) : null;
  const aEsplicito = filtro.a && RE_DATA.test(filtro.a) ? new Date(`${filtro.a}T00:00:00`) : null;

  if (daEsplicito || aEsplicito) {
    const da = daEsplicito ? inizioGiorno(daEsplicito) : null;
    const a = fineGiorno(aEsplicito ?? adesso);
    return {
      preset: 'personalizzato',
      da,
      a,
      etichetta: `${da ? formatoGiornoIt(da) : 'inizio'} → ${formatoGiornoIt(a)}`,
    };
  }

  const preset = filtro.periodo ?? predefinito;
  const fine = fineGiorno(adesso);

  switch (preset) {
    case 'oggi':
      return { preset, da: inizioGiorno(adesso), a: fine, etichetta: ETICHETTE_PERIODO.oggi };
    case '7g':
      return { preset, da: inizioGiorno(giorniPrima(adesso, 6)), a: fine, etichetta: ETICHETTE_PERIODO['7g'] };
    case '90g':
      return { preset, da: inizioGiorno(giorniPrima(adesso, 89)), a: fine, etichetta: ETICHETTE_PERIODO['90g'] };
    case 'mese':
      return {
        preset,
        da: inizioGiorno(new Date(adesso.getFullYear(), adesso.getMonth(), 1)),
        a: fine,
        etichetta: ETICHETTE_PERIODO.mese,
      };
    case 'mese_scorso': {
      const da = inizioGiorno(new Date(adesso.getFullYear(), adesso.getMonth() - 1, 1));
      const a = fineGiorno(new Date(adesso.getFullYear(), adesso.getMonth(), 0));
      return { preset, da, a, etichetta: ETICHETTE_PERIODO.mese_scorso };
    }
    case 'anno':
      return {
        preset,
        da: inizioGiorno(new Date(adesso.getFullYear(), 0, 1)),
        a: fine,
        etichetta: ETICHETTE_PERIODO.anno,
      };
    case 'tutto':
      return { preset, da: null, a: fine, etichetta: ETICHETTE_PERIODO.tutto };
    case '30g':
    case 'personalizzato':
    default:
      return {
        preset: '30g',
        da: inizioGiorno(giorniPrima(adesso, 29)),
        a: fine,
        etichetta: ETICHETTE_PERIODO['30g'],
      };
  }
}

/** Legge il periodo dai `searchParams` di una pagina, senza mai lanciare. */
export function periodoDaParametri(
  params: Record<string, string | string[] | undefined>,
  predefinito: PresetPeriodo = '30g',
  adesso: Date = new Date(),
): Periodo {
  const primo = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const esito = schemaFiltroPeriodo.safeParse({
    periodo: primo(params.periodo),
    da: primo(params.da),
    a: primo(params.a),
  });
  return risolviPeriodo(esito.success ? esito.data : {}, predefinito, adesso);
}

/**
 * Numero intero preso da un parametro di query, riportato dentro i limiti
 * ammessi. Un valore fuori scala (o non numerico) non deve produrre una query
 * mostruosa né un errore silenzioso: si riporta al predefinito, e la soglia
 * usata resta scritta a schermo.
 */
export function interoDaParametro(
  valore: string | string[] | undefined,
  { predefinito, min, max }: { predefinito: number; min: number; max: number },
): number {
  const grezzo = Array.isArray(valore) ? valore[0] : valore;
  const n = Number.parseInt(grezzo ?? '', 10);
  if (!Number.isFinite(n)) return predefinito;
  return Math.min(max, Math.max(min, n));
}

/**
 * Periodo precedente di pari LUNGHEZZA IN GIORNI, per i confronti. Un mese in
 * corso confrontato con un mese intero mostrerebbe sempre un calo: sarebbe un
 * artefatto del calendario, non un fatto commerciale.
 */
export function periodoPrecedente(periodo: Periodo): Periodo {
  if (!periodo.da) {
    return { ...periodo, etichetta: 'Periodo precedente non definito' };
  }
  const durata = periodo.a.getTime() - periodo.da.getTime();
  const a = new Date(periodo.da.getTime() - 1);
  const da = new Date(a.getTime() - durata);
  return {
    preset: 'personalizzato',
    da,
    a,
    etichetta: `${formatoGiornoIt(da)} → ${formatoGiornoIt(a)}`,
  };
}

/** Confronto mese corrente (parziale) vs stesso numero di giorni del mese scorso. */
export function meseCorrenteEPrecedente(adesso: Date = new Date()): {
  corrente: Periodo;
  precedente: Periodo;
  giorni: number;
} {
  const giorno = adesso.getDate();
  const inizioCorrente = inizioGiorno(new Date(adesso.getFullYear(), adesso.getMonth(), 1));
  const inizioPrecedente = inizioGiorno(
    new Date(adesso.getFullYear(), adesso.getMonth() - 1, 1),
  );
  // Il mese scorso può essere più corto (febbraio): si taglia all'ultimo giorno.
  const ultimoGiornoPrecedente = new Date(
    adesso.getFullYear(),
    adesso.getMonth(),
    0,
  ).getDate();
  const finePrecedente = fineGiorno(
    new Date(
      adesso.getFullYear(),
      adesso.getMonth() - 1,
      Math.min(giorno, ultimoGiornoPrecedente),
    ),
  );
  return {
    corrente: {
      preset: 'mese',
      da: inizioCorrente,
      a: fineGiorno(adesso),
      etichetta: `Mese corrente (giorni 1–${giorno})`,
    },
    precedente: {
      preset: 'personalizzato',
      da: inizioPrecedente,
      a: finePrecedente,
      etichetta: `Mese scorso (giorni 1–${Math.min(giorno, ultimoGiornoPrecedente)})`,
    },
    giorni: giorno,
  };
}

/** Filtro Prisma per un campo data. Periodo «tutto» → nessun vincolo. */
export function filtroData(periodo: Periodo): { gte?: Date; lte: Date } {
  return periodo.da ? { gte: periodo.da, lte: periodo.a } : { lte: periodo.a };
}

/** Parametri di query che conservano il filtro corrente nei link (export, stampa). */
export function queryPeriodo(periodo: Periodo): string {
  const p = new URLSearchParams();
  if (periodo.preset === 'personalizzato') {
    if (periodo.da) p.set('da', isoGiorno(periodo.da));
    p.set('a', isoGiorno(periodo.a));
  } else {
    p.set('periodo', periodo.preset);
  }
  return p.toString();
}

export function isoGiorno(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${gg}`;
}

export function formatoGiornoIt(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const gg = String(d.getDate()).padStart(2, '0');
  return `${gg}/${mm}/${d.getFullYear()}`;
}

// ─────────────────────────── Calcoli condivisi ───────────────────────────

export type RigaCosto = { qty: number; unitCostCents: number };

/**
 * Costo medio ponderato = Σ(qty × costo unitario) ÷ Σ(qty), sui soli ricevimenti
 * con costo valorizzato. `null` quando non c'è alcun ricevimento utile: chi
 * chiama decide il ripiego (di norma Product.costCents) e lo DICHIARA nella riga.
 *
 * Ponderato e non media semplice: dieci pezzi a 10 € e mille pezzi a 12 € non
 * fanno 11 € — fanno 11,98 €. La media semplice sottostima il magazzino.
 */
export function costoMedioPonderato(righe: readonly RigaCosto[]): number | null {
  let pezzi = 0;
  let valore = 0;
  for (const r of righe) {
    if (r.qty <= 0 || r.unitCostCents <= 0) continue;
    pezzi += r.qty;
    valore += r.qty * r.unitCostCents;
  }
  if (pezzi <= 0) return null;
  return Math.round(valore / pezzi);
}

/**
 * Indice di rotazione = uscite del periodo ÷ giacenza attuale.
 * `null` con giacenza nulla: non è «infinito», è non calcolabile.
 */
export function indiceRotazione(uscitePeriodo: number, giacenzaAttuale: number): number | null {
  if (giacenzaAttuale <= 0) return null;
  return Math.round((uscitePeriodo / giacenzaAttuale) * 100) / 100;
}

/** Variazione relativa fra due periodi. `null` quando la base è 0 (non definita). */
export function variazione(corrente: number, precedente: number): number | null {
  if (precedente === 0) return null;
  return (corrente - precedente) / precedente;
}

/** Media aritmetica; `null` su insieme vuoto (nessun numero da inventare). */
export function mediaOppureNull(valori: readonly number[]): number | null {
  if (valori.length === 0) return null;
  return valori.reduce((a, b) => a + b, 0) / valori.length;
}

/** Percentuale come rapporto 0–1; `null` quando il denominatore è 0. */
export function quota(parte: number, totale: number): number | null {
  if (totale <= 0) return null;
  return parte / totale;
}

/** Giorni interi fra due date (differenza di calendario, non di orologio). */
export function giorniFra(inizio: Date, fine: Date): number {
  const a = Date.UTC(inizio.getFullYear(), inizio.getMonth(), inizio.getDate());
  const b = Date.UTC(fine.getFullYear(), fine.getMonth(), fine.getDate());
  return Math.round((b - a) / 86_400_000);
}

/** Margine in centesimi e in percentuale sul ricavo. */
export function margine(
  ricavoCents: number,
  costoCents: number,
): { margineCents: number; marginePercento: number | null } {
  const margineCents = ricavoCents - costoCents;
  return {
    margineCents,
    marginePercento: ricavoCents === 0 ? null : margineCents / ricavoCents,
  };
}

// ─────────────────────────── Formattazione ───────────────────────────

const NUM_IT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });

/** Percentuale da un rapporto 0–1. `null` → «—»: mai un falso zero. */
export function formatPercento(rapporto: number | null | undefined, decimali = 1): string {
  if (rapporto == null || !Number.isFinite(rapporto)) return '—';
  return `${new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(rapporto * 100)}%`;
}

/** Numero decimale all'italiana. `null` → «—». */
export function formatDecimale(valore: number | null | undefined, decimali = 2): string {
  if (valore == null || !Number.isFinite(valore)) return '—';
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
  }).format(valore);
}

/** Giorni; `null` → «non calcolabile» abbreviato in «—». */
export function formatGiorni(valore: number | null | undefined): string {
  if (valore == null || !Number.isFinite(valore)) return '—';
  return `${NUM_IT.format(valore)} gg`;
}

// ─────────────────────────── Esportazione CSV ───────────────────────────

export type TipoColonna = 'testo' | 'intero' | 'numero' | 'euro' | 'percentuale' | 'data';

export type ColonnaCsv<T> = {
  intestazione: string;
  valore: (riga: T) => string | number | Date | null | undefined;
  /** Predefinito: `testo`. `euro` riceve CENTESIMI, `percentuale` un rapporto 0–1. */
  tipo?: TipoColonna;
  decimali?: number;
};

export type OpzioniCsv = {
  /** Separatore: `;` perché in italiano la virgola è il separatore decimale. */
  separatore?: string;
  /** BOM UTF-8: senza, Excel in italiano rompe gli accenti. */
  bom?: boolean;
};

const BOM = '﻿';

function numeroIt(valore: number, decimali: number): string {
  // Niente separatore delle migliaia: Excel lo interpreterebbe come testo in
  // alcune impostazioni locali. Solo la virgola decimale.
  return valore.toFixed(decimali).replace('.', ',');
}

/**
 * Protezione dall'iniezione di formule (CSV injection): una cella che inizia con
 * `=`, `+`, `-`, `@`, tab o CR viene eseguita da Excel/LibreOffice all'apertura.
 * Un nome fornitore scritto ad arte diventerebbe una formula sul computer di chi
 * apre il file. Si antepone un apostrofo: il testo resta leggibile, la formula no.
 */
function neutralizzaFormula(testo: string): string {
  return /^[=+\-@\t\r]/.test(testo) ? `'${testo}` : testo;
}

function cellaTesto(testo: string, separatore: string): string {
  const sicuro = neutralizzaFormula(testo);
  return /["\r\n]/.test(sicuro) || sicuro.includes(separatore)
    ? `"${sicuro.replace(/"/g, '""')}"`
    : sicuro;
}

/**
 * CSV in formato italiano: separatore `;`, virgola decimale, date GG/MM/AAAA,
 * fine riga CRLF e BOM UTF-8 in testa — così Excel lo apre senza procedura
 * guidata e senza accenti rotti.
 */
export function toCsv<T>(
  righe: readonly T[],
  colonne: readonly ColonnaCsv<T>[],
  { separatore = ';', bom = true }: OpzioniCsv = {},
): string {
  const testa = colonne.map((c) => cellaTesto(c.intestazione, separatore)).join(separatore);

  const corpo = righe.map((riga) =>
    colonne
      .map((colonna) => {
        const valore = colonna.valore(riga);
        if (valore == null) return '';
        switch (colonna.tipo ?? 'testo') {
          case 'euro':
            return numeroIt(Number(valore) / 100, colonna.decimali ?? 2);
          case 'percentuale':
            return numeroIt(Number(valore) * 100, colonna.decimali ?? 2);
          case 'numero':
            return numeroIt(Number(valore), colonna.decimali ?? 2);
          case 'intero':
            return String(Math.round(Number(valore)));
          case 'data': {
            const d = valore instanceof Date ? valore : new Date(String(valore));
            return Number.isNaN(d.getTime()) ? '' : formatoGiornoIt(d);
          }
          default:
            return cellaTesto(String(valore), separatore);
        }
      })
      .join(separatore),
  );

  return `${bom ? BOM : ''}${[testa, ...corpo].join('\r\n')}\r\n`;
}

/** Nome file privo di caratteri che romperebbero l'intestazione HTTP. */
export function nomeFileReport(nome: string, periodo: Periodo): string {
  const base = nome.replace(/[^a-z0-9_-]/gi, '');
  const fino = isoGiorno(periodo.a);
  const dal = periodo.da ? isoGiorno(periodo.da) : 'inizio';
  return `${base}_${dal}_${fino}.csv`;
}

/** Intestazioni HTTP di un allegato CSV. Dati aziendali → mai in cache condivisa. */
export function intestazioniCsv(nomeFile: string): Record<string, string> {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${nomeFile}"`,
    'Cache-Control': 'no-store',
  };
}
