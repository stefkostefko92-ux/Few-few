import type { Request, Response } from 'express';
import { principalOf } from '../auth/guards.js';
import { canIn, scopeFor } from '../auth/scope.js';
import { aziendeImpostabili } from '../aziende/sezioni.js';
import { prisma } from '../db.js';
import { MAX } from '../preventivi/form.js';
import { ALIQUOTE, euro } from '../preventivi/importi.js';
import { listListino, MAX_VOCI, type ErroriVoce } from '../preventivi/listino.js';
import type { ErroreImport, ErroreRiga, RigaImport } from '../preventivi/listino-import.js';
import type { PianoImport } from '../preventivi/listino-import-salva.js';
import { pageOf } from '../schede/list.js';
import { MAX_QUERY_LENGTH } from '../schede/search.js';
import { pathSezione, renderImpostazioni } from './impostazioni-vista.js';
import { notFound } from './schede-shared.js';

/**
 * Ценоразписът на две места с едно и също съдържание (собственикът, 13 ноември 2026 — „направи го от
 * impostazioni“): раздел „Listino prezzi“ на настройките (който управлява настройките на фирмата) и
 * страницата `/preventivi/listino` (който пише офертите ѝ, без да управлява настройките). Записите са едни —
 * под `/preventivi/listino…`, по способността `preventivi:write`; откъде е дошъл човекът (`da`) решава само
 * къде се връща и коя страница вижда при грешка.
 */

export type Provenienza = 'impostazioni' | 'preventivi';

/** Колко грешки и колко реда от прегледа се показват — останалото е число. */
export const ERRORI_MOSTRATI = 20;
export const RIGHE_ANTEPRIMA = 10;

export interface VistaImport {
  testo: string;
  unita: string;
  iva: string;
  errore: ErroreImport | 'pieno' | null;
  /** При `ambigue`: двете заглавия за едно и също поле. */
  dettaglio: string | null;
  errori: ErroreRiga[];
  /** Грешките над показаните. */
  altri: number;
  anteprima: { piano: PianoImport; righe: RigaImport[]; totale: number } | null;
  /** Отпечатъкът на прегледаното — „Conferma“ го връща; `cambiato` — потвърдено е друго, показан е нов преглед. */
  impronta: string;
  cambiato: boolean;
  /** При `pieno`: колко реда би имал ценоразписът. */
  dopo?: number;
}

export interface StatoListino {
  values?: Record<string, string>;
  errors?: ErroriVoce;
  importa?: VistaImport;
}

/** Фирмите с видими оферти за човека (MASTER — всички активни с включени оферти). */
export async function aziendeListino(req: Request) {
  const user = principalOf(req).user;
  const s = scopeFor(user, 'preventivi:read');
  if (s.all)
    return prisma.azienda.findMany({
      where: { deactivatedAt: null, preventiviAttivi: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  return user.memberships
    .filter((m) => s.aziendaIds.includes(m.aziendaId))
    .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
}

export async function aziendaScelta(req: Request, raw: unknown) {
  const aziende = await aziendeListino(req);
  const azienda = aziende.find((a) => a.id === raw) ?? aziende[0] ?? null;
  return { aziende, azienda };
}

export const puoScrivere = (req: Request, aziendaId: string): boolean =>
  canIn(principalOf(req).user, 'preventivi:write', aziendaId);

/** Фирмата, ако човекът управлява настройките ѝ и офертите ѝ са включени; иначе null. */
async function impostabile(req: Request, aziendaId: string) {
  const aziende = await aziendeImpostabili(principalOf(req).user);
  const azienda = aziende.find((a) => a.id === aziendaId && a.preventiviAttivi);
  return azienda ? { aziende, azienda } : null;
}

/** „От настройките“ важи само за човек, който наистина управлява настройките на тази фирма. */
export async function provenienzaDi(
  req: Request,
  raw: unknown,
  aziendaId: string,
): Promise<Provenienza> {
  return raw === 'impostazioni' && (await impostabile(req, aziendaId)) !== null
    ? 'impostazioni'
    : 'preventivi';
}

/** Къде се управлява ценоразписът на фирмата за този човек — настройките, ако ги управлява. */
export async function gestioneListino(req: Request, aziendaId: string): Promise<string> {
  return tornaA((await impostabile(req, aziendaId)) ? 'impostazioni' : 'preventivi', aziendaId);
}

export const tornaA = (da: Provenienza, aziendaId: string): string =>
  da === 'impostazioni'
    ? pathSezione('listino', aziendaId)
    : `/preventivi/listino?azienda=${encodeURIComponent(aziendaId)}`;

/** Всичко, което общата част на страницата чете (`views/preventivi/_listino-gestione.ejs`). */
export async function datiListino(req: Request, aziendaId: string, stato: StatoListino = {}) {
  const query =
    typeof req.query.q === 'string' ? req.query.q.trim().slice(0, MAX_QUERY_LENGTH) : '';
  return {
    page: await listListino(aziendaId, query, pageOf(req.query.p)),
    query,
    scrive: puoScrivere(req, aziendaId),
    values: stato.values ?? { iva: '22' },
    errors: stato.errors ?? {},
    importa: stato.importa ?? null,
    max: MAX,
    maxVoci: MAX_VOCI,
    aliquote: ALIQUOTE,
    euro,
  };
}

/** Страницата на ценоразписа там, откъдето е дошъл човекът. */
export async function mostraListino(
  req: Request,
  res: Response,
  status: number,
  view: StatoListino & { aziendaId: unknown; da: Provenienza },
): Promise<void> {
  if (view.da === 'impostazioni' && typeof view.aziendaId === 'string') {
    const trovata = await impostabile(req, view.aziendaId);
    if (trovata)
      return renderImpostazioni(res, status, {
        sezione: 'listino',
        ...trovata,
        listino: await datiListino(req, trovata.azienda.id, view),
      });
  }
  const { aziende, azienda } = await aziendaScelta(req, view.aziendaId);
  if (!azienda) return notFound(req, res);
  res.status(status).render('preventivi/listino', {
    titleKey: 'preventivi.listino.titolo',
    aziende,
    azienda,
    listino: await datiListino(req, azienda.id, view),
  });
}
