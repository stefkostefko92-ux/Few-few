import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { normalizeSearch } from '../schede/search.js';
import { dateFromDay, dayFromDate } from '../time.js';
import type { BuonoData, ControlloBuono, RigaSequenza } from './form.js';
import { CONTROLLO_KEYS, ESITI, ID_RIGA, MAX, MAX_SEQUENZE, type ControlloKey } from './voci.js';

/**
 * Записаният лист → `BuonoData` (същото, което формата дава), с недоверие към JSON-а: ред, който не е по
 * формата (пипнат на ръка, от бъдеща версия), не се чете; повторен id — също; над 30 — не. Проверка без
 * отговор е „нищо“. Отпечатъците на подписите се смятат от това — каквото не се чете, не е подписано.
 */

const giorno = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const esito = z.enum(ESITI).nullable();

const rigaSchema = z
  .object({
    id: z.string().regex(ID_RIGA),
    descrizione: z.string().min(1).max(MAX.descrizione).nullable(),
    esito,
    data: giorno,
    fornitore: z.string().min(1).max(MAX.fornitore).nullable(),
  })
  .strict();

const controlloSchema = z.object({ esito, data: giorno }).strict();

export function sequenzeSalvate(json: unknown): RigaSequenza[] {
  if (!Array.isArray(json)) return [];
  const out: RigaSequenza[] = [];
  const ids = new Set<string>();
  for (const item of json) {
    const parsed = rigaSchema.safeParse(item);
    if (!parsed.success || ids.has(parsed.data.id)) continue;
    ids.add(parsed.data.id);
    out.push(parsed.data);
    if (out.length === MAX_SEQUENZE) break;
  }
  return out;
}

export function controlliSalvati(json: unknown): Record<ControlloKey, ControlloBuono> {
  const obj = json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  const out = {} as Record<ControlloKey, ControlloBuono>;
  for (const key of CONTROLLO_KEYS) {
    const parsed = controlloSchema.safeParse((obj as Record<string, unknown>)[key]);
    out[key] = parsed.success ? parsed.data : { esito: null, data: null };
  }
  return out;
}

const day = (value: Date | null): string | null => (value ? dayFromDate(value) : null);

export interface BuonoRow {
  numero: string | null;
  dataConferma: Date | null;
  geometra: string | null;
  ordine: string | null;
  offerta: string | null;
  inizioPrevisto: Date | null;
  finePrevista: Date | null;
  matricola: string | null;
  ubicazione: string | null;
  pos: boolean | null;
  note: string | null;
  sequenze: unknown;
  controlli: unknown;
  noteControlli: string | null;
  inizioLavori: Date | null;
  inizioOra: string | null;
  fineLavori: Date | null;
  fineOra: string | null;
  sospensioni: string | null;
  tecnici: string | null;
}

export function datiDi(row: BuonoRow): BuonoData {
  return {
    numero: row.numero,
    dataConferma: day(row.dataConferma),
    geometra: row.geometra,
    ordine: row.ordine,
    offerta: row.offerta,
    inizioPrevisto: day(row.inizioPrevisto),
    finePrevista: day(row.finePrevista),
    matricola: row.matricola,
    ubicazione: row.ubicazione,
    pos: row.pos,
    note: row.note,
    sequenze: sequenzeSalvate(row.sequenze),
    controlli: controlliSalvati(row.controlli),
    noteControlli: row.noteControlli,
    inizioLavori: day(row.inizioLavori),
    inizioOra: row.inizioOra,
    fineLavori: day(row.fineLavori),
    fineOra: row.fineOra,
    sospensioni: row.sospensioni,
    tecnici: row.tecnici,
  };
}

const SEARCHABLE = [
  'numero',
  'matricola',
  'ubicazione',
  'ordine',
  'offerta',
  'geometra',
  'tecnici',
] as const;

/** `BuonoData` → колоните на реда (и текстът за търсене) — обратното на `datiDi`. */
export function colonneDi(data: BuonoData) {
  const day = (value: string | null) => (value ? dateFromDay(value) : null);
  return {
    numero: data.numero,
    dataConferma: day(data.dataConferma),
    geometra: data.geometra,
    ordine: data.ordine,
    offerta: data.offerta,
    inizioPrevisto: day(data.inizioPrevisto),
    finePrevista: day(data.finePrevista),
    matricola: data.matricola,
    ubicazione: data.ubicazione,
    pos: data.pos,
    note: data.note,
    sequenze: data.sequenze as unknown as Prisma.InputJsonArray,
    controlli: data.controlli as unknown as Prisma.InputJsonObject,
    noteControlli: data.noteControlli,
    inizioLavori: day(data.inizioLavori),
    inizioOra: data.inizioOra,
    fineLavori: day(data.fineLavori),
    fineOra: data.fineOra,
    sospensioni: data.sospensioni,
    tecnici: data.tecnici,
    searchText: SEARCHABLE.map((key) => normalizeSearch(data[key] ?? ''))
      .filter(Boolean)
      .join(' '),
  };
}
