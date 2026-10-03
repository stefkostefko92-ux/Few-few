import nodemailer, { type Transporter } from 'nodemailer';
import { config, isProduction } from '../config.js';
import { logger } from '../logger.js';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

let transport: Transporter | null = null;

/**
 * В продукция: SMTP (Brevo на порт 2525 — Hetzner блокира 25/465/587); config.ts не пуска процеса
 * без SMTP_HOST. При разработка и тестове: JSON транспорт — писмата не напускат машината, а остават
 * в `outbox` за тестовете.
 */
function getTransport(): Transporter {
  if (transport) return transport;
  const cfg = config();
  transport = cfg.SMTP_HOST
    ? nodemailer.createTransport({
        host: cfg.SMTP_HOST,
        port: cfg.SMTP_PORT,
        secure: cfg.SMTP_SECURE,
        requireTLS: !cfg.SMTP_SECURE,
        auth:
          cfg.SMTP_USER && cfg.SMTP_PASS ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transport;
}

/** Кутията за разработка и тестове. В продукция остава празна. */
export const outbox: Array<MailMessage & { at: number }> = [];

export async function sendMail(message: MailMessage): Promise<boolean> {
  try {
    await getTransport().sendMail({ from: config().MAIL_FROM, ...message });
    if (!isProduction()) {
      outbox.push({ ...message, at: Date.now() });
      if (outbox.length > 200) outbox.shift();
    }
    return true;
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
    return false;
  }
}
