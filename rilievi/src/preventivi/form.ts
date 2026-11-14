import { z } from 'zod';
import { giornoValido } from '../master/tempo.js';
import {
  ERROR_CODES,
  textParser,
  type FieldErrorCode,
  type FormValues,
} from '../schede/field-parsers.js';
import {
  centesimiDa,
  isAliquota,
  MAX_TOTALE,
  millesimiDa,
  quantitaTesto,
  riepilogo,
  scontoDa,
  scontoTesto,
  type Aliquota,
  type RigaImporto,
} from './importi.js';

/**
 * Формата на офертата (C1): клиентът на фирмата, предметът, уредбата, датата и валидността, редовете,
 * бележките и условията за плащане. Всичко от външния свят минава оттук (zod); парите и количествата стават
 * цели числа (importi.ts) — сборовете смята само сървърът. Редът: `r-<i>-codice|descrizione|unita|quantita|
 * prezzo|sconto|iva` (i — мястото във формата); празният ред не е ред.
 */

export const MAX_RIGHE = 100;
export const MAX_INDICE = 150;
export const MAX = {
  cliente: 200,
  clienteIndirizzo: 300,
  clienteEmail: 254,
  oggetto: 300,
  impianto: 300,
  note: 4000,
  condizioni: 2000,
  codice: 30,
  descrizione: 300,
  unita: 12,
} as const;

export interface RigaPreventivo extends RigaImporto {
  codice: string | null;
  descrizione: string;
  unita: string | null;
}

export interface PreventivoData {
  cliente: string;
  clienteIndirizzo: string | null;
  clientePiva: string | null;
  clienteEmail: string | null;
  oggetto: string;
  impianto: string | null;
  data: string;
  validitaGiorni: number;
  righe: RigaPreventivo[];
  note: string | null;
  condizioni: string | null;
}

export type ErroriPreventivo = Partial<Record<string, FieldErrorCode>>;

const testo = (max: number, kind: 'text' | 'textarea' = 'text') =>
  textParser({ kind, maxLength: max });

const headSchema = z.object({
  cliente: testo(MAX.cliente),
  clienteIndirizzo: testo(MAX.clienteIndirizzo),
  oggetto: testo(MAX.oggetto),
  impianto: testo(MAX.impianto),
  note: testo(MAX.note, 'textarea'),
  condizioni: testo(MAX.condizioni, 'textarea'),
});
const HEAD_KEYS = Object.keys(headSchema.shape) as Array<keyof typeof headSchema.shape>;
const emailSchema = z.string().trim().max(MAX.clienteEmail).email();

const vuoto = (value: unknown) =>
  value === undefined || (typeof value === 'string' && value.trim() === '');
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);

/** P. IVA (11 цифри) или данъчен код (16 знака): главни букви, без интервалите. */
export function pivaDa(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (vuoto(raw)) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const value = raw.toUpperCase().replace(/\s+/g, '');
  return /^(IT)?(\d{11}|[A-Z0-9]{16})$/.test(value) ? { ok: true, value } : { ok: false };
}

export function parsePreventivo(
  body: unknown,
): { ok: true; data: PreventivoData } | { ok: false; errors: ErroriPreventivo } {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const errors: ErroriPreventivo = {};

  const head = headSchema.safeParse(Object.fromEntries(HEAD_KEYS.map((key) => [key, raw[key]])));
  if (!head.success) {
    for (const issue of head.error.issues) {
      const key = String(issue.path[0] ?? 'oggetto');
      errors[key] ??= (
        ERROR_CODES.has(issue.message) ? issue.message : 'invalid'
      ) as FieldErrorCode;
    }
  } else {
    if (!head.data.cliente) errors.cliente = 'required';
    if (!head.data.oggetto) errors.oggetto = 'required';
  }

  const data = str(raw.data)?.trim() ?? '';
  if (!data) errors.data = 'required';
  else if (
    !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
    !giornoValido(data) ||
    data < '2000-01-01' ||
    data > '2099-12-31'
  )
    errors.data = 'invalidDate';

  const validitaRaw = str(raw.validitaGiorni)?.trim() ?? '';
  const validita = validitaRaw === '' ? 30 : Number(validitaRaw);
  if (!/^\d{1,3}$/.test(validitaRaw || '30') || validita < 1 || validita > 365)
    errors.validitaGiorni = 'range';

  const piva = pivaDa(raw.clientePiva);
  if (!piva.ok) errors.clientePiva = 'invalid';
  let email: string | null = null;
  if (!vuoto(raw.clienteEmail)) {
    const parsed = emailSchema.safeParse(raw.clienteEmail);
    if (parsed.success) email = parsed.data.toLowerCase();
    else errors.clienteEmail = 'invalid';
  }

  const righe: RigaPreventivo[] = [];
  for (let i = 0; i < MAX_INDICE; i += 1) {
    const p = `r-${i}-`;
    const campi = ['codice', 'descrizione', 'unita', 'quantita', 'prezzo', 'sconto'].map(
      (k) => raw[p + k],
    );
    if (campi.every(vuoto)) continue;
    const descr = testo(MAX.descrizione, 'textarea').safeParse(raw[`${p}descrizione`] ?? '');
    const codice = testo(MAX.codice).safeParse(raw[`${p}codice`] ?? '');
    const unita = testo(MAX.unita).safeParse(raw[`${p}unita`] ?? '');
    if (!descr.success) errors[`${p}descrizione`] = 'tooLong';
    else if (!descr.data) errors[`${p}descrizione`] = 'required';
    if (!codice.success) errors[`${p}codice`] = 'tooLong';
    if (!unita.success) errors[`${p}unita`] = 'tooLong';
    const quantita = vuoto(raw[`${p}quantita`])
      ? null
      : millesimiDa(str(raw[`${p}quantita`]) ?? '');
    const prezzo = vuoto(raw[`${p}prezzo`]) ? null : centesimiDa(str(raw[`${p}prezzo`]) ?? '');
    const sconto = vuoto(raw[`${p}sconto`]) ? 0 : scontoDa(str(raw[`${p}sconto`]) ?? '');
    const iva = Number(str(raw[`${p}iva`]) ?? '22');
    if (vuoto(raw[`${p}quantita`])) errors[`${p}quantita`] = 'required';
    else if (quantita === null || quantita === 0) errors[`${p}quantita`] = 'decimal';
    if (vuoto(raw[`${p}prezzo`])) errors[`${p}prezzo`] = 'required';
    else if (prezzo === null) errors[`${p}prezzo`] = 'decimal';
    if (sconto === null) errors[`${p}sconto`] = 'range';
    if (!isAliquota(iva)) errors[`${p}iva`] = 'option';
    righe.push({
      codice: codice.success ? codice.data : null,
      descrizione: descr.success ? (descr.data ?? '') : '',
      unita: unita.success ? unita.data : null,
      quantita: quantita ?? 0,
      prezzo: prezzo ?? 0,
      sconto: sconto ?? 0,
      iva: (isAliquota(iva) ? iva : 22) as Aliquota,
    });
  }
  if (righe.length === 0) errors.righe = 'required';
  if (righe.length > MAX_RIGHE) errors.righe = 'range';
  // Всеки ред в таваните си, но сборът — над колоните: грешка на офертата, не 500 от базата.
  else if (
    Object.keys(errors).length === 0 &&
    righe.length > 0 &&
    riepilogo(righe).totale > MAX_TOTALE
  )
    errors.totale = 'range';

  if (!head.success || Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: {
      cliente: head.data.cliente!,
      clienteIndirizzo: head.data.clienteIndirizzo,
      clientePiva: piva.ok ? piva.value : null,
      clienteEmail: email,
      oggetto: head.data.oggetto!,
      impianto: head.data.impianto,
      data,
      validitaGiorni: validita,
      righe,
      note: head.data.note,
      condizioni: head.data.condizioni,
    },
  };
}

