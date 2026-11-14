import type { Request, Response } from 'express';
import { principalOf } from '../auth/guards.js';
import { canIn, canInPerTogliere, intersezioneScope, scopeFor } from '../auth/scope.js';
import { prisma } from '../db.js';
import type { PreventivoFull } from '../preventivi/elenco.js';
import { getPreventivo } from '../preventivi/elenco.js';
import {
  indiciRighe,
  MAX,
  MAX_INDICE,
  MAX_RIGHE,
  type ErroriPreventivo,
} from '../preventivi/form.js';
import { ALIQUOTE } from '../preventivi/importi.js';
import type { FormValues } from '../schede/field-parsers.js';
import type { Ricerca, SchedaScelta } from './cartelli-nuovo.js';

/**
 * Общото на страниците на офертите: зареждането в обхвата, кой пише, фирмите за нова оферта, картите, от
 * които може да се попълни, и формата. Правата — `preventivi:read` / `preventivi:write` (само във фирма, в
 * която MASTER е включил офертите — `scope.ts`); чужда оферта — 404.
 */

/** Офертата в обхвата за четене — по адреса (`:id`) или по дадения id (`?da=` на „Duplica“). */
export const loadPreventivo = (req: Request, id: string = String(req.params.id)) =>
  getPreventivo(scopeFor(principalOf(req).user, 'preventivi:read'), id);

export const puoScrivere = (req: Request, row: { aziendaId: string }): boolean =>
  canIn(principalOf(req).user, 'preventivi:write', row.aziendaId);
/**
 * Кой работи с офертата — сменя изхода, праща я на клиента, дублира я, слага клиента в анаграфиката: пишещият
 * във фирмата И фирмата с включени оферти. В архива (условията 2026-11-15, 2.5 и A.9) членовете не пишат изобщо
 * (scope.ts), а MASTER само поправя записаното по писмено указание на фирмата — не праща, не сменя изхода и не
 * създава нищо (ревюто на Кодаджията, 14 ноември 2026).
 */
export const puoOperare = (
  req: Request,
  row: { aziendaId: string; azienda: { preventiviAttivi: boolean } },
): boolean => row.azienda.preventiviAttivi && puoScrivere(req, row);
/** Изтриването на чернова остава и при изтекъл абонамент (условията, чл. 12.5 в) — auth/scope.ts. */
export const puoTogliere = (req: Request, row: { aziendaId: string }): boolean =>
  canInPerTogliere(principalOf(req).user, 'preventivi:write', row.aziendaId);

/**
 * Фирмите на човека, в които офертите са изключени, а данните им остават за четене (архив — auth/scope.ts):
 * бележката над страниците казва защо няма „Nuovo“ и „Modifica“. `aziendaId` — само тази фирма.
 */
export function aziendeInArchivio(req: Request, aziendaId?: string): string[] {
  const user = principalOf(req).user;
  return user.memberships
    .filter(
      (m) =>
        m.preventiviArchivio === true &&
        (aziendaId === undefined || m.aziendaId === aziendaId) &&
        canIn(user, 'preventivi:read', m.aziendaId),
    )
    .map((m) => m.aziendaName);
}

/** Фирмите за нова оферта: MASTER — активните с включени оферти; другите — тези с право на запис. */
export async function aziendePerPreventivo(req: Request) {
  const user = principalOf(req).user;
  const writable = scopeFor(user, 'preventivi:write');
  const choices = writable.all
    ? await prisma.azienda.findMany({
        where: { deactivatedAt: null, preventiviAttivi: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      })
    : user.memberships
        .filter((m) => writable.aziendaIds.includes(m.aziendaId))
        .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
  const only = !user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only };
}

/** Картите, от които човекът може да попълни оферта: вижда ги и пише оферти в тяхната фирма. */
export const fonteSchede = (req: Request) => {
  const user = principalOf(req).user;
  return intersezioneScope(scopeFor(user, 'schede:read'), scopeFor(user, 'preventivi:write'));
};

/** Условията по подразбиране на фирмата (настройките) — за нова оферта. */
export async function condizioniDi(aziendaId: string): Promise<string | null> {
  const row = await prisma.azienda.findUnique({
    where: { id: aziendaId },
    select: { preventivoCondizioni: true },
  });
  return row?.preventivoCondizioni ?? null;
}

export interface PreventivoFormView {
  preventivo: PreventivoFull | null;
  values: FormValues;
  errors: ErroriPreventivo;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  azienda: string;
  conflict?: boolean;
  scheda?: SchedaScelta | null;
  ricerca?: Ricerca | null;
  puoCercare?: boolean;
}

/** Колко празни реда има формата без JavaScript (с него — „Aggiungi una riga“). */
const RIGHE_VUOTE = 3;

function righeForm(values: FormValues): number[] {
  const piene = indiciRighe(values);
  const prossimo = piene.length ? piene.at(-1)! + 1 : 0;
  const vuote = Math.max(0, Math.min(RIGHE_VUOTE, MAX_RIGHE - piene.length, MAX_INDICE - prossimo));
  return [...piene, ...Array.from({ length: vuote }, (_, i) => prossimo + i)];
}

export function renderPreventivoForm(
  res: Response,
  status: number,
  view: PreventivoFormView,
): void {
  const righe = righeForm(view.values);
  res.status(status).render('preventivi/form', {
    titleKey: view.preventivo ? 'preventivi.modifica' : 'preventivi.new',
    righe,
    prossimo: righe.length ? righe.at(-1)! + 1 : 0,
    maxRighe: MAX_RIGHE,
    maxIndice: MAX_INDICE,
    max: MAX,
    aliquote: ALIQUOTE,
    scheda: null,
    ricerca: null,
    puoCercare: false,
    scripts: ['preventivo', 'preventivo-cliente'],
    ...view,
  });
}
