import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeSearch } from '../schede/search.js';
import { dateFromDay, dayFromDate } from '../time.js';
import type { PreventivoData, RigaPreventivo } from './form.js';
import { MAX, MAX_RIGHE } from './form.js';
import {
  ALIQUOTE,
  MAX_CENTESIMI,
  MAX_MILLESIMI,
  MAX_SCONTO,
  riepilogo,
  type Aliquota,
} from './importi.js';

/**
 * Записаната оферта ↔ `PreventivoData` (същото, което формата дава). Редовете са JSON и се четат с
 * недоверие: ред, който не е по формата (пипнат на ръка, от бъдеща версия), не се чете; над 100 — не.
 * Сборовете в колоните се смятат САМО тук, от прочетените редове — каквото не се чете, не се брои.
 */

const rigaSchema = z
  .object({
    codice: z.string().min(1).max(MAX.codice).nullable(),
    descrizione: z.string().min(1).max(MAX.descrizione),
    unita: z.string().min(1).max(MAX.unita).nullable(),
    quantita: z.number().int().min(1).max(MAX_MILLESIMI),
    prezzo: z.number().int().min(0).max(MAX_CENTESIMI),
    sconto: z.number().int().min(0).max(MAX_SCONTO),
    iva: z.union(
      ALIQUOTE.map((a) => z.literal(a)) as [z.ZodLiteral<Aliquota>, ...z.ZodLiteral<Aliquota>[]],
    ),
  })
  .strict();

/** Редовете от базата — само тези по формата, в реда си, до 100. */
export function righeSalvate(value: unknown): RigaPreventivo[] {
  if (!Array.isArray(value)) return [];
  const out: RigaPreventivo[] = [];
  for (const item of value.slice(0, MAX_RIGHE)) {
    const parsed = rigaSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Каквото търсенето намира: номерът, клиентът, предметът, уредбата и описанията на редовете. */
function searchTextDi(data: PreventivoData, numero?: number): string {
  return [
    numero === undefined ? '' : String(numero),
    data.cliente,
    data.clienteIndirizzo ?? '',
    data.clientePiva ?? '',
    data.oggetto,
    data.impianto ?? '',
    ...data.righe.map((r) => `${r.codice ?? ''} ${r.descrizione}`),
  ]
    .map((part) => normalizeSearch(part))
    .filter(Boolean)
    .join(' ')
    .slice(0, 20_000);
}

/** Колоните на офертата от данните на формата — със сборовете, сметнати от редовете. */
export function colonneDi(data: PreventivoData, numero?: number) {
  const r = riepilogo(data.righe);
  return {
    data: dateFromDay(data.data),
    validitaGiorni: data.validitaGiorni,
    cliente: data.cliente,
    clienteIndirizzo: data.clienteIndirizzo,
    clientePiva: data.clientePiva,
    clienteEmail: data.clienteEmail,
    oggetto: data.oggetto,
    impianto: data.impianto,
    righe: data.righe as unknown as Prisma.InputJsonArray,
    note: data.note,
    condizioni: data.condizioni,
    imponibile: r.imponibile,
    imposta: r.imposta,
    totale: r.totale,
    searchText: searchTextDi(data, numero),
  };
}

/** Записаната оферта → данните на формата (и на PDF-а). */
export function datiDi(row: {
  data: Date;
  validitaGiorni: number;
  cliente: string;
  clienteIndirizzo: string | null;
  clientePiva: string | null;
  clienteEmail: string | null;
  oggetto: string;
  impianto: string | null;
  righe: Prisma.JsonValue;
  note: string | null;
  condizioni: string | null;
}): PreventivoData {
  return {
    cliente: row.cliente,
    clienteIndirizzo: row.clienteIndirizzo,
    clientePiva: row.clientePiva,
    clienteEmail: row.clienteEmail,
    oggetto: row.oggetto,
    impianto: row.impianto,
    data: dayFromDate(row.data),
    validitaGiorni: row.validitaGiorni,
    righe: righeSalvate(row.righe),
    note: row.note,
    condizioni: row.condizioni,
  };
}

/** До кога важи: денят на офертата + дните на валидност (по календара, без часове). */
export function validaFino(data: string, giorni: number): string {
  const d = dateFromDay(data);
  d.setUTCDate(d.getUTCDate() + giorni);
  return dayFromDate(d);
}
