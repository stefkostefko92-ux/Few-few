import { z } from 'zod';
import { COMPANY } from '../company.js';
import { config, isProduction } from '../config.js';

/**
 * Проверката на ДДС номер във VIES на Европейската комисия (условията 2026-11-13, чл. 12.10; чл. 18, пар. 1,
 * б. „а“ от Регламент за изпълнение (ЕС) № 282/2011): обратното начисляване важи само за номер, който VIES
 * потвърждава като валиден в момента на поръчката. Договорът на услугата е официалният „swagger_publicVAT.yaml“
 * (ec.europa.eu/assets/taxud/vow-information): `POST /check-vat-number` с номера на клиента и нашия номер като
 * заявител — само така VIES връща номер на консултацията (`requestIdentifier`), който е доказателството.
 * Грешките идват и с HTTP 200 (`actionSucceed: false`) — затова решава тялото, не кодът.
 */
export const BASE_VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api';

/** Адресът на VIES; в тестове и на машина за разработка — фалшивият (само извън продукция). */
export function baseVies(): string {
  const override = config().VIES_API_BASE;
  return override && !isProduction() ? override : BASE_VIES;
}

export type EsitoVies =
  | {
      esito: 'valida';
      /** Номерът на консултацията; празно — VIES не го е дал (тогава остават датата и отговорът). */
      consultazione: string | null;
      at: Date;
      nome: string | null;
      indirizzo: string | null;
    }
  /**
   * VIES не го потвърждава. `consultazione` и `at` — ако VIES е отговорил за този номер (доказателството, че е
   * питан); празни — номерът не е стигнал до VIES или е отказан по форма.
   */
  | { esito: 'nonValida'; consultazione: string | null; at: Date | null }
  /** VIES или държавата на номера не отговаря (кодът е на VIES, „rete“ или „risposta“) — нищо не се продава. */
  | { esito: 'nonDisponibile'; codice: string };

const rispostaSchema = z
  .object({
    valid: z.boolean(),
    requestDate: z.string().max(40).optional(),
    requestIdentifier: z.string().max(60).optional(),
    name: z.string().max(2000).optional(),
    address: z.string().max(4000).optional(),
  })
  .passthrough();

const erroreSchema = z
  .object({
    actionSucceed: z.literal(false),
    errorWrappers: z.array(z.object({ error: z.string().max(60) }).passthrough()).optional(),
  })
  .passthrough();

/** „---“ и празното са „не се съобщава“ (някои държави не дават името и адреса). */
const dato = (v: string | undefined, max: number): string | null => {
  const s = (v ?? '')
    .replace(/\p{Cc}+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s === '' || /^-+$/.test(s) ? null : s.slice(0, max);
};

/**
 * Пита VIES за `numero` (с кода на държавата отпред, както го пази `partitaIvaDa`). Никога не хвърля: мрежа,
 * таймаут и нечетим отговор са „nonDisponibile“.
 */
export async function consultaVies(
  numero: string,
  opzioni: { base?: string; timeoutMs?: number } = {},
): Promise<EsitoVies> {
  const m = /^([A-Z]{2})([0-9A-Z]{2,13})$/.exec(numero);
  if (!m) return { esito: 'nonValida', consultazione: null, at: null };
  let raw: unknown;
  try {
    const res = await fetch(`${opzioni.base ?? baseVies()}/check-vat-number`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        countryCode: m[1],
        vatNumber: m[2],
        requesterMemberStateCode: COMPANY.vat.slice(0, 2),
        requesterNumber: COMPANY.vat.slice(2),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(opzioni.timeoutMs ?? 12_000),
    });
    raw = (await res.json()) as unknown;
  } catch {
    return { esito: 'nonDisponibile', codice: 'rete' };
  }
  const errore = erroreSchema.safeParse(raw);
  if (errore.success) {
    const codice = (errore.data.errorWrappers?.[0]?.error ?? '')
      .replace(/[^A-Z_]/g, '')
      .slice(0, 40);
    // Номер, който VIES не приема по форма, не е валиден номер — човекът го поправя, не чака.
    if (codice === 'INVALID_INPUT') return { esito: 'nonValida', consultazione: null, at: null };
    return { esito: 'nonDisponibile', codice: codice || 'errore' };
  }
  const risposta = rispostaSchema.safeParse(raw);
  if (!risposta.success) return { esito: 'nonDisponibile', codice: 'risposta' };
  const quando = risposta.data.requestDate ? new Date(risposta.data.requestDate) : new Date();
  const at = Number.isNaN(quando.getTime()) ? new Date() : quando;
  const consultazione = dato(risposta.data.requestIdentifier, 40);
  if (!risposta.data.valid) return { esito: 'nonValida', consultazione, at };
  return {
    esito: 'valida',
    consultazione,
    at,
    nome: dato(risposta.data.name, 300),
    indirizzo: dato(risposta.data.address, 500),
  };
}
