import { z } from 'zod';
import { numeriDi } from '../ordini/collegati.js';
import type { Valori } from '../ordini/valori.js';
import { TIPI_PARACADUTE, type DatiLimitatore } from './calcolo.js';

/**
 * Входът на изчислението за ограничителя (собственикът, 7 ноември 2026 — „far inserire la velocità
 * dell'impianto e il tipo di paracadute“): номиналната скорост и видът на парашута, и двете задължителни.
 * Формата праща низове („1,6“ и „1.6“ — едно и също); пази се JSON-ът от `datiSchema`, чете се с недоверие
 * (непознатите ключове на по-стар запис се пропускат).
 */

export const LIMITI_VN: [number, number] = [0.01, 20];

export const datiSchema = z.object({
  vn: z.number().finite().min(LIMITI_VN[0]).max(LIMITI_VN[1]),
  tipo: z.enum(TIPI_PARACADUTE),
});

/** Записаното изчисление — каквото и да е в базата, или валидно, или нищо. */
export function datiSalvati(json: unknown): DatiLimitatore | null {
  const parsed = datiSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type ErroreCampo = 'required' | 'decimal' | 'range' | 'option';
export type ErroriLimitatore = Partial<Record<'vn' | 'tipo', ErroreCampo>>;
export type ValoriForm = Record<string, string>;

/** Числото от формата: празно → null, „1,6“ = „1.6“; друго — грешка. */
function leggiNumero(raw: unknown): number | null | 'decimal' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return 'decimal';
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,3}(\.\d{1,4})?$/.test(s)) return 'decimal';
  return Number(s);
}

/** Формата → входът на изчислението и грешките по поле. */
export function parseDatiLimitatore(body: Record<string, unknown>): {
  dati: DatiLimitatore | null;
  errori: ErroriLimitatore;
} {
  const errori: ErroriLimitatore = {};
  const vn = leggiNumero(body.vn);
  if (vn === null) errori.vn = 'required';
  else if (vn === 'decimal') errori.vn = 'decimal';
  else if (vn < LIMITI_VN[0] || vn > LIMITI_VN[1]) errori.vn = 'range';
  const tipo = TIPI_PARACADUTE.find((t) => t === body.tipo);
  if (!tipo) errori.tipo = body.tipo === undefined || body.tipo === '' ? 'required' : 'option';
  if (Object.keys(errori).length || typeof vn !== 'number' || !tipo) return { dati: null, errori };
  return { dati: { vn, tipo }, errori };
}

const testo = (n: number) => String(n).replace('.', ',');

/** Записаното изчисление като стойности на формата (числото — с десетична запетая). */
export const formDaDati = (dati: DatiLimitatore): ValoriForm => ({
  vn: testo(dati.vn),
  tipo: dati.tipo,
});

/** Първото отваряне от картата: Vn — скоростта от „Modulo rilievi dati argani“; видът се избира. */
export function prefillLimitatore(argano: Valori | null): ValoriForm {
  const velocita = argano?.velocita;
  const [vn] = typeof velocita === 'string' ? numeriDi(velocita) : [];
  return vn !== undefined && vn >= LIMITI_VN[0] && vn <= LIMITI_VN[1] ? { vn: testo(vn) } : {};
}
