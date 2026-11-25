/**
 * Защо писмото не тръгна (собственикът, 13 ноември 2026 — „le email non partono, né quella di prova, né reset
 * password“: страницата казваше само гол код и причината не се виждаше). От грешката на nodemailer — стъпката,
 * на която е спряло, кодовете и отговорът на SMTP сървъра с думи. Стъпката и кодовете отиват в лога и одита;
 * текстът на сървъра — САМО на страницата на MASTER (често цитира адрес): никога в лог, одит или бисквитка.
 * Без база и без мрежа — тества се с истинските грешки на nodemailer срещу фалшив сървър.
 */

export const FASI_POSTA = [
  'connessione',
  'tls',
  'accesso',
  'mittente',
  'destinatario',
  'messaggio',
  'altro',
] as const;
export type FasePosta = (typeof FASI_POSTA)[number];

export interface DiagnosiPosta {
  fase: FasePosta;
  /** Кодът на nodemailer (EAUTH, ETIMEDOUT, EENVELOPE…); непознат — EERRORE. */
  codice: string;
  /** Кодът на системата под него (ECONNREFUSED, ENOTFOUND, грешка на сертификата…), ако има. */
  origine: string | null;
  /** Числото от отговора на SMTP сървъра (535, 550…); null — сървърът не е отговорил. */
  risposta: number | null;
  /** Отговорът на сървъра на един ред, до 300 знака — само за страницата на MASTER. */
  testo: string | null;
}

const CODICE = /^[A-Z][A-Z0-9_]{1,40}$/;
const MAX_TESTO = 300;

const codiceDi = (raw: unknown): string | null =>
  typeof raw === 'string' && CODICE.test(raw) ? raw : null;

/** Отговорът на сървъра: един ред, без управляващи знаци, със съкращение. */
function testoDi(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const pulito = raw
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ');
  const riga = pulito.replace(/\s+/g, ' ').trim();
  if (!riga) return null;
  return riga.length > MAX_TESTO ? `${riga.slice(0, MAX_TESTO - 1)}…` : riga;
}

function faseDi(
  codice: string | null,
  origine: string | null,
  comando: string,
  risposta: number | null,
): FasePosta {
  if (comando === 'MAIL FROM') return 'mittente';
  if (comando === 'RCPT TO') return 'destinatario';
  if (comando === 'DATA') return 'messaggio';
  if (comando.startsWith('AUTH') || codice === 'EAUTH' || codice === 'ENOAUTH') return 'accesso';
  if (comando === 'STARTTLS' || codice === 'ETLS' || codice === 'EREQUIRETLS') return 'tls';
  if (origine && /CERT|SSL|TLS/.test(origine)) return 'tls';
  // Сървърът е отговорил (с отказ): връзката работи — не е „не се свързва“.
  if (risposta !== null) return 'altro';
  if (codice && ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS'].includes(codice))
    return 'connessione';
  return 'altro';
}

export function diagnosiPosta(error: unknown): DiagnosiPosta {
  const e = (typeof error === 'object' && error !== null ? error : {}) as Record<string, unknown>;
  const codice = codiceDi(e.code);
  const origine = codiceDi(e.originalCode);
  const comando = typeof e.command === 'string' ? e.command : '';
  const risposta =
    typeof e.responseCode === 'number' && e.responseCode >= 100 && e.responseCode <= 599
      ? e.responseCode
      : null;
  return {
    fase: faseDi(codice, origine, comando, risposta),
    codice: codice ?? 'EERRORE',
    origine,
    risposta,
    testo: risposta === null ? null : testoDi(e.response),
  };
}
