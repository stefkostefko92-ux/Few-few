import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { firmaDalForm, type Firma } from '../interventi/firma.js';
import { giornoValido } from '../master/tempo.js';
import {
  ERROR_CODES,
  textParser,
  yesNoParser,
  type FieldErrorCode,
} from '../schede/field-parsers.js';
import { postoControllo, postoRiga, tipoPosto } from './posti.js';
import {
  CONTROLLO_KEYS,
  ID_RIGA,
  isEsito,
  MAX,
  MAX_INDICE,
  MAX_SEQUENZE,
  type ControlloKey,
  type Esito,
} from './voci.js';

/**
 * Формата на „Buono di lavoro“: всичко от външния свят минава оттук (zod). Датите остават низове
 * `YYYY-MM-DD` (същите в отпечатъка на подписите и в JSON-а на редовете), часовете — `HH:MM`.
 *
 * Имената във формата: общите полета по името на колоната; редът с работа — `seq-<i>-id|descrizione|esito|
 * data|fornitore|firma` (i — мястото във формата, не номерът на реда); проверката — `ctl-<ключ>-esito|data|
 * firma`; „Togli la firma“ — бутонът `togli` със стойност мястото на подписа (`s-<id>`, `c-<ключ>`).
 * Подписите долу на листа не са тук — слагат се на страницата на листа (routes/buoni-firme.ts).
 */

export interface RigaSequenza {
  id: string;
  descrizione: string | null;
  esito: Esito | null;
  data: string | null;
  fornitore: string | null;
}

export interface ControlloBuono {
  esito: Esito | null;
  data: string | null;
}

export interface BuonoData {
  numero: string | null;
  dataConferma: string | null;
  geometra: string | null;
  ordine: string | null;
  offerta: string | null;
  inizioPrevisto: string | null;
  finePrevista: string | null;
  matricola: string | null;
  ubicazione: string | null;
  pos: boolean | null;
  note: string | null;
  sequenze: RigaSequenza[];
  controlli: Record<ControlloKey, ControlloBuono>;
  noteControlli: string | null;
  inizioLavori: string | null;
  inizioOra: string | null;
  fineLavori: string | null;
  fineOra: string | null;
  sospensioni: string | null;
  tecnici: string | null;
}

/** Грешките на формата: кодовете на картата (`scheda.error.<код>`) и тези на подписите (`buoni.errore.<код>`). */
export type CodiceErrore = FieldErrorCode | 'modificata' | 'uguale' | 'ripetuta' | 'tolta';
export type ErroriBuono = Partial<Record<string, CodiceErrore>>;

/** Подписите, пратени със записа: новите (мястото → щрихите) и махнатите. */
export interface FirmeRichieste {
  nuove: Map<string, Firma>;
  togli: Set<string>;
}

export type EsitoForm =
  | { ok: true; data: BuonoData; firme: FirmeRichieste; campi: Map<string, string> }
  | { ok: false; errors: ErroriBuono };

const testo = (max: number, kind: 'text' | 'textarea' = 'text') =>
  textParser({ kind, maxLength: max });

const headSchema = z.object({
  numero: testo(MAX.numero),
  geometra: testo(MAX.geometra),
  ordine: testo(MAX.ordine),
  offerta: testo(MAX.offerta),
  matricola: testo(MAX.matricola),
  ubicazione: testo(MAX.ubicazione),
  pos: yesNoParser(),
  note: testo(MAX.note, 'textarea'),
  noteControlli: testo(MAX.noteControlli, 'textarea'),
  sospensioni: testo(MAX.sospensioni, 'textarea'),
  tecnici: testo(MAX.tecnici),
});
export const HEAD_KEYS = Object.keys(headSchema.shape) as Array<keyof typeof headSchema.shape>;
export const DATE_KEYS = [
  'dataConferma',
  'inizioPrevisto',
  'finePrevista',
  'inizioLavori',
  'fineLavori',
] as const;
export const ORE_KEYS = ['inizioOra', 'fineOra'] as const;

/** Денят по избор: празно — null; иначе истински ден между 1950 и 2099. */
function giorno(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; code: FieldErrorCode } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, code: 'invalid' };
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    giornoValido(value) &&
    value >= '1950-01-01' &&
    value <= '2099-12-31';
  return valid ? { ok: true, value } : { ok: false, code: 'invalidDate' };
}

/** Часът по избор: `HH:MM` (както `<input type="time">`). */
function ora(
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; code: FieldErrorCode } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, code: 'invalid' };
  const value = raw.trim();
  if (value === '') return { ok: true, value: null };
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
    ? { ok: true, value }
    : { ok: false, code: 'invalid' };
}

function esito(
  raw: unknown,
): { ok: true; value: Esito | null } | { ok: false; code: FieldErrorCode } {
  if (raw === undefined || raw === '') return { ok: true, value: null };
  return isEsito(raw) ? { ok: true, value: raw } : { ok: false, code: 'option' };
}

/** Нов постоянен id на ред. */
export const nuovoIdRiga = (): string => randomBytes(4).toString('hex');

const vuoto = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * Пратеното от формата. `nuovoId` дава id-то на новите редове (в теста — предвидимо). Връща и картата
 * „място на подписа → име на полето във формата“ (`campi`), за да стоят грешките на подписите до реда си.
 */
