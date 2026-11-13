import { errorMessage } from '../logger.js';
import type { RevolutEnvironment } from './integrations.js';

/**
 * „Провери връзката“ в мастър настройките. Резултатът се записва в Integration и се показва в панела,
 * затова грешката минава през `scrub`: без тайни и без имейл адреси (SMTP сървърите ги връщат в текста).
 */
export interface CheckResult {
  ok: boolean;
  error: string | null;
}

export function scrub(message: string, secrets: readonly string[]): string {
  let out = message;
  for (const secret of secrets) if (secret) out = out.split(secret).join('[тайна]');
  return out.replace(/[^\s@<>]+@[^\s@<>]+/g, '[адрес]').slice(0, 300);
}

/**
 * Revolut Merchant API: адресите и версията са от официалната спецификация (OpenAPI, info.version
 * 2026-08-17): продукция merchant.revolut.com, sandbox sandbox-merchant.revolut.com, ключът в
 * `Authorization: Bearer`, версията в `Revolut-Api-Version`.
 */
export const REVOLUT_API_VERSION = '2026-08-17';
export const REVOLUT_BASE_URL: Record<RevolutEnvironment, string> = {
  sandbox: 'https://sandbox-merchant.revolut.com',
  production: 'https://merchant.revolut.com',
};

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** Най-лекото четене с ключа: една поръчка от списъка. Тялото на отговора не се чете и не се пази. */
export async function checkRevolut(
  settings: { environment: RevolutEnvironment; secretKey: string | null },
  fetchImpl: FetchLike = fetch,
): Promise<CheckResult> {
  const key = settings.secretKey;
  if (!key) return { ok: false, error: 'missingKey' };
  try {
    const response = await fetchImpl(
      `${REVOLUT_BASE_URL[settings.environment]}/api/orders?limit=1`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${key}`,
          'Revolut-Api-Version': REVOLUT_API_VERSION,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    await response.body?.cancel();
    if (response.ok) return { ok: true, error: null };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: 'unauthorized' };
    }
    return { ok: false, error: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, error: scrub(errorMessage(error), [key]) || 'network' };
  }
}

/** Каквото ползваме от nodemailer — за да се пробва и с фалшив транспорт. */
export interface SmtpTransport {
  verify(): Promise<unknown>;
  sendMail(message: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

/**
 * Разминаване между отметката „TLS от началото“ и порта — най-честата грешка при настройка: TLS
 * ръкостискане към порт със STARTTLS (2525/587) дава „wrong version number“ на OpenSSL; обикновена
 * връзка към 465 чака поздрав, който никога не идва. Вместо суровия текст — код с обяснение в панела.
 */
export function smtpMismatch(
  message: string,
  connection: { secure: boolean; port: number },
): 'tlsOnPlainPort' | 'plainOnTlsPort' | 'noAuth' | null {
  // Писмото тръгна без вход: сървърът не прие ключа или той не стигна до връзката.
  if (/authenticate first|authentication required|5\.7\.0 .*auth|^530\b/im.test(message)) {
    return 'noAuth';
  }
  if (
    connection.secure &&
    /wrong version number|WRONG_VERSION_NUMBER|tls_validate_record_header/i.test(message)
  ) {
    return 'tlsOnPlainPort';
  }
  if (
    !connection.secure &&
    connection.port === 465 &&
    /greeting never received|timed? ?out|ETIMEDOUT|connection closed/i.test(message)
  ) {
    return 'plainOnTlsPort';
  }
  return null;
}

/** Връзка и вход към SMTP сървъра, после пробно писмо до мастъра — доказва целия път до пощата. */
export async function checkSmtp(
  transport: SmtpTransport,
  input: {
    from: string;
    to: string;
    secrets: readonly string[];
    connection?: { secure: boolean; port: number };
  },
): Promise<CheckResult> {
  try {
    await transport.verify();
    await transport.sendMail({
      from: input.from,
      to: input.to,
      subject: 'Фактурист — пробно писмо',
      text: 'Пощата на Фактурист е настроена: писмата към шкафчетата и поканите ще тръгват оттук.',
    });
    return { ok: true, error: null };
  } catch (error) {
    const message = errorMessage(error);
    const mismatch = input.connection ? smtpMismatch(message, input.connection) : null;
    return { ok: false, error: mismatch ?? (scrub(message, input.secrets) || 'smtp') };
  }
}
