import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { log } from './log';

// Outgoing mail through the SMTP relay of the server's env (Brevo on port 2525: the VPS provider blocks 25/465/587).
// Without a host and a sender nothing is sent and the pages that need mail say so instead of failing silently.

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | null = null;

export function mailConfigured(): boolean {
  const e = env();
  return Boolean(e.SMTP_HOST && e.MAIL_FROM && (!e.SMTP_USER || e.SMTP_PASS));
}

function transporter(): Transporter {
  if (transport) return transport;
  const e = env();
  transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_SECURE === 'true',
    // a login never travels in clear: with credentials the connection must switch to TLS (STARTTLS)
    requireTLS: Boolean(e.SMTP_USER),
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS ?? '' } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

/** Only the codes of a failure reach the log: the server's reply may quote the recipient's address. */
function failure(err: unknown): Record<string, string | number> {
  if (typeof err !== 'object' || err === null) return { error: 'unknown' };
  const out: Record<string, string | number> = {};
  for (const k of ['code', 'command', 'responseCode'] as const) {
    const v: unknown = Reflect.get(err, k);
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/** Sends one mail; false when it did not go (logged without the address or the content). */
export async function sendMail(m: Mail): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    await transporter().sendMail({ from: env().MAIL_FROM, to: m.to, subject: m.subject, text: m.text, html: m.html });
    return true;
  } catch (err) {
    log.error(failure(err), 'mail not sent');
    return false;
  }
}

/** Sends in the background: the page answers at once and in the same time whether a mail goes out or not. */
export function sendMailLater(m: Mail): void {
  sendMail(m).catch((err: unknown) => log.error(failure(err), 'mail not sent'));
}
