import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { firmaSalvata, type Firma } from '../interventi/firma.js';
import { dayFromDate } from '../time.js';
import { valoriVerbale, VOCI_VERBALE } from './voci.js';

/**
 * Отпечатъкът и печатът на протокола — както на листа за интервенция (interventi/sigillo.ts), със свой
 * етикет: отпечатъкът (`impronta`) е SHA-256 на всичко, което протоколът казва (фирмата, датата, адресът,
 * „N° buono“, редовете, „Verbale positivo“) в постоянен ред; печатът (`sigillo`) е HMAC-SHA256 с
 * INTERVENTI_SEAL_KEY над отпечатъка, двата подписа, имената, часа и кой е потвърдил. Връзката с картата
 * не е в отпечатъка: окончателно изтритата карта я маха (SetNull), а подписаното не се е сменило.
 * Канонът е част от формата: смяна в него обезсилва всички стари печати — тестът с еталона пада първи.
 */

export interface ContenutoVerbale {
  id: string;
  aziendaId: string;
  data: Date;
  indirizzo: string | null;
  buono: string | null;
  voci: unknown;
  positivo: boolean | null;
}

export interface FirmeVerbale {
  firmaTecnico: Firma;
  firmaTecnicoNome: string;
  firmaSupervisore: Firma;
  firmaSupervisoreNome: string;
  confermatoAt: Date;
  confermatoById: string;
}

/** Отпечатъкът на съдържанието: масив, редовете — в реда на листа, само каквото протоколът показва. */
export function improntaVerbale(row: ContenutoVerbale): string {
  const voci = valoriVerbale(row.voci);
  const canon = [
    'rilievi/verbale/v1',
    row.id,
    row.aziendaId,
    dayFromDate(row.data),
    row.indirizzo,
    row.buono,
    VOCI_VERBALE.map((voce) => [voce.key, voci[voce.key]?.t ?? null, voci[voce.key]?.c ?? null]),
    row.positivo,
  ];
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/** Печатът: HMAC над отпечатъка, подписите, часа и кой е потвърдил. */
export function sigilloVerbale(key: Buffer, impronta: string, firme: FirmeVerbale): string {
  const canon = [
    'rilievi/verbale/sigillo/v1',
    impronta,
    firme.firmaTecnico.s,
    firme.firmaTecnicoNome,
    firme.firmaSupervisore.s,
    firme.firmaSupervisoreNome,
    firme.confermatoAt.toISOString(),
    firme.confermatoById,
  ];
  return createHmac('sha256', key).update(JSON.stringify(canon)).digest('hex');
}

/** Потвърденият протокол отговаря ли на печата си; липсващото е „не“ — навън излиза само проверено. */
export function sigilloVerbaleValido(
  key: Buffer,
  row: ContenutoVerbale & {
    firmaTecnico: unknown;
    firmaTecnicoNome: string | null;
    firmaSupervisore: unknown;
    firmaSupervisoreNome: string | null;
    confermatoAt: Date | null;
    confermatoById: string | null;
    impronta: string | null;
    sigillo: string | null;
  },
): boolean {
  const firmaTecnico = firmaSalvata(row.firmaTecnico);
  const firmaSupervisore = firmaSalvata(row.firmaSupervisore);
  if (!row.confermatoAt || !row.confermatoById || !row.impronta || !row.sigillo) return false;
  if (!firmaTecnico || !firmaSupervisore) return false;
  if (!row.firmaTecnicoNome || !row.firmaSupervisoreNome) return false;
  if (improntaVerbale(row) !== row.impronta) return false;
  const expected = Buffer.from(
    sigilloVerbale(key, row.impronta, {
      firmaTecnico,
      firmaTecnicoNome: row.firmaTecnicoNome,
      firmaSupervisore,
      firmaSupervisoreNome: row.firmaSupervisoreNome,
      confermatoAt: row.confermatoAt,
      confermatoById: row.confermatoById,
    }),
    'hex',
  );
  const actual = Buffer.from(row.sigillo, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
