import { z } from 'zod';
import { numeriDi } from '../ordini/collegati.js';
import type { Valori } from '../ordini/valori.js';
import { TIPI_PARACADUTE, type DatiLimitatore } from './calcolo.js';

/**
 * Входът на изчислението за ограничителя: жълтите клетки на листа „Limitatore“. Всяко поле е по избор,
 * като в листа — липсващото дава „Dato mancante“ на своя ред; празна форма не се записва. Формата праща
 * низове („1,6“ и „1.6“ — едно и също); пази се JSON-ът от `datiSchema`, чете се с недоверие.
 */

export const CAMPI_NUMERICI = [
  'vn',
  'v1',
  'vc',
  'forzaParacadute',
  'forzaLimitatore',
  'mbl',
  'd',
  'dp',
] as const;
export type CampoNumerico = (typeof CAMPI_NUMERICI)[number];

/** Обхватът на всяко поле (физически смислен; праговете на нормата са в изчислението). */
const LIMITI: Record<CampoNumerico, [number, number]> = {
  vn: [0, 20],
  v1: [0, 30],
  vc: [0, 30],
  forzaParacadute: [0, 1_000_000],
  forzaLimitatore: [0, 1_000_000],
  mbl: [0, 9_999_999],
  d: [0, 100],
  dp: [0, 10_000],
};

export const limiteDi = (campo: CampoNumerico): [number, number] => LIMITI[campo];

const numero = (campo: CampoNumerico) =>
  z.number().finite().min(LIMITI[campo][0]).max(LIMITI[campo][1]).nullable();

export const datiSchema = z
  .object({
    vn: numero('vn'),
    tipo: z.enum(TIPI_PARACADUTE).nullable(),
    v1: numero('v1'),
    vc: numero('vc'),
    forzaParacadute: numero('forzaParacadute'),
    forzaLimitatore: numero('forzaLimitatore'),
    mbl: numero('mbl'),
    d: numero('d'),
    dp: numero('dp'),
  })
  .strict()
  .refine((d) => Object.values(d).some((v) => v !== null));

/** Записаното изчисление — каквото и да е в базата, или валидно, или нищо. */
export function datiSalvati(json: unknown): DatiLimitatore | null {
  const parsed = datiSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type ErroreCampo = 'decimal' | 'range' | 'option' | 'vuoto';
export type ErroriLimitatore = Partial<Record<CampoNumerico | 'tipo' | '_', ErroreCampo>>;
export type ValoriForm = Record<string, string>;

/** Числото от формата: празно → null, „1,6“ = „1.6“; друго — грешка. */
function leggiNumero(raw: unknown): number | null | 'decimal' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return 'decimal';
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,7}(\.\d{1,4})?$/.test(s)) return 'decimal';
  return Number(s);
}

/** Формата → входът на изчислението и грешките по поле (името на полето във формата). */
export function parseDatiLimitatore(body: Record<string, unknown>): {
  dati: DatiLimitatore | null;
  errori: ErroriLimitatore;
} {
  const errori: ErroriLimitatore = {};
  const valori = {} as Record<CampoNumerico, number | null>;
  for (const campo of CAMPI_NUMERICI) {
    const v = leggiNumero(body[campo]);
    if (v === 'decimal') errori[campo] = 'decimal';
    else if (v !== null && (v < LIMITI[campo][0] || v > LIMITI[campo][1])) errori[campo] = 'range';
    valori[campo] = typeof v === 'number' && !errori[campo] ? v : null;
  }
  const rawTipo = body.tipo;
  let tipo: DatiLimitatore['tipo'] = null;
  if (rawTipo !== undefined && rawTipo !== '') {
    const scelto = TIPI_PARACADUTE.find((t) => t === rawTipo);
    if (scelto) tipo = scelto;
    else errori.tipo = 'option';
  }
  if (Object.keys(errori).length) return { dati: null, errori };
  const parsed = datiSchema.safeParse({ ...valori, tipo });
  // Каквото мина проверките по поле, минава и схемата — освен празната форма.
  return parsed.success ? { dati: parsed.data, errori } : { dati: null, errori: { _: 'vuoto' } };
}

const testo = (n: number) => String(n).replace('.', ',');

/** Записаното изчисление като стойности на формата (числата — с десетична запетая). */
export function formDaDati(dati: DatiLimitatore): ValoriForm {
  const form: ValoriForm = {};
  for (const campo of CAMPI_NUMERICI) {
    const v = dati[campo];
    if (v !== null) form[campo] = testo(v);
  }
  if (dati.tipo) form.tipo = dati.tipo;
  return form;
}

/**
 * Първото отваряне от картата: Vn — скоростта от „Modulo rilievi dati argani“ (връзките я държат еднаква с
 * таблата), d — диаметърът на въжето на ограничителя от раздела „Limitatore“ на картата. Всичко друго е от
 * табелата и сертификатите — пише го човекът.
 */
export function prefillLimitatore(
  argano: Valori | null,
  funicellaDiametroMm: { toString(): string } | null,
): ValoriForm {
  const form: ValoriForm = {};
  const velocita = argano?.velocita;
  const [vn] = typeof velocita === 'string' ? numeriDi(velocita) : [];
  if (vn !== undefined && vn > 0 && vn <= LIMITI.vn[1]) form.vn = testo(vn);
  const d = funicellaDiametroMm === null ? NaN : Number(funicellaDiametroMm.toString());
  if (Number.isFinite(d) && d > 0 && d <= LIMITI.d[1]) form.d = testo(d);
  return form;
}
