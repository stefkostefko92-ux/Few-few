// The check of the sheet's form. The fields with a condition (fields.ts, `when`) that make no sense with the values sent
// are not read at all: they are kept as null and give no error the person cannot see (the hidden "Numero serrature"
// with "Serrature: No"); a field of a hidden section the same («Argano» with a hydraulic lift). Ported 1:1 from rilievi
// (src/schede/validation.ts, commit 988f3cf37).
import { z } from 'zod';
import type {
  RilievoQuadroMarca,
  RilievoQuadroModello,
  RilievoTipoImpianto,
  RilievoTipoPorte,
  RilievoUbicazioneMacchina,
} from '@prisma/client';
import { AUTO_KEY } from './ordini/collegamenti';
import { modelloMancante, slotAperto, SLOTS } from './ordini/registry';
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
import { RIEPILOGO_KEY, riepilogoFromBody, riepilogoSchema, STAMPA_KEY, sezioniEscluseDi, stampaFromBody } from './stampa';

export type { FieldErrorCode, FieldErrors, FormValues } from './field-parsers';

export { IDENTIFIERS_ERROR_KEY } from './fields';

/** The power unit of a hydraulic lift (fields-centralina.ts). */
const centralinaSchema = {
  centralinaDaFare: yesNoOf('centralinaDaFare'),
  centralinaMarca: textOf('centralinaMarca'),
  emendamentoA3: yesNoOf('emendamentoA3'),
  tuboFlessibile: yesNoOf('tuboFlessibile'),
  tuboFlessibileDiametroMm: decimalOf('tuboFlessibileDiametroMm'),
  tuboFlessibileLunghezzaM: decimalOf('tuboFlessibileLunghezzaM'),
  tuboFlessibileNote: textOf('tuboFlessibileNote'),
  centralinaNote: textOf('centralinaNote'),
};

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
    ubicazioneCassettina: textOf('ubicazioneCassettina'),
    parcheggio: textOf('parcheggio'),
    tipoImpianto: checksOf<RilievoTipoImpianto>('tipoImpianto'),
    tipoPorte: checksOf<RilievoTipoPorte>('tipoPorte'),
    doppioAccesso: yesNoOf('doppioAccesso'),
    serrature: yesNoOf('serrature'),
    serratureNumero: intOf('serratureNumero'),
    serratureTipo: textOf('serratureTipo'),
    pattinoRetrattile: yesNoOf('pattinoRetrattile'),
    pattinoRetrattileTipo: textOf('pattinoRetrattileTipo'),
    sospensioni: yesNoOf('sospensioni'),
    sospensioniNumero: intOf('sospensioniNumero'),
    serratureNote: textOf('serratureNote'),
    luceVanoSostituire: yesNoOf('luceVanoSostituire'),
    luceVanoNote: textOf('luceVanoNote'),
    funiDiametroMm: decimalOf('funiDiametroMm'),
    funiTrefoli: intOf('funiTrefoli'),
    funiNumero: intOf('funiNumero'),
    funiLunghezzaM: decimalOf('funiLunghezzaM'),
    tirantiCabinaNumero: intOf('tirantiCabinaNumero'),
    tirantiCabinaTipo: textOf('tirantiCabinaTipo'),
    tirantiContrappesoNumero: intOf('tirantiContrappesoNumero'),
    tirantiContrappesoTipo: textOf('tirantiContrappesoTipo'),
    tirantiFossaNumero: intOf('tirantiFossaNumero'),
    tirantiFossaTipo: textOf('tirantiFossaTipo'),
    limitatoreTipo: textOf('limitatoreTipo'),
    funicellaDiametroMm: decimalOf('funicellaDiametroMm'),
    funicellaLunghezzaM: decimalOf('funicellaLunghezzaM'),
    tenditore: textOf('tenditore'),
    caviNumero: intOf('caviNumero'),
    caviConduttori: intOf('caviConduttori'),
    caviLunghezzaM: decimalOf('caviLunghezzaM'),
    allarmePortineria: yesNoOf('allarmePortineria'),
    displayPortineria: yesNoOf('displayPortineria'),
    telesoccorsoInstallare: yesNoOf('telesoccorsoInstallare'),
    perifericaInstallare: yesNoOf('perifericaInstallare'),
    cornettaInstallare: yesNoOf('cornettaInstallare'),
    noteQuadretto: textOf('noteQuadretto'),
    noteImpianto: textOf('noteImpianto'),
    noteBottoniere: textOf('noteBottoniere'),
    bottoniereMisure: yesNoOf('bottoniereMisure'),
    lavoriExtra: textOf('lavoriExtra'),
    quadroMarca: choiceOf<RilievoQuadroMarca>('quadroMarca'),
    quadroMarcaAltro: textOf('quadroMarcaAltro'),
    quadroModello: choiceOf<RilievoQuadroModello>('quadroModello'),
    fossaRidotta: yesNoOf('fossaRidotta'),
    testataRidotta: yesNoOf('testataRidotta'),
    quadroOrdine: yesNoOf('quadroOrdine'),
    quadroNote: textOf('quadroNote'),
    arganoPreventivo: yesNoOf('arganoPreventivo'),
    arganoTipo: textOf('arganoTipo'),
    ganasceFreno: yesNoOf('ganasceFreno'),
    kitControlloGanasce: yesNoOf('kitControlloGanasce'),
    kitControlloGanasceTipo: textOf('kitControlloGanasceTipo'),
    controlloQuadro: yesNoOf('controlloQuadro'),
    controlloQuadroTipo: textOf('controlloQuadroTipo'),
    arganoNote: textOf('arganoNote'),
    ...centralinaSchema,
  })
  .superRefine((value, ctx) => {
    if (IDENTIFIERS.every((key) => value[key] === null)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [IDENTIFIERS_ERROR_KEY], message: 'identifierNeeded' });
    }
  });

