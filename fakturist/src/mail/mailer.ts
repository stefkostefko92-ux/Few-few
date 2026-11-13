import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';

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

let transporter: Transporter | null = null;

/** Изпращачът по SMTP или null, ако пощата не е настроена (писмата чакат в опашката). */
export function smtpSender(): SendMail | null {
  const cfg = config();
  if (!cfg.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: cfg.SMTP_HOST,
    port: cfg.SMTP_PORT,
    secure: cfg.SMTP_SECURE,
    auth: cfg.SMTP_USER && cfg.SMTP_PASS ? { user: cfg.SMTP_USER, pass: cfg.SMTP_PASS } : undefined,
  });
  const active = transporter;
  return async (message) => {
    await active.sendMail({ from: cfg.MAIL_FROM, ...message });
  };
}
