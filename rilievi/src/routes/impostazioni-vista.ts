import type { Request, Response } from 'express';
import { config } from '../config.js';
import { fornitoriConfigurati } from '../auth/oidc.js';
import type { Fornitore } from '../auth/oidc-stato.js';
import { sendError } from '../auth/guards.js';
import {
  CAPACITA_CONFIGURABILI,
  nomiSalvati,
  permessiSalvati,
  predefiniti,
  RUOLI_AZIENDA,
  RUOLI_CONFIGURABILI,
} from '../auth/permessi.js';
import { CAMPI_DATI, datiSalvati, type DatiSocietari } from '../aziende/dati.js';
import { capacitaNascoste } from '../aziende/ruoli.js';
import { MAX_CONDIZIONI } from '../preventivi/azienda.js';
import type { aziendeImpostabili } from '../aziende/sezioni.js';
import { MODELLI, MODELLI_ID, modelloDi } from '../cartelli/modelli.js';
import { modelloInformativa } from '../legale/informativa.js';
import { misuraVista } from '../cartelli/vista.js';
import type { SectionKey } from '../schede/fields.js';
import { FISSE, ordineEffettivo, type Verso } from '../schede/ordine.js';

/**
 * Настройките на фирмата на малки страници (собственикът, 10 ноември 2026 — „Riordina anche /impostazioni
 * e fai piccole directory dentro per le cose separate“): `/impostazioni` — картите на разделите с
 * състоянието им; всеки раздел — своя страница `/impostazioni/<раздел>` с местната навигация горе.
 */
export const SEZIONI_IMPOSTAZIONI = [
  'azienda',
  'scheda',
  'cartelli',
  'buoni',
  'preventivi',
  'ruoli',
  'fornitori',
  'firme',
  'condizioni',
  'accesso',
  'api',
  'esportazione',
] as const;
export type SezioneImpostazioni = (typeof SEZIONI_IMPOSTAZIONI)[number];

export const ICONE_SEZIONI: Readonly<Record<SezioneImpostazioni, string>> = {
  azienda: 'building',
  scheda: 'sheet',
  cartelli: 'stop',
  buoni: 'buono',
  preventivi: 'euro',
  ruoli: 'users',
  fornitori: 'mail',
  firme: 'sign',
  condizioni: 'seal',
  accesso: 'shield',
  api: 'key',
  esportazione: 'download',
};

export const isSezione = (value: unknown): value is SezioneImpostazioni =>
  typeof value === 'string' && (SEZIONI_IMPOSTAZIONI as readonly string[]).includes(value);

export type AziendaImpostabile = Awaited<ReturnType<typeof aziendeImpostabili>>[number];

/**
 * Разделите на фирмата: „Preventivi“ — само когато MASTER е включил офертите ѝ; „Accesso con Microsoft o
 * Google“ — само когато порталът има регистрирано приложение при поне един доставчик (src/auth/oidc.ts).
 */
export const sezioniDi = (azienda: { preventiviAttivi: boolean }): SezioneImpostazioni[] =>
  SEZIONI_IMPOSTAZIONI.filter(
    (s) =>
      (s !== 'preventivi' || azienda.preventiviAttivi) &&
      (s !== 'accesso' || fornitoriConfigurati().length > 0),
  );

/** Адресът на раздел за фирмата. */
export const pathSezione = (sezione: SezioneImpostazioni, aziendaId: string): string =>
  `/impostazioni/${sezione}?azienda=${encodeURIComponent(aziendaId)}`;

/** Ролите във формата: записаните имена (празно — по подразбиране) и правата на всяка роля под ADMIN. */
function ruoliForm(azienda: AziendaImpostabile): Record<string, string | string[]> {
  const nomi = nomiSalvati(azienda.nomiRuoli);
  const permessi = permessiSalvati(azienda.permessiRuoli);
  return Object.fromEntries([
    ...RUOLI_AZIENDA.map((role) => [`nome-${role}`, nomi[role] ?? '']),
    ...RUOLI_CONFIGURABILI.map((role) => [
      `perm-${role}`,
      [...(permessi[role] ?? predefiniti(role))],
    ]),
  ]);
}

/** Данните във формата: записаните, или празни, докато не са записани. */
function datiForm(azienda: AziendaImpostabile): Record<keyof DatiSocietari, string> {
  const salvati = datiSalvati(azienda.datiSocietari);
  return Object.fromEntries(CAMPI_DATI.map((key) => [key, salvati?.[key] ?? ''])) as Record<
    keyof DatiSocietari,
    string
  >;
}

