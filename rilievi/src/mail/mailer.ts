import nodemailer, { type Transporter } from 'nodemailer';
import { config, isProduction, mailEnabled } from '../config.js';
import { logger } from '../logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** Прикачени файлове (PDF-ът на листа за интервенция) — създадени на сървъра, никога пратени отвън. */
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

/** `disabled` — няма SMTP: връзката се показва на екрана за копиране, нищо не е изгубено. */
export type MailResult = 'sent' | 'disabled' | 'failed';

let transport: Transporter | null = null;

/** SMTP (Brevo на порт 2525 — Hetzner блокира 25/465/587), винаги шифровано (STARTTLS или TLS). */
function getTransport(): Transporter {
  if (transport) return transport;
  const cfg = config();
  transport = nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    requireTLS: !cfg.SMTP_SECURE,
    auth: cfg.SMTP_USER && cfg.SMTP_PASS ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
  });
  return transport;
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
  if (/[\r\n]/.test(message.to)) return 'failed';
  if (!mailEnabled()) {
    remember(message, 'disabled');
    return 'disabled';
  }
  try {
    await getTransport().sendMail({ from: config().MAIL_FROM, ...message });
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
