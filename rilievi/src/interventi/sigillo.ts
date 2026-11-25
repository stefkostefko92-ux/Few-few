import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { dayFromDate } from '../time.js';
import { firmaSalvata, type Firma } from './firma.js';
import { valoriVoci } from './voci.js';

/**
 * Подписът е за съдържанието (собственикът, 30 октомври 2026). Отпечатъкът (`impronta`) е SHA-256 на
 * всичко, което листът казва — фирмата, номерът, главата, точките, „Altro“, пробите и часовете — в
 * постоянен ред; показва се на страницата за подписа и в PDF-а. Печатът (`sigillo`) е HMAC-SHA256 с
 * INTERVENTI_SEAL_KEY над отпечатъка, двата подписа, имената, часа и кой е потвърдил: промяна на който
 * и да е от тях след подписа (в базата, на ръка) не минава проверката и листът не излиза навън.
 * Канонът е част от формата: смяна в него (или в начина, по който voci.ts чете точките) обезсилва всички
 * стари печати — тестът с еталонните стойности пада първи. Нов канон = нов етикет (`v2`) и старият за
 * проверка.
 */

/** Съдържанието на листа — без подписите (те са в печата). */
export interface ContenutoIntervento {
  id: string;
  aziendaId: string;
  numero: number;
  data: Date;
  turno: string | null;
  indirizzo: string | null;
  citta: string | null;
  tecnici: string | null;
  matricola: string | null;
  voci: unknown;
  altro: string | null;
  prove: boolean;
  oreTecnico: { toString(): string } | null;
  oreTotali: { toString(): string } | null;
}

/** Това, което печатът затваря заедно с отпечатъка. */
export interface Firme {
  firmaTecnico: Firma;
  firmaTecnicoNome: string;
  firmaCliente: Firma;
  firmaClienteNome: string;
  confermatoAt: Date;
  /** Кой е потвърдил — „da …“ на листа и в PDF-а. */
  confermatoById: string;
}

/** Часовете като в базата (две десетични): „1.5“ и „1.50“ са едно и също. */
const ore = (value: { toString(): string } | null): string | null =>
  value === null ? null : Number(value.toString()).toFixed(2);

/**
 * Отпечатъкът на съдържанието. Масив, не обект — редът е част от формата; точките — по номер, и само
 * каквото листът показва (valoriVoci): непознатото в базата не се показва и не се подписва.
 */
export function improntaContenuto(row: ContenutoIntervento): string {
  const voci = valoriVoci(row.voci);
  const canon = [
    'rilievi/intervento/v1',
    row.id,
    row.aziendaId,
    row.numero,
    dayFromDate(row.data),
    row.turno,
    row.indirizzo,
    row.citta,
    row.tecnici,
    row.matricola,
    Object.keys(voci)
      .sort()
      .map((key) => [key, voci[key]?.x === true, voci[key]?.q ?? null, voci[key]?.c ?? null]),
    row.altro,
    row.prove,
    ore(row.oreTecnico),
    ore(row.oreTotali),
  ];
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/**
 * Отпечатъкът на един подпис — щрихите като JSON без интервали (`[[10,150,…]]`). Същият низ дава и
 * PostgreSQL: `replace(("firmaCliente"->'s')::text, ' ', '')` (миграцията попълва старите листове така).
 */
export const improntaFirma = (firma: Firma): string =>
  createHash('sha256').update(JSON.stringify(firma.s)).digest('hex');

/** Печатът: HMAC над отпечатъка, подписите, часа и кой е потвърдил — само сървърът с ключа го прави. */
export function sigilloDi(key: Buffer, impronta: string, firme: Firme): string {
  const canon = [
    'rilievi/intervento/sigillo/v1',
    impronta,
    firme.firmaTecnico.s,
    firme.firmaTecnicoNome,
    firme.firmaCliente.s,
    firme.firmaClienteNome,
    firme.confermatoAt.toISOString(),
    firme.confermatoById,
  ];
  return createHmac('sha256', key).update(JSON.stringify(canon)).digest('hex');
}

/**
 * Потвърденият лист отговаря ли на печата си: отпечатъкът — на съдържанието, печатът — на отпечатъка и
 * подписите. Липсващото (лист отпреди печата, повреден подпис) е „не“ — навън излиза само проверено.
 */
export function sigilloValido(
  key: Buffer,
  row: ContenutoIntervento & {
    firmaTecnico: unknown;
    firmaTecnicoNome: string | null;
    firmaCliente: unknown;
    firmaClienteNome: string | null;
    confermatoAt: Date | null;
    confermatoById: string | null;
    impronta: string | null;
    sigillo: string | null;
  },
): boolean {
  const firmaTecnico = firmaSalvata(row.firmaTecnico);
  const firmaCliente = firmaSalvata(row.firmaCliente);
  if (!row.confermatoAt || !row.confermatoById || !row.impronta || !row.sigillo) return false;
  if (!firmaTecnico || !firmaCliente) return false;
  if (!row.firmaTecnicoNome || !row.firmaClienteNome) return false;
  if (improntaContenuto(row) !== row.impronta) return false;
  const expected = Buffer.from(
    sigilloDi(key, row.impronta, {
      firmaTecnico,
      firmaTecnicoNome: row.firmaTecnicoNome,
      firmaCliente,
      firmaClienteNome: row.firmaClienteNome,
      confermatoAt: row.confermatoAt,
      confermatoById: row.confermatoById,
    }),
    'hex',
  );
  const actual = Buffer.from(row.sigillo, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** „3F2A 9C1B …“ — отпечатъкът за четене от човек (на екрана и в PDF-а). */
export const improntaLeggibile = (hex: string): string =>
  (hex.toUpperCase().match(/.{1,4}/g) ?? []).join(' ');
