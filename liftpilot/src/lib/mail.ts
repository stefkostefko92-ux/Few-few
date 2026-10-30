import 'server-only';
import type { Transporter } from 'nodemailer';
import { env } from './env';
import { log } from './log';
import { smtpConfigured, smtpFailure, smtpTransport } from './smtp';

// Outgoing mail through the SMTP relay of the server's env (Brevo on port 2525: the VPS provider blocks 25/465/587).
// Without a host and a sender nothing is sent and the pages that need mail say so instead of failing silently.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | null = null;

export const mailConfigured = (): boolean => smtpConfigured(env());

function transporter(): Transporter {
  transport ??= smtpTransport(env());
  return transport;
}

/** Sends one mail; false when it did not go (logged without the address or the content). */
export async function sendMail(m: Mail): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    await transporter().sendMail({ from: env().MAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return true;
  } catch (err) {
    log.error(smtpFailure(err), 'mail not sent');
    return false;
  }
}

/** Sends in the background: the page answers at once and in the same time whether a mail goes out or not. */
export function sendMailLater(m: Mail): void {
  sendMail(m).catch((err: unknown) => log.error(smtpFailure(err), 'mail not sent'));
}
