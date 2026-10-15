/**
 * Опциите на отметките и изборите на картата (fields.ts) — стойностите в базата (enum-ите в
 * prisma/schema.prisma) и в речника (`scheda.option.<поле>.<СТОЙНОСТ>`). Нова опция = стойност тук, в
 * enum-а (миграция) и дума в речника.
 */

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
// GEARLESS се показва като „MRL“ (речникът): стойността в базата остава, за да чете предишният код.
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;
export const QUADRO_MARCA = ['PELAZZA', 'MOVILIFT', 'DMG', 'MASTECH', 'ALTRO'] as const;
/** Mastech: таблото за поръчка — NG120 или QI Touch (всеки със своя модул). */
export const QUADRO_MODELLO = ['NG120', 'QI_TOUCH'] as const;

// Централата на хидравличния асансьор (полетата — по Асансьорчика, октомври 2026).
export const CENTRALINA_AZIONAMENTO = [
  'DIRETTO_LATERALE',
  'DIRETTO_CENTRALE',
  'INDIRETTO_2_1',
] as const;
export const CENTRALINA_ALIMENTAZIONE = ['TRIFASE_400', 'MONOFASE_230', 'ALTRO'] as const;
export const CENTRALINA_AVVIAMENTO = [
  'DIRETTO',
  'STELLA_TRIANGOLO',
  'SOFT_STARTER',
  'INVERTER',
] as const;
export const TUBAZIONE = ['RIGIDA', 'FLESSIBILE'] as const;
export const CENTRALINA_MOTORE = ['IMMERSO', 'ESTERNO'] as const;
export const OLIO_LIVELLO = ['REGOLARE', 'BASSO'] as const;
export const OLIO_STATO = ['BUONO', 'DA_SOSTITUIRE', 'PERDITE'] as const;
