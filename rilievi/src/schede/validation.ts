import { z } from 'zod';
import type {
  ArganoMarca,
  QuadroMarca,
  TelesoccorsoStato,
  TipoImpianto,
  TipoPorte,
  UbicazioneMacchina,
} from '@prisma/client';
import { SLOTS } from '../ordini/registry.js';
import { moduloFromBody, parseModulo, type ModuloDati } from '../ordini/valori.js';
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
    ubicazioneCassettina: textOf('ubicazioneCassettina'),
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
    quadroMarca: choiceOf<QuadroMarca>('quadroMarca'),
    quadroMarcaAltro: textOf('quadroMarcaAltro'),
    quadroOrdine: yesNoOf('quadroOrdine'),
    arganoMarca: choiceOf<ArganoMarca>('arganoMarca'),
    arganoMarcaAltro: textOf('arganoMarcaAltro'),
    arganoPreventivo: yesNoOf('arganoPreventivo'),
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

/**
 * Полетата на картата + мерките на старите бутониери (по спирки, misure.ts) + модулите на доставчиците
 * (src/ordini/) — всеки само при „Sì“ на своя въпрос, иначе null — и дали печатът и PDF-ът на картата
 * включват попълненото в модулите.
 */
export type SchedaData = z.output<typeof schedaSchema> & {
  misureBottoniere: MisuraData[];
  ordineQuadro: ModuloDati | null;
  preventivoArgano: ModuloDati | null;
  riepilogoOrdini: boolean;
};

/** Отметката „Includi quadro e argano nella stampa“: „1“ или нищо — всичко друго е подправено. */
const riepilogoSchema = z.preprocess(
  (value) => (value === undefined || value === '' ? false : value),
  z.union([z.literal(false), z.literal('1').transform(() => true)], {
    errorMap: () => ({ message: 'invalid' }),
  }),
);
export const RIEPILOGO_KEY = 'riepilogoOrdini';

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
  // Модулите на доставчиците: само когато въпросът им се вижда и отговорът е „Sì“.
  const moduli = SLOTS.map((slot) =>
    active.has(slot.question) && raw[slot.question] === 'si'
      ? parseModulo(slot.modulo, slot.prefix, raw)
      : null,
  );
  const riepilogo = riepilogoSchema.safeParse(raw[RIEPILOGO_KEY]);
  const extraErrors: FieldErrors = Object.assign(
    {},
    misure?.errors,
    ...moduli.map((modulo) => modulo?.errors ?? {}),
    riepilogo.success ? {} : { [RIEPILOGO_KEY]: 'invalid' },
  );

  const parsed = schedaSchema.safeParse(input);
  if (parsed.success && riepilogo.success && Object.keys(extraErrors).length === 0) {
    const dati = (column: string) => moduli[SLOTS.findIndex((s) => s.column === column)]?.dati;
    return {
      ok: true,
      data: {
        ...parsed.data,
        misureBottoniere: misure?.rows ?? [],
        ordineQuadro: dati('ordineQuadro') ?? null,
        preventivoArgano: dati('preventivoArgano') ?? null,
        riepilogoOrdini: riepilogo.data,
      },
    };
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
  return { ok: false, errors: { ...errors, ...extraErrors } };
}

export function formValuesFromBody(body: unknown): FormValues {
  const source = asRecord(body);
  const values: FormValues = misureFromBody(source);
  for (const slot of SLOTS) Object.assign(values, moduloFromBody(slot.modulo, slot.prefix, source));
  values[RIEPILOGO_KEY] = source[RIEPILOGO_KEY] === '1' ? '1' : '';
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