/**
 * The fields of the sheet + the measurements of the old push-button panels (per stop, misure.ts) + the suppliers'
 * modules (ordini/) — each only with "Sì" on its question, otherwise null — and what the sheet's print and PDF carry:
 * the modules filled in (each on its own) and the sections. The fields taken off the sheet (October 2026: the door
 * blocking, the self-levelling, the number of retiring cams, the argano's make, the door operator's make, clear opening
 * and voltage, the existing emergency call and its state) are not read: a save leaves their columns as they are.
 */
export type SchedaData = z.output<typeof schedaSchema> & {
  misureBottoniere: MisuraData[];
  ordineQuadro: ModuloDati | null;
  preventivoArgano: ModuloDati | null;
  ordineSospensioni: ModuloDati | null;
  /** At least one module in the print (for the previous code) and which ones — their columns. */
  riepilogoOrdini: boolean;
  moduliStampati: string[];
  /** The sections left out of the print and the PDF (the choice at the end of the form). */
  sezioniEscluse: string[];
  /** The fingerprint of the confirmed discrepancies — the action sets it on save (src/server/rilievi/actions.ts). */
  discrepanzeConfermate: string | null;
};

export { RIEPILOGO_KEY, STAMPA_KEY };

const asRecord = (body: unknown): Record<string, unknown> => (body && typeof body === 'object' ? (body as Record<string, unknown>) : {});

export function parseScheda(body: unknown): { ok: true; data: SchedaData } | { ok: false; errors: FieldErrors } {
  const raw = asRecord(body);
  const active = activeFields((key) => raw[key]);
  // Only the fields that make sense; a missing one is empty (null) — and so the record keeps it.
  const input = Object.fromEntries(FIELDS.filter((field) => active.has(field.key)).map((field) => [field.key, raw[field.key]]));
  // The measurements per stop: with "Sì" and a number of stops within the bounds (otherwise there are no rows).
  const misure = raw.bottoniereMisure === 'si' ? parseMisure(raw, misureCount(raw.fermate)) : null;
  // The suppliers' modules: only when their question is shown, the answer is "Sì" and the make (and model) are theirs.
  const moduli = SLOTS.map((slot) => (slotAperto(slot, active, (key) => raw[key]) ? parseModulo(slot.modulo, slot.prefix, raw) : null));
  const riepilogo = riepilogoSchema.safeParse(raw[RIEPILOGO_KEY]);
  const stampa = sezioniEscluseDi(raw);
  // Mastech: «Sì» to the order without a model — the person is to choose NG120 or QI Touch.
  const modello = modelloMancante(active, (key) => raw[key]);
  const extraErrors: FieldErrors = Object.assign(
    {},
    misure?.errors,
    modello ? { [modello]: 'modelloNeeded' } : {},
    ...moduli.map((modulo) => modulo?.errors ?? {}),
    riepilogo.success ? {} : { [RIEPILOGO_KEY]: 'invalid' },
    stampa.success ? {} : { [STAMPA_KEY]: 'option' },
  );

  const parsed = schedaSchema.safeParse(input);
  if (parsed.success && riepilogo.success && stampa.success && Object.keys(extraErrors).length === 0) {
    // the column of the open module (the panel — one of Pelazza, MoviLift and Mastech's two, never two)
    const dati = (column: string) => moduli.find((modulo, i) => modulo && SLOTS[i]?.column === column)?.dati;
    return {
      ok: true,
      data: {
        ...parsed.data,
        misureBottoniere: misure?.rows ?? [],
        ordineQuadro: dati('ordineQuadro') ?? null,
        preventivoArgano: dati('preventivoArgano') ?? null,
        ordineSospensioni: dati('ordineSospensioni') ?? null,
        riepilogoOrdini: riepilogo.data.length > 0,
        moduliStampati: riepilogo.data,
        sezioniEscluse: stampa.data,
        discrepanzeConfermate: null,
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
  values[RIEPILOGO_KEY] = riepilogoFromBody(source);
  values[STAMPA_KEY] = stampaFromBody(source);
  // which linked fields still follow their source (collegati-client.ts) — form.ts takes only the real names
  const auto = source[AUTO_KEY];
  values[AUTO_KEY] = typeof auto === 'string' ? auto.slice(0, 4000) : '';
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