export interface VistaSezione {
  sezione: SezioneImpostazioni;
  aziende: AziendaImpostabile[];
  azienda: AziendaImpostabile;
  ordine?: SectionKey[];
  modificato?: boolean;
  focus?: { key: SectionKey; verso: Verso } | null;
  error?: string | null;
  dati?: { values: Record<string, string>; errors: Partial<Record<string, string>> };
  ruoli?: { values: Record<string, string | string[]>; errors: Partial<Record<string, string>> };
  preventivi?: { valore: string; errore: boolean };
  /** Раздел „Chiavi API“ — ключовете на фирмата и новият (показан веднъж). */
  chiaviApi?: unknown;
  chiaveNuova?: string | null;
  erroreChiave?: string | null;
  /** Раздел „Condizioni“ — приемането и правилата на хората (routes/impostazioni.ts). */
  condizioni?: unknown;
  /** Раздел „Firme“ — информацията по чл. 13 на страницата на подписа (routes/impostazioni-firme.ts). */
  informativa?: { valore: string; propria: boolean; errore: boolean };
  /** Раздел „Fornitori“ — адресникът за поръчките (routes/impostazioni-flusso.ts). */
  fornitori?: Array<{ id: string; nome: string; email: string }>;
  nuovoFornitore?: { nome: string; email: string; errore: boolean };
  /** Раздел „Buono di lavoro“ — кодът на модула и клаузата (routes/impostazioni-buono.ts). */
  buono?: { values: { codice: string; clausola: string }; errors: Record<string, string> };
  /** Раздел „Accesso“ — директорията и домейнът, свързаните хора (routes/impostazioni-accesso.ts). */
  esterni?: {
    values: { microsoft: string; google: string };
    errors: Partial<Record<Fornitore, string>>;
    collegati: Partial<Record<Fornitore, number>>;
  };
}

/** Страницата на един раздел — всичко, което частта му чете, с подразбиране от записаното. */
export function renderImpostazioni(res: Response, status: number, view: VistaSezione): void {
  const { azienda } = view;
  res.status(status).render('impostazioni/sezione', {
    sezioni: sezioniDi(azienda),
    icone: ICONE_SEZIONI,
    ordine: ordineEffettivo(azienda.ordineSezioni),
    modificato: false,
    focus: null,
    error: null,
    fisse: FISSE,
    dati: { values: datiForm(azienda), errors: {} },
    campiDati: CAMPI_DATI,
    modelli: MODELLI_ID.map((id) => {
      const modello = MODELLI.get(id)!;
      return { id, titolo: modello.titolo, ...misuraVista(modello) };
    }),
    modello: modelloDi(azienda.cartelloModello).id,
    ruoli: { values: ruoliForm(azienda), errors: {} },
    ruoliAzienda: RUOLI_AZIENDA,
    ruoliConfigurabili: RUOLI_CONFIGURABILI,
    capacita: CAPACITA_CONFIGURABILI.filter((c) => !capacitaNascoste(azienda).includes(c)),
    condizioni: null,
    fornitori: [],
    nuovoFornitore: { nome: '', email: '', errore: false },
    buono: {
      values: { codice: azienda.buonoCodice ?? '', clausola: azienda.buonoClausola ?? '' },
      errors: {},
    },
    preventivi: { valore: azienda.preventivoCondizioni ?? '', errore: false },
    fornitoriEsterni: fornitoriConfigurati(),
    esterni: {
      values: { microsoft: azienda.accessoMicrosoft ?? '', google: azienda.accessoGoogle ?? '' },
      errors: {},
      collegati: {},
    },
    chiaviApi: [],
    chiaveNuova: null,
    erroreChiave: null,
    publicBase: config().PUBLIC_BASE_URL,
    maxCondizioniPreventivo: MAX_CONDIZIONI,
    maxCodice: 80,
    maxClausola: 1000,
    informativa: {
      valore: azienda.informativaFirme ?? modelloInformativa(azienda),
      propria: azienda.informativaFirme !== null,
      errore: false,
    },
    ...view,
  });
}

export function notFound(req: Request, res: Response): void {
  sendError(req, res, 404, 'error.notFoundTitle', 'error.notFound');
}
