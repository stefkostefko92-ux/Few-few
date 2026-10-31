import { z } from 'zod';
import { normalizeSearch } from '../schede/search.js';

/**
 * Уредбата на изчислението без карта (собственикът, 31 октомври 2026): адресът е задължителен (по него
 * изчислението се намира и с него излиза PDF-ът), матрикулата и номерът — по избор, само цифри, като в
 * картата (водещата нула остава). Без база — тества се само.
 */

export const MAX_INDIRIZZO = 200;
export const MAX_IDENTIFICATIVO = 20;

export interface ImpiantoLibero {
  indirizzo: string;
  matricola: string | null;
  numeroImpianto: string | null;
}

export const CAMPI_IMPIANTO = ['indirizzo', 'matricola', 'numeroImpianto'] as const;
export type CampoImpianto = (typeof CAMPI_IMPIANTO)[number];
export type ErroreImpianto = 'required' | 'tooLong' | 'digitsOnly';
export type ErroriImpianto = Partial<Record<CampoImpianto, ErroreImpianto>>;
export type ValoriImpianto = Partial<Record<CampoImpianto, string>>;

const testo = z
  .string()
  .max(MAX_INDIRIZZO * 4)
  .transform((s) => s.trim());
const indirizzo = testo.pipe(z.string().min(1, 'required').max(MAX_INDIRIZZO, 'tooLong'));
const identificativo = testo.pipe(
  z.string().max(MAX_IDENTIFICATIVO, 'tooLong').regex(/^\d*$/, 'digitsOnly'),
);

/** Кодът на грешката от zod — съобщенията на схемите горе са самите кодове. */
function codice(error: z.ZodError): ErroreImpianto {
  const noti = error.issues
    .map((i) => i.message)
    .filter((m): m is ErroreImpianto => m === 'required' || m === 'tooLong' || m === 'digitsOnly');
  return noti[0] ?? 'tooLong';
}

/** Полетата от формата: уредбата или грешките по поле. Непознатото в тялото не се чете. */
export function parseImpianto(body: Record<string, unknown>): {
  impianto: ImpiantoLibero | null;
  errori: ErroriImpianto;
} {
  const errori: ErroriImpianto = {};
  // Поле, пратено два пъти (масив) или подправено, не е текст — грешка, не догадка.
  const leggi = (campo: CampoImpianto, schema: z.ZodType<string, string>) => {
    const raw = body[campo] ?? '';
    const parsed = schema.safeParse(raw);
    if (parsed.success) return parsed.data;
    errori[campo] = typeof raw === 'string' ? codice(parsed.error) : 'tooLong';
    return null;
  };
  const via = leggi('indirizzo', indirizzo);
  const matricola = leggi('matricola', identificativo);
  const numeroImpianto = leggi('numeroImpianto', identificativo);
  if (Object.keys(errori).length > 0 || via === null) return { impianto: null, errori };
  return {
    impianto: {
      indirizzo: via,
      matricola: matricola || null,
      numeroImpianto: numeroImpianto || null,
    },
    errori,
  };
}

/** Каквото формата показва за записаната уредба. */
export function valoriImpianto(impianto: {
  indirizzo: string | null;
  matricola: string | null;
  numeroImpianto: string | null;
}): ValoriImpianto {
  return {
    indirizzo: impianto.indirizzo ?? '',
    matricola: impianto.matricola ?? '',
    numeroImpianto: impianto.numeroImpianto ?? '',
  };
}

/** Каквото човекът е търсил, без да намери карта: само цифри — матрикула, иначе адресът. */
export function impiantoDaRicerca(query: string): ValoriImpianto {
  const q = query.trim();
  if (!q) return {};
  if (/^\d+$/.test(q) && q.length <= MAX_IDENTIFICATIVO) return { matricola: q };
  return { indirizzo: q.slice(0, MAX_INDIRIZZO) };
}

/** Текстът за търсене на изчислението без карта — нормализиран като `Scheda.searchText`. */
export function searchTextImpianto(impianto: ImpiantoLibero): string {
  return [impianto.indirizzo, impianto.matricola, impianto.numeroImpianto]
    .map((v) => normalizeSearch(v ?? ''))
    .filter(Boolean)
    .join(' ');
}
