import { createHash } from 'node:crypto';
import nodemailer, { type Transporter } from 'nodemailer';
import { smtpSettings, type SmtpSettings } from '../admin/integrations.js';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: MailAttachment[];
}

export type SendMail = (message: MailMessage) => Promise<void>;

let current: { fingerprint: string; transporter: Transporter } | null = null;

/** Отпечатък на настройките — сменен ключ или сървър от панела прави нов транспорт (без рестарт). */
function fingerprint(settings: SmtpSettings): string {
  return createHash('sha256')
    .update(
      [
        settings.host,
        settings.port,
        settings.secure,
        settings.user ?? '',
        settings.pass ?? '',
      ].join('\n'),
    )
    .digest('hex');
}

/**
 * Опциите на транспорта. Без TLS от началото (2525/587) STARTTLS е задължителен: nodemailer иначе
 * минава на TLS само ако сървърът го обяви — нападател по пътя, който махне обявата, би видял ключа и
 * писмата (с връзките на поканите) в явен текст. `requireTLS` прави това грешка.
 */
export function transportOptions(settings: SmtpSettings) {
  return {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure,
    auth: settings.user && settings.pass ? { user: settings.user, pass: settings.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** Транспортът за настройките (Brevo SMTP от панела или от .env). */
export function smtpTransport(settings: SmtpSettings): Transporter {
  const print = fingerprint(settings);
  if (current?.fingerprint === print) return current.transporter;
  current?.transporter.close();
  const transporter = nodemailer.createTransport(transportOptions(settings));
  current = { fingerprint: print, transporter };
  return transporter;
}

/** Изпращачът или null, ако пощата не е настроена нито в панела, нито в .env (писмата чакат). */
export async function mailSender(): Promise<SendMail | null> {
  const settings = await smtpSettings();
  if (!settings) return null;
  const transporter = smtpTransport(settings);
  return async (message) => {
    await transporter.sendMail({ from: settings.from, ...message });
  };
}
