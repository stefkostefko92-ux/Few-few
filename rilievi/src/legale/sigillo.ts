import { timingSafeEqual } from 'node:crypto';
import { hmacProva } from '../auth/chiavi.js';

/**
 * Каноничният вид на стойност: ключовете — подредени, датите — ISO. Така JSON-ът от базата (jsonb
 * пренарежда ключовете) дава същия низ като записания.
 */
export function canonico(value: unknown): string {
  const norma = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(norma);
    if (v && typeof v === 'object')
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, norma((v as Record<string, unknown>)[k])]),
      );
    return v === undefined ? null : v;
  };
  return JSON.stringify(norma(value));
}

/**
 * Текстът до `n` знака (code points, както ги брои VARCHAR в PostgreSQL) — никога наполовина от двойка
 * UTF-16: иначе базата би сменила знака и печатът, сметнат върху оригинала, нямаше да съвпада.
 */
export const taglia = (text: string, n: number): string => Array.from(text).slice(0, n).join('');

/** Запечатаните полета на всеки регистър — точно тези, в този вид; липсващото е null. */
export const CAMPI_ACCETTAZIONE = [
  'at',
  'tipo',
  'versione',
  'hash',
  'clausole',
  'userId',
  'userNome',
  'userEmail',
  'aziendaId',
  'aziendaNome',
  'ruolo',
  'ragioneSociale',
  'sede',
  'partitaIva',
  'otpEmail',
  'otpInviatoAt',
  'otpVerificatoAt',
  'ip',
  'userAgent',
  'copiaHash',
] as const;

export const CAMPI_EMISSIONE = [
  'at',
  'calcolo',
  'impronta',
  'build',
  'pdfHash',
  'dati',
  'risultato',
  'calcoloId',
  'schedaId',
  'aziendaId',
  'aziendaNome',
  'userId',
  'userNome',
  'userEmail',
] as const;

/**
 * Печатът на ред доказателство (чл. 19.1 от условията): HMAC (ключ, изведен от INTERVENTI_SEAL_KEY)
 * над запечатаните полета. `conservaFino` не е вътре — срокът се мести законно при изтриване на фирмата.
 * Променено поле — печатът не съвпада.
 */
export function sigilloDi(
  campi: Readonly<Record<string, unknown>>,
  elenco: readonly string[],
): string {
  return hmacProva(canonico(Object.fromEntries(elenco.map((k) => [k, campi[k] ?? null]))));
}

/** Печатът на реда съвпада ли със съдържанието му. */
export function sigilloValido(
  riga: Readonly<Record<string, unknown>> & { sigillo: string },
  elenco: readonly string[],
): boolean {
  const atteso = Buffer.from(sigilloDi(riga, elenco), 'hex');
  const salvato = Buffer.from(riga.sigillo, 'hex');
  return atteso.length === salvato.length && timingSafeEqual(atteso, salvato);
}