/** Записаното във вида на формата: парите и количествата — с италианския запис. */
export function formValuesDaPreventivo(d: PreventivoData): FormValues {
  const out: FormValues = {
    cliente: d.cliente,
    clienteIndirizzo: d.clienteIndirizzo ?? '',
    clientePiva: d.clientePiva ?? '',
    clienteEmail: d.clienteEmail ?? '',
    oggetto: d.oggetto,
    impianto: d.impianto ?? '',
    data: d.data,
    validitaGiorni: String(d.validitaGiorni),
    note: d.note ?? '',
    condizioni: d.condizioni ?? '',
  };
  d.righe.forEach((r, i) => {
    const p = `r-${i}-`;
    out[`${p}codice`] = r.codice ?? '';
    out[`${p}descrizione`] = r.descrizione;
    out[`${p}unita`] = r.unita ?? '';
    out[`${p}quantita`] = quantitaTesto(r.quantita);
    out[`${p}prezzo`] = (r.prezzo / 100).toFixed(2).replace('.', ',');
    out[`${p}sconto`] = r.sconto ? scontoTesto(r.sconto) : '';
    out[`${p}iva`] = String(r.iva);
  });
  return out;
}

/** Пратеното за повторно показване при грешка: само низове, само имената на формата. */
export function formValuesDalBody(body: unknown): FormValues {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 4000) : '');
  const out: FormValues = {};
  for (const key of [
    ...HEAD_KEYS,
    'clientePiva',
    'clienteEmail',
    'data',
    'validitaGiorni',
    'azienda',
    'scheda',
    'clienteId',
    'clienteIdPrima',
  ])
    out[key] = text(raw[key]);
  for (let i = 0; i < MAX_INDICE; i += 1)
    for (const k of ['codice', 'descrizione', 'unita', 'quantita', 'prezzo', 'sconto', 'iva']) {
      const value = text(raw[`r-${i}-${k}`]);
      if (value !== '') out[`r-${i}-${k}`] = value;
    }
  return out;
}

const idCliente = (raw: unknown): string | null =>
  typeof raw === 'string' && /^[a-z0-9]{20,40}$/.test(raw) ? raw : null;

/** Профилът от регистъра на клиентите, с който формата е попълнена (скритото поле) — само вид на id. */
export function clienteIdDa(body: unknown): string | null {
  return idCliente(
    body && typeof body === 'object' ? (body as Record<string, unknown>).clienteId : null,
  );
}

/**
 * Същото при промяна на оферта: `undefined`, когато формата не е сменила профила — пратеното е каквото е
 * било при отварянето ѝ (`clienteIdPrima`). Тогава връзката в базата не се пипа: клиентът може да е влязъл в
 * регистъра, докато формата е била отворена (версията на офертата не мърда от това), и записът ѝ не бива да
 * свали връзката (ревюто на Кодаджията, 13 ноември 2026).
 */
export function clienteIdCambiato(body: unknown): string | null | undefined {
  const raw = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const ora = idCliente(raw.clienteId);
  return ora === idCliente(raw.clienteIdPrima) ? undefined : ora;
}

/** Местата на редовете във формата (подредени). */
export function indiciRighe(values: FormValues): number[] {
  const set = new Set<number>();
  for (const key of Object.keys(values)) {
    const m = /^r-(\d+)-/.exec(key);
    if (m && Number(m[1]) < MAX_INDICE) set.add(Number(m[1]));
  }
  return [...set].sort((a, b) => a - b);
}
