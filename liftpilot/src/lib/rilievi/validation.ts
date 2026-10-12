// The check of the sheet's form. The fields with a condition (fields.ts, `when`) that make no sense with the values sent
// are not read at all: they are kept as null and give no error the person cannot see (the hidden "Numero serrature"
// with "Serrature: No"). Ported 1:1 from rilievi (src/schede/validation.ts).
import { z } from 'zod';
import type {
  RilievoArganoMarca,
  RilievoQuadroMarca,
  RilievoTelesoccorsoStato,
  RilievoTipoImpianto,
  RilievoTipoPorte,
  RilievoUbicazioneMacchina,
} from '@prisma/client';
import { SLOTS } from './ordini/registry';
import { moduloFromBody, parseModulo, type ModuloDati } from './ordini/valori';
import { activeFields, FIELDS, IDENTIFIERS, IDENTIFIERS_ERROR_KEY } from './fields';
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
} from './field-parsers';
import { misureCount, misureFromBody, parseMisure, type MisuraData } from './misure';

export type { FieldErrorCode, FieldErrors, FormValues } from './field-parsers';

export { IDENTIFIERS_ERROR_KEY } from './fields';

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
    ubicazioneMacchina: checksOf<RilievoUbicazioneMacchina>('ubicazioneMacchina'),
    ubicazioneCassettina: intOf('ubicazioneCassettina'),
    parcheggio: textOf('parcheggio'),
    tipoImpianto: checksOf<RilievoTipoImpianto>('tipoImpianto'),
    tipoPorte: checksOf<RilievoTipoPorte>('tipoPorte'),
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
    telesoccorsoStato: choiceOf<RilievoTelesoccorsoStato>('telesoccorsoStato'),
    allarmePortineria: yesNoOf('allarmePortineria'),
    displayPortineria: yesNoOf('displayPortineria'),
    noteQuadretto: textOf('noteQuadretto'),
    noteImpianto: textOf('noteImpianto'),
    noteBottoniere: textOf('noteBottoniere'),
    bottoniereMisure: yesNoOf('bottoniereMisure'),
    lavoriExtra: textOf('lavoriExtra'),
    quadroMarca: choiceOf<RilievoQuadroMarca>('quadroMarca'),
    quadroMarcaAltro: textOf('quadroMarcaAltro'),
    quadroOrdine: yesNoOf('quadroOrdine'),
    arganoMarca: choiceOf<RilievoArganoMarca>('arganoMarca'),
    arganoMarcaAltro: textOf('arganoMarcaAltro'),
    arganoPreventivo: yesNoOf('arganoPreventivo'),
  })
  .superRefine((value, ctx) => {
    if (IDENTIFIERS.every((key) => value[key] === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [IDENTIFIERS_ERROR_KEY], message: 'identifierNeeded' });
    }
  });

/**
 * The fields of the sheet + the measurements of the old push-button panels (per stop, misure.ts) + the suppliers'
 * modules (ordini/) — each only with "Sì" on its question, otherwise null.
 */
export type SchedaData = z.output<typeof schedaSchema> & {
  misureBottoniere: MisuraData[];
  ordineQuadro: ModuloDati | null;
  preventivoArgano: ModuloDati | null;
};

const asRecord = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

export function parseScheda(body: unknown): { ok: true; data: SchedaData } | { ok: false; errors: FieldErrors } {
  const raw = asRecord(body);
  const active = activeFields((key) => raw[key]);
  // Only the fields that make sense; a missing one is empty (null) — and so the record keeps it.
  const input = Object.fromEntries(FIELDS.filter((field) => active.has(field.key)).map((field) => [field.key, raw[field.key]]));
  // The measurements per stop: with "Sì" and a number of stops within the bounds (otherwise there are no rows).
  const misure = raw.bottoniereMisure === 'si' ? parseMisure(raw, misureCount(raw.fermate)) : null;
  // The suppliers' modules: only when their question is shown and the answer is "Sì".
  const moduli = SLOTS.map((slot) => (active.has(slot.question) && raw[slot.question] === 'si' ? parseModulo(slot.modulo, slot.prefix, raw) : null));
  const extraErrors: FieldErrors = Object.assign({}, misure?.errors, ...moduli.map((modulo) => modulo?.errors ?? {}));

  const parsed = schedaSchema.safeParse(input);
  if (parsed.success && Object.keys(extraErrors).length === 0) {
    const dati = (column: string) => moduli[SLOTS.findIndex((s) => s.column === column)]?.dati;
    return {
      ok: true,
      data: {
        ...parsed.data,
        misureBottoniere: misure?.rows ?? [],
        ordineQuadro: dati('ordineQuadro') ?? null,
        preventivoArgano: dati('preventivoArgano') ?? null,
      },
    };
  }
  const errors: FieldErrors = {};
  for (const issue of parsed.success ? [] : parsed.error.issues) {
    const key = String(issue.path[0] ?? IDENTIFIERS_ERROR_KEY);
    if (errors[key]) continue;
    errors[key] = (ERROR_CODES.has(issue.message) ? issue.message : 'invalid') as FieldErrorCode;
  }
  // zod does not reach the check of the whole object while a field is wrong — without this the person would fix the
  // numbers and only then learn that the address is missing. Every error comes at once.
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
