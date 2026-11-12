import nodemailer, { type Transporter } from 'nodemailer';
import { isProduction } from '../config.js';
import { logger } from '../logger.js';
import { assicuraPosta, parametriSmtp, versionePosta, type ParametriSmtp } from './posta.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Прикачени файлове (PDF-ът на листа за интервенция) — създадени на сървъра, никога пратени отвън. */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  /** Отговорът — до човека, който е пратил (поръчката до доставчика); иначе — до портала. */
  replyTo?: string;
}

/** `disabled` — няма SMTP: връзката се показва на екрана за копиране, нищо не е изгубено. */
export type MailResult = 'sent' | 'disabled' | 'failed';

let transport: { versione: number; fonte: string; t: Transporter } | null = null;

/** SMTP (Brevo на порт 2525 — минава и при блокирани 25/465/587), винаги шифровано (STARTTLS или TLS). */
export function creaTransport(p: ParametriSmtp): Transporter {
  return nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    requireTLS: !p.secure,
    auth: p.user && p.pass ? { user: p.user, pass: p.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Транспортът на текущата настройка — нов при всяка нова настройка от конзолата. */
function getTransport(p: ParametriSmtp): Transporter {
  if (transport && transport.versione === versionePosta() && transport.fonte === p.fonte)
    return transport.t;
  transport?.t.close();
  transport = { versione: versionePosta(), fonte: p.fonte, t: creaTransport(p) };
  return transport.t;
}

/** Кутията за разработка и тестове: какво би тръгнало. В продукция остава празна. */
export const outbox: Array<MailMessage & { at: number; result: MailResult }> = [];

function remember(message: MailMessage, result: MailResult): void {
  if (isProduction()) return;
  // В кутията — само името и размерът на прикаченото, не съдържанието.
  const attachments = message.attachments?.map((a) => ({
    filename: a.filename,
    contentType: a.contentType,
    content: Buffer.alloc(0),
    size: a.content.length,
  }));
  outbox.push({ ...message, ...(attachments ? { attachments } : {}), at: Date.now(), result });
  if (outbox.length > 200) outbox.shift();
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  if (/[\r\n]/.test(message.to) || /[\r\n]/.test(message.replyTo ?? '')) return 'failed';
  await assicuraPosta();
  const parametri = parametriSmtp();
  if (!parametri) {
    remember(message, 'disabled');
    return 'disabled';
  }
  try {
    await getTransport(parametri).sendMail({ from: parametri.from, ...message });
    remember(message, 'sent');
    return 'sent';
  } catch (error) {
    // Само кодовете на грешката: текстът от SMTP сървъра често цитира адреса на получателя.
    const e = error as { code?: unknown; responseCode?: unknown; command?: unknown };
    logger.error(
      {
        code: typeof e.code === 'string' ? e.code : undefined,
        responseCode: typeof e.responseCode === 'number' ? e.responseCode : undefined,
        command: typeof e.command === 'string' ? e.command : undefined,
      },
      'писмото не тръгна',
    );
    remember(message, 'failed');
    return 'failed';
  }
}
