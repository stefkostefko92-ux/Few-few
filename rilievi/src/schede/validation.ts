import { z } from 'zod';
import type {
  QuadroMarca,
  QuadroModello,
  TipoImpianto,
  TipoPorte,
  UbicazioneMacchina,
} from '@prisma/client';
import { AUTO_KEY } from '../ordini/collegamenti.js';
import { modelloMancante, slotAperto, SLOTS } from '../ordini/registry.js';
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
import {
  RIEPILOGO_KEY,
  riepilogoFromBody,
  riepilogoSchema,
  STAMPA_KEY,
  fotoFromBody,
  fotoStampateDi,
  FOTO_KEY,
  sezioniEscluseDi,
  stampaFromBody,
} from './stampa.js';

export type { FieldErrorCode, FieldErrors, FormValues } from './field-parsers.js';

/**
 * Проверката на формата на схемата. Полетата с условие (fields.ts, `when`), които нямат смисъл при
 * пратените стойности, не се четат изобщо: пазят се като null и не дават грешка, която човекът не
 * вижда (скритото поле „Numero serrature“ при „Serrature: No“).
 */

/** Ключът на формата за грешката „поне едно от адрес / матрикула / номер“. */
export const IDENTIFIERS_ERROR_KEY = 'identifiers';

/** Централата на хидравличния асансьор (fields-centralina.ts). */
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
    ubicazioneMacchina: checksOf<UbicazioneMacchina>('ubicazioneMacchina'),
    ubicazioneCassettina: textOf('ubicazioneCassettina'),
    parcheggio: textOf('parcheggio'),
    tipoImpianto: checksOf<TipoImpianto>('tipoImpianto'),
    tipoPorte: checksOf<TipoPorte>('tipoPorte'),
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
    quadroMarca: choiceOf<QuadroMarca>('quadroMarca'),
    quadroMarcaAltro: textOf('quadroMarcaAltro'),
    quadroModello: choiceOf<QuadroModello>('quadroModello'),
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
  ordineSospensioni: ModuloDati | null;
  /** Поне един модул в печата (за предишния код) и кои — колоните им. */
  riepilogoOrdini: boolean;
  moduliStampati: string[];
  /** Разделите, които не влизат в печата и PDF-а (изборът в края на формата). */
  sezioniEscluse: string[];
  /** Снимките в края на печата и PDF-а; undefined — страница без отметката (записът не я пипа). */
  fotoStampate?: boolean;
  /** Отпечатъкът на потвърдените разминавания — слага го маршрутът при запис (schede-form.ts). */
  discrepanzeConfermate: string | null;
};

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
    slotAperto(slot, active, (key) => raw[key]) ? parseModulo(slot.modulo, slot.prefix, raw) : null,
  );
  const riepilogo = riepilogoSchema.safeParse(raw[RIEPILOGO_KEY]);
  const stampa = sezioniEscluseDi(raw);
  // Mastech: „Sì“ на поръчката без модел — човекът да избере NG120 или QI Touch.
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
  if (
    parsed.success &&
    riepilogo.success &&
    stampa.success &&
    Object.keys(extraErrors).length === 0
  ) {
    // Колоната на отворения модул (таблото — Pelazza или MoviLift, никога и двата).
    const dati = (column: string) =>
      moduli.find((modulo, i) => modulo && SLOTS[i]!.column === column)?.dati;
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
        fotoStampate: fotoStampateDi(raw),
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
  values[RIEPILOGO_KEY] = riepilogoFromBody(source);
  values[STAMPA_KEY] = stampaFromBody(source);
  values[FOTO_KEY] = fotoFromBody(source);
  // Кои свързани полета още следват източника си (collegati.js) — form.ts приема само истинските имена.
  values[AUTO_KEY] = typeof source[AUTO_KEY] === 'string' ? source[AUTO_KEY].slice(0, 4000) : '';
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
