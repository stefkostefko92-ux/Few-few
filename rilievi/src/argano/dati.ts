import { z } from 'zod';
import { CATENE, funeDi, FUNI_COMPENSAZIONE } from './tabelle.js';

/**
 * Входът на изчислението за аргано („RT-E MOD 10411-1“, листовете „Dati Generali“, „Macchina“ и „Funi“):
 * уредбата (товар, маси, скорост, ход, окачване, място на машината), новото аргано (задвижване, обороти
 * или скорост при VVVF, предавателно число, ролка, канал, обхват) и въжетата с компенсацията. Формата
 * праща низове („6,5“ и „6.5“ — едно и също); пази се JSON-ът от `datiSchema`, чете се с недоверие.
 */

export const SOSPENSIONI = ['1:1', '1:2', '1:4'] as const;
export const AZIONAMENTI = ['1V', '2V', 'VVVF'] as const;
export const GOLE = ['cuneo', 'semicircolare', 'semicircolare-intaglio'] as const;
export const COMPENSAZIONI = ['nessuna', 'catene', 'funi'] as const;

const numero = (min: number, max: number) => z.number().finite().min(min).max(max);

export const datiSchema = z
  .object({
    portata: numero(1, 20_000),
    massaCabina: numero(1, 30_000),
    massaContrappeso: numero(1, 40_000),
    velocita: numero(0.05, 10),
    corsa: numero(0, 500),
    sospensione: z.enum(SOSPENSIONI),
    macchina: z.enum(['alto', 'basso']),
    azionamento: z.enum(AZIONAMENTI),
    giriMotore: numero(1, 10_000).nullable(),
    velocitaVvvf: numero(0.05, 10).nullable(),
    motoreVvvf: z.union([z.literal(1000), z.literal(1500)]),
    rapportoA: z.union([z.literal(1), z.literal(2)]),
    rapportoB: numero(1, 200),
    diametroPuleggia: numero(50, 2_000),
    gola: z.enum(GOLE),
    angoloGola: numero(10, 120),
    angoloAvvolgimento: numero(90, 360),
    funiSostituzione: z.boolean(),
    funiNumero: z.number().int().min(1).max(20),
    fune: z.string().max(40),
    funeAltro: z
      .object({
        d: numero(3, 40),
        sezione: numero(1, 2_000),
        rottura: numero(100, 2_000_000),
        massa: numero(0.01, 20),
      })
      .nullable(),
    compensazione: z.enum(COMPENSAZIONI),
    compNumero: z.number().int().min(0).max(20),
    compMisura: numero(0, 40),
    compMetaCorsa: z.boolean(),
    massaTenditore: numero(0, 5_000),
    diametroTenditore: numero(0, 2_000),
    decelerazioneRidotta: z.boolean(),
  })
  .strict()
  .refine((d) => (d.azionamento === 'VVVF' ? d.velocitaVvvf !== null : d.giriMotore !== null))
  .refine((d) => (d.fune === 'altro' ? d.funeAltro !== null : funeDi(d.fune) !== undefined))
  .refine(
    (d) =>
      d.compensazione === 'nessuna' ||
      misuraCompensazione(d.compensazione, d.compMisura) !== undefined,
  );

export type DatiArgano = z.output<typeof datiSchema>;

export function misuraCompensazione(tipo: 'catene' | 'funi', d: number) {
  return (tipo === 'catene' ? CATENE : FUNI_COMPENSAZIONE).find((m) => m.d === d);
}