export function parseBuono(body: unknown, nuovoId: () => string = nuovoIdRiga): EsitoForm {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: ErroriBuono = {};
  const campi = new Map<string, string>();
  const nuove = new Map<string, Firma>();

  const head = headSchema.safeParse(Object.fromEntries(HEAD_KEYS.map((key) => [key, raw[key]])));
  if (!head.success) {
    for (const issue of head.error.issues) {
      const key = String(issue.path[0] ?? 'note');
      if (!errors[key])
        errors[key] = (
          ERROR_CODES.has(issue.message) ? issue.message : 'invalid'
        ) as FieldErrorCode;
    }
  }
  const giorni: Partial<Record<(typeof DATE_KEYS)[number], string | null>> = {};
  for (const key of DATE_KEYS) {
    const parsed = giorno(raw[key]);
    if (parsed.ok) giorni[key] = parsed.value;
    else errors[key] = parsed.code;
  }
  const ore: Partial<Record<(typeof ORE_KEYS)[number], string | null>> = {};
  for (const key of ORE_KEYS) {
    const parsed = ora(raw[key]);
    if (parsed.ok) ore[key] = parsed.value;
    else errors[key] = parsed.code;
  }
  // Часът е на деня до него: без деня не казва нищо.
  if (ore.inizioOra && giorni.inizioLavori === null && !errors.inizioLavori)
    errors.inizioLavori = 'required';
  if (ore.fineOra && giorni.fineLavori === null && !errors.fineLavori)
    errors.fineLavori = 'required';
  // Краят не е преди началото — предвиденият и истинският (с часа, ако го има и при двата).
  if (giorni.inizioPrevisto && giorni.finePrevista && giorni.finePrevista < giorni.inizioPrevisto)
    errors.finePrevista ??= 'range';
  if (giorni.inizioLavori && giorni.fineLavori) {
    const prima = `${giorni.inizioLavori}T${ore.inizioOra ?? '00:00'}`;
    const dopo = `${giorni.fineLavori}T${ore.fineOra ?? '23:59'}`;
    if (dopo < prima) errors.fineLavori ??= 'range';
  }

  // Редовете с работа: по мястото във формата; празният (нищо писано, без подпис) не е ред.
  const sequenze: RigaSequenza[] = [];
  const ids = new Set<string>();
  for (let i = 0; i < MAX_INDICE; i += 1) {
    const p = `seq-${i}-`;
    const campiRiga = ['descrizione', 'esito', 'data', 'fornitore', 'firma'].map((k) => raw[p + k]);
    if (campiRiga.every(vuoto)) continue;
    const descr = testo(MAX.descrizione, 'textarea').safeParse(raw[`${p}descrizione`] ?? '');
    const forn = testo(MAX.fornitore).safeParse(raw[`${p}fornitore`] ?? '');
    const e = esito(raw[`${p}esito`]);
    const d = giorno(raw[`${p}data`]);
    if (!descr.success)
      errors[`${p}descrizione`] =
        descr.error.issues[0]?.message === 'tooLong' ? 'tooLong' : 'invalid';
    else if (descr.data === null) errors[`${p}descrizione`] = 'required';
    if (!forn.success)
      errors[`${p}fornitore`] = forn.error.issues[0]?.message === 'tooLong' ? 'tooLong' : 'invalid';
    if (!e.ok) errors[`${p}esito`] = e.code;
    if (!d.ok) errors[`${p}data`] = d.code;
    const idRaw = raw[`${p}id`];
    let id =
      typeof idRaw === 'string' && ID_RIGA.test(idRaw) && !ids.has(idRaw) ? idRaw : nuovoId();
    while (ids.has(id)) id = nuovoId();
    ids.add(id);
    campi.set(postoRiga(id), `${p}firma`);
    const firma = firmaDalForm(raw[`${p}firma`]);
    if (!firma.ok) errors[`${p}firma`] = 'invalid';
    else if (firma.firma) nuove.set(postoRiga(id), firma.firma);
    sequenze.push({
      id,
      descrizione: descr.success ? descr.data : null,
      esito: e.ok ? e.value : null,
      data: d.ok ? d.value : null,
      fornitore: forn.success ? forn.data : null,
    });
  }
  if (sequenze.length > MAX_SEQUENZE) errors.sequenze = 'range';

  const controlli = {} as Record<ControlloKey, ControlloBuono>;
  for (const key of CONTROLLO_KEYS) {
    const p = `ctl-${key}-`;
    const e = esito(raw[`${p}esito`]);
    const d = giorno(raw[`${p}data`]);
    if (!e.ok) errors[`${p}esito`] = e.code;
    if (!d.ok) errors[`${p}data`] = d.code;
    controlli[key] = { esito: e.ok ? e.value : null, data: d.ok ? d.value : null };
    campi.set(postoControllo(key), `${p}firma`);
    const firma = firmaDalForm(raw[`${p}firma`]);
    if (!firma.ok) errors[`${p}firma`] = 'invalid';
    else if (firma.firma) {
      // Подписът на проверката е подпис на изхода ѝ: без OK / NON OK няма какво да се подпише.
      if (e.ok && e.value === null) errors[`${p}esito`] = 'required';
      nuove.set(postoControllo(key), firma.firma);
    }
  }

  const togliRaw = Array.isArray(raw.togli) ? raw.togli : [raw.togli];
  const togli = new Set(
    togliRaw.filter(
      (v): v is string =>
        typeof v === 'string' && (tipoPosto(v) === 'riga' || tipoPosto(v) === 'controllo'),
    ),
  );

  if (!head.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      ...head.data,
      dataConferma: giorni.dataConferma ?? null,
      inizioPrevisto: giorni.inizioPrevisto ?? null,
      finePrevista: giorni.finePrevista ?? null,
      inizioLavori: giorni.inizioLavori ?? null,
      fineLavori: giorni.fineLavori ?? null,
      inizioOra: ore.inizioOra ?? null,
      fineOra: ore.fineOra ?? null,
      sequenze,
      controlli,
    },
    firme: { nuove, togli },
    campi,
  };
}
