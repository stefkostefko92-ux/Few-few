import type { Request, Response } from 'express';
import { principalOf } from '../auth/guards.js';
import { canIn, canInPerTogliere, intersezioneScope, scopeFor } from '../auth/scope.js';
import { prisma } from '../db.js';
import type { PreventivoFull } from '../preventivi/elenco.js';
import { getPreventivo } from '../preventivi/elenco.js';
import { indiciRighe, MAX, MAX_INDICE, MAX_RIGHE } from '../preventivi/form.js';
import { ALIQUOTE } from '../preventivi/importi.js';
import type { FieldErrorCode, FormValues } from '../schede/field-parsers.js';
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

/**
 * Фирмите за нова оферта или нов клиент: MASTER — активните с включени оферти (`choices`) и отделно активните с
 * изключени (`spente`: във формата са в своя група, а изборът им казва това и предлага да се включат — собственикът,
 * 16 ноември 2026: „не мога да избера фирма … от мастър акаунта“; преди тях нямаше никъде, а без нито една включена
 * формата нямаше поле за фирма); другите — тези с право на запис, без `spente`. Запис за фирма от `spente` няма.
 */
export async function aziendePerPreventivo(req: Request) {
  const user = principalOf(req).user;
  const writable = scopeFor(user, 'preventivi:write');
  const tutte = writable.all
    ? await prisma.azienda.findMany({
        where: { deactivatedAt: null },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, preventiviAttivi: true },
      })
    : null;
  const choices = writable.all
    ? (tutte ?? []).filter((a) => a.preventiviAttivi).map(({ id, name }) => ({ id, name }))
    : user.memberships
        .filter((m) => writable.aziendaIds.includes(m.aziendaId))
        .map((m) => ({ id: m.aziendaId, name: m.aziendaName }));
  const spente =
    tutte && user.master
      ? tutte.filter((a) => !a.preventiviAttivi).map(({ id, name }) => ({ id, name }))
      : [];
  const only = !user.master && choices.length === 1 ? choices[0]! : null;
  return { choices: only ? [] : choices, only, spente };
}

/**
 * Фирмата, избрана във формата: от `choices` (или единствената), иначе — при MASTER — от `spente` (тогава
 * формата казва, че офертите ѝ са изключени, и предлага ключа); другото — празно.
 */
export function aziendaScelta(
  scelte: {
    choices: Array<{ id: string }>;
    only: { id: string } | null;
    spente: Array<{ id: string }>;
  },
  voluta: unknown,
): string {
  if (scelte.only) return scelte.only.id;
  const id = typeof voluta === 'string' ? voluta : '';
  if (id && (scelte.choices.some((a) => a.id === id) || scelte.spente.some((a) => a.id === id)))
    return id;
  return scelte.choices.length === 1 ? scelte.choices[0]!.id : '';
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

/** Грешките на формата: на полетата — и `spente` на фирмата (MASTER е избрал фирма с изключени оферти). */
export type ErroriForm = Partial<Record<string, FieldErrorCode | 'spente'>>;

export interface PreventivoFormView {
  preventivo: PreventivoFull | null;
  values: FormValues;
  errors: ErroriForm;
  base: string;
  aziende: Array<{ id: string; name: string }>;
  /** MASTER: активните фирми с изключени оферти — в своя група на избора (`aziendePerPreventivo`). */
  spente?: Array<{ id: string; name: string }>;
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
    spente: [],
    scripts: ['preventivo', 'preventivo-cliente', 'offerte-spente'],
    ...view,
  });
}
