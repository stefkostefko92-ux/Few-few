import { z } from 'zod';
import type {
  TelesoccorsoStato,
  TipoImpianto,
  TipoPorte,
  UbicazioneMacchina,
} from '@prisma/client';
import { activeFields, FIELDS, IDENTIFIERS } from './fields.js';
import {
  checksOf,
  choiceOf,
  dateOf,
  decimalOf,
  digitsOf,
  ERROR_CODES,
  intOf,
  textOf,
  yesNoOf,
  type FieldErrorCode,
  type FieldErrors,
  type FormValues,
} from './field-parsers.js';
import { misureCount, misureFromBody, parseMisure, type MisuraData } from './misure.js';

export type { FieldErrorCode, FieldErrors, FormValues } from './field-parsers.js';

/**
 * Проверката на формата на схемата. Полетата с условие (fields.ts, `when`), които нямат смисъл при
 * пратените стойности, не се четат изобщо: пазят се като null и не дават грешка, която човекът не
 * вижда (скритото поле „Numero serrature“ при „Serrature: No“).
 */

/** Ключът на формата за грешката „поне едно от адрес / матрикула / номер“. */
export const IDENTIFIERS_ERROR_KEY = 'identifiers';

export const schedaSchema = z
  .object({
    data: dateOf('data'),
    indirizzo: textOf('indirizzo'),
    marca: textOf('marca'),
    matricola: digitsOf('matricola'),
    numeroImpianto: digitsOf('numeroImpianto'),
    buonoLavoro: textOf('buonoLavoro'),
    portataKg: intOf('portataKg'),
    capienzaPersone: intOf('capienzaPersone'),
    fermate: intOf('fermate'),
    ubicazioneMacchina: checksOf<UbicazioneMacchina>('ubicazioneMacchina'),
    ubicazioneCassettina: intOf('ubicazioneCassettina'),
    parcheggio: textOf('parcheggio'),
    tipoImpianto: checksOf<TipoImpianto>('tipoImpianto'),
    tipoPorte: checksOf<TipoPorte>('tipoPorte'),
    operatoreMarca: textOf('operatoreMarca'),
    lucePorte: textOf('lucePorte'),
    operatoreTensione: textOf('operatoreTensione'),
    doppioAccesso: yesNoOf('doppioAccesso'),
    bloccaPortine: yesNoOf('bloccaPortine'),
    autolivellamento: yesNoOf('autolivellamento'),
    pattinoRetrattile: yesNoOf('pattinoRetrattile'),
    pattinoRetrattileNumero: intOf('pattinoRetrattileNumero'),
    serrature: yesNoOf('serrature'),
    serratureNumero: intOf('serratureNumero'),
    serratureTipo: textOf('serratureTipo'),
    luceVanoSostituire: yesNoOf('luceVanoSostituire'),
    funiDiametroMm: decimalOf('funiDiametroMm'),
    funiTrefoli: intOf('funiTrefoli'),
    funiNumero: intOf('funiNumero'),
    funiLunghezzaM: decimalOf('funiLunghezzaM'),
    limitatoreTipo: textOf('limitatoreTipo'),
    funicellaDiametroMm: decimalOf('funicellaDiametroMm'),
    funicellaLunghezzaM: decimalOf('funicellaLunghezzaM'),
    tenditore: textOf('tenditore'),
    caviNumero: intOf('caviNumero'),
    caviConduttori: intOf('caviConduttori'),
    caviLunghezzaM: decimalOf('caviLunghezzaM'),
    telesoccorso: yesNoOf('telesoccorso'),
    telesoccorsoStato: choiceOf<TelesoccorsoStato>('telesoccorsoStato'),
    allarmePortineria: yesNoOf('allarmePortineria'),
    displayPortineria: yesNoOf('displayPortineria'),
    noteQuadretto: textOf('noteQuadretto'),
    noteImpianto: textOf('noteImpianto'),
    noteBottoniere: textOf('noteBottoniere'),
    bottoniereMisure: yesNoOf('bottoniereMisure'),
    lavoriExtra: textOf('lavoriExtra'),
  })
  .superRefine((value, ctx) => {
    if (IDENTIFIERS.every((key) => value[key] === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [IDENTIFIERS_ERROR_KEY],
        message: 'identifierNeeded',
      });
    }
  });

/** Полетата на картата + мерките на старите бутониери (по спирки, misure.ts). */
export type SchedaData = z.output<typeof schedaSchema> & { misureBottoniere: MisuraData[] };

const asRecord = (body: unknown): Record<string, unknown> =>
  body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

export function parseScheda(
  body: unknown,
): { ok: true; data: SchedaData } | { ok: false; errors: FieldErrors } {
  const raw = asRecord(body);
  const active = activeFields((key) => raw[key]);
  // Само полетата със смисъл; липсващото е празно (null) — така и записът го пази.
  const input = Object.fromEntries(
    FIELDS.filter((field) => active.has(field.key)).map((field) => [field.key, raw[field.key]]),
  );
  // Мерките по спирки: при „Sì“ и брой спирки в границите (иначе редове няма).
  const misure = raw.bottoniereMisure === 'si' ? parseMisure(raw, misureCount(raw.fermate)) : null;

  const parsed = schedaSchema.safeParse(input);
  if (parsed.success && (!misure || Object.keys(misure.errors).length === 0)) {
    return { ok: true, data: { ...parsed.data, misureBottoniere: misure?.rows ?? [] } };
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const key = String(issue.path[0] ?? IDENTIFIERS_ERROR_KEY);
    if (errors[key]) continue;
    errors[key] = (ERROR_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
  }
  // zod не стига до проверката на целия обект, докато някое поле е грешно — без това човекът би
  // поправил числата и чак тогава би научил, че липсва адрес. Всички грешки идват наведнъж.
  const hasIdentifier = IDENTIFIERS.some((key) => {
    const value = raw[key];
    return typeof value === 'string' && value.trim() !== '';
  });
  if (!hasIdentifier) errors[IDENTIFIERS_ERROR_KEY] ??= 'identifierNeeded';
  return { ok: false, errors: { ...errors, ...misure?.errors } };
}

export function formValuesFromBody(body: unknown): FormValues {
  const source = asRecord(body);
  const values: FormValues = misureFromBody(source);
  for (const field of FIELDS) {
    const raw = source[field.key];
    if (field.kind === 'checks') {
      const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
      values[field.key] = list.filter((v): v is string => typeof v === 'string').slice(0, 10);
    } else {
      values[field.key] = typeof raw === 'string' ? raw.slice(0, 5000) : '';
    }
  }
  return values;
}
