/**
 * Опциите на отметките и изборите на картата (fields.ts) — стойностите в базата (enum-ите в
 * prisma/schema.prisma) и в речника (`scheda.option.<поле>.<СТОЙНОСТ>`). Нова опция = стойност тук, в
 * enum-а (миграция) и дума в речника.
 */

export const UBICAZIONE_MACCHINA = ['ALTO', 'BASSO'] as const;
// GEARLESS се показва като „MRL“ (речникът): стойността в базата остава, за да чете предишният код.
export const TIPO_IMPIANTO = ['ELETTRICO', 'IDRAULICO', 'GEARLESS'] as const;
export const TIPO_PORTE = ['AUTOMATICHE', 'SEMIAUTOMATICHE', 'MANUALI'] as const;
export const QUADRO_MARCA = [
  'PELAZZA',
  'MOVILIFT',
  'DMG',
  'MASTECH',
  'ELETTROQUADRI',
  'ALTRO',
] as const;
/** Mastech: таблото за поръчка — NG120 или QI Touch (всеки със своя модул). */
export const QUADRO_MODELLO = ['NG120', 'QI_TOUCH'] as const;
/**
 * Решенията при намалено горно пространство и при намалена яма — по листа на собственика (3 ноември
 * 2026, „Solo su elettrico“). „AMI100_RTBS“ в който и да е от двата отваря листа на AMI 100 Mono RTBS.
 */
export const TESTATA_INTERVENTI = [
  'PUNTONI_WW',
  'AMI100_RTBS',
  'SEMAFORO',
  'PUNTONE_OKATT',
] as const;
export const FOSSA_INTERVENTI = [
  'AMI100_RTBS',
  'SEMAFORO',
  'GREMBIULE_3_STADI',
  'PUNTONE_OKATT',
] as const;
/** Централата (fields-centralina.ts): при смяна — пускането на мотора и видът на буталото. */
export const CENTRALINA_AVVIO = ['DIRETTO', 'STELLA_TRIANGOLO'] as const;
export const TIPO_PISTONE = ['IN_TAGLIA', 'DIRETTO'] as const;
/** Кит A3 на централата, която остава: видът ѝ и частите на кита за всеки вид. */
export const CENTRALINA_IN_OPERA = ['HYDRONIC', 'ALTRO'] as const;
export const KIT_A3_HYDRONIC = ['HSV_150_440_BIS', 'PRESSOSTATO', 'CONNETTORE'] as const;
export const KIT_A3_VALVOLA = ['HSV_150_BIS', 'HSV_440_BIS'] as const;
export const KIT_A3_ALTRO = [
  'BOBINA_48_12',
  'SARACINESCA',
  'RACCORDO_MISTO',
  'PRESSOSTATO',
] as const;
export const SARACINESCA = ['ASS_2', 'ASS_3'] as const;