/** Записаното изчисление — каквото и да е в базата, или валидно, или нищо. */
export function datiSalvati(json: unknown): DatiArgano | null {
  const parsed = datiSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type ErroreCampo = 'required' | 'decimal' | 'range' | 'option' | 'integer';
export type ErroriArgano = Partial<Record<string, ErroreCampo>>;

/** Числото от формата: празно → null, „6,5“ = „6.5“; друго — грешка. */
function leggiNumero(raw: unknown): number | null | 'decimal' {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return 'decimal';
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  if (!/^\d{1,7}(\.\d{1,4})?$/.test(s)) return 'decimal';
  return Number(s);
}

const LIMITI: Record<string, [number, number, boolean?]> = {
  portata: [1, 20_000],
  massaCabina: [1, 30_000],
  massaContrappeso: [1, 40_000],
  velocita: [0.05, 10],
  corsa: [0, 500],
  giriMotore: [1, 10_000],
  velocitaVvvf: [0.05, 10],
  rapportoB: [1, 200],
  diametroPuleggia: [50, 2_000],
  angoloGola: [10, 120],
  angoloAvvolgimento: [90, 360],
  funiNumero: [1, 20, true],
  compNumero: [0, 20, true],
  compMisura: [0, 40],
  massaTenditore: [0, 5_000],
  diametroTenditore: [0, 2_000],
  altroD: [3, 40],
  altroSezione: [1, 2_000],
  altroRottura: [100, 2_000_000],
  altroMassa: [0.01, 20],
};

export const limiteDi = (campo: string): [number, number] => {
  const [min, max] = LIMITI[campo]!;
  return [min, max];
};

const scelta = <T extends string>(raw: unknown, valori: readonly T[]): T | null =>
  typeof raw === 'string' && (valori as readonly string[]).includes(raw) ? (raw as T) : null;

/** Формата → входът на изчислението и грешките по поле (името на полето във формата). */
export function parseDatiArgano(body: Record<string, unknown>): {
  dati: DatiArgano | null;
  errori: ErroriArgano;
} {
  const errori: ErroriArgano = {};
  const num = (campo: string, obbligatorio: boolean): number | null => {
    const v = leggiNumero(body[campo]);
    let errore: ErroreCampo | null = null;
    if (v === 'decimal') errore = 'decimal';
    else if (v === null) errore = obbligatorio ? 'required' : null;
    else {
      const [min, max, intero] = LIMITI[campo]!;
      if (intero && !Number.isInteger(v)) errore = 'integer';
      else if (v < min || v > max) errore = 'range';
    }
    if (errore) errori[campo] = errore;
    return errore || v === 'decimal' ? null : v;
  };
  const opt = <T extends string>(campo: string, valori: readonly T[]): T | null => {
    const v = scelta(body[campo], valori);
    if (v === null) errori[campo] = 'option';
    return v;
  };
  const tra = <T extends number>(campo: string, valori: readonly T[]): T | null => {
    const v = valori.find((x) => body[campo] === String(x)) ?? null;
    if (v === null) errori[campo] = 'option';
    return v;
  };
  const azionamento = opt('azionamento', AZIONAMENTI);
  const fune =
    typeof body.fune === 'string' && (body.fune === 'altro' || funeDi(body.fune))
      ? body.fune
      : null;
  if (fune === null) errori.fune = 'option';
  const compensazione = opt('compensazione', COMPENSAZIONI);
  const conComp = compensazione !== null && compensazione !== 'nessuna';
  const compMisura = conComp ? num('compMisura', true) : 0;
  if (conComp && compMisura !== null && !misuraCompensazione(compensazione, compMisura))
    errori.compMisura = 'option';
  const candidato = {
    portata: num('portata', true),
    massaCabina: num('massaCabina', true),
    massaContrappeso: num('massaContrappeso', true),
    velocita: num('velocita', true),
    corsa: num('corsa', true),
    sospensione: opt('sospensione', SOSPENSIONI),
    macchina: opt('macchina', ['alto', 'basso'] as const),
    azionamento,
    giriMotore: num('giriMotore', azionamento !== 'VVVF'),
    velocitaVvvf: num('velocitaVvvf', azionamento === 'VVVF'),
    // Мотор 1000/1500 rpm трябва само при инвертор (честотата); иначе не се гледа.
    motoreVvvf:
      azionamento === 'VVVF' || body.motoreVvvf ? tra('motoreVvvf', [1000, 1500] as const) : 1500,
    rapportoA: tra('rapportoA', [1, 2] as const),
    rapportoB: num('rapportoB', true),
    diametroPuleggia: num('diametroPuleggia', true),
    gola: opt('gola', GOLE),
    angoloGola: num('angoloGola', true),
    angoloAvvolgimento: num('angoloAvvolgimento', true),
    funiSostituzione: body.funiSostituzione === 'si',
    funiNumero: num('funiNumero', true),
    fune,
    funeAltro:
      fune === 'altro'
        ? {
            d: num('altroD', true),
            sezione: num('altroSezione', true),
            rottura: num('altroRottura', true),
            massa: num('altroMassa', true),
          }
        : null,
    compensazione,
    compNumero: conComp ? num('compNumero', true) : 0,
    compMisura,
    compMetaCorsa: body.compMetaCorsa === 'si',
    massaTenditore: num('massaTenditore', false) ?? 0,
    diametroTenditore: num('diametroTenditore', false) ?? 0,
    decelerazioneRidotta: body.decelerazioneRidotta === 'si',
  };
  if (Object.keys(errori).length) return { dati: null, errori };
  // Каквото мина проверките по поле, минава и схемата; иначе формата е подправена.
  const parsed = datiSchema.safeParse(candidato);
  return parsed.success ? { dati: parsed.data, errori } : { dati: null, errori: { _: 'option' } };
}
