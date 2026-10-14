// The SMTP relay from the server's configuration (Brevo on port 2525: the VPS provider blocks 25/465/587), apart from
// src/lib/mail.ts so that the scripts run on the server (scripts/legal-notice.ts) send the same way without loading
// the server-only modules.
import nodemailer, { type Transporter } from 'nodemailer';
import type { Env } from './env-schema';

type SmtpEnv = Pick<Env, 'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_SECURE' | 'SMTP_USER' | 'SMTP_PASS' | 'MAIL_FROM'>;

/** A host and a sender, and with a login its password: without them nothing is sent. */
export const smtpConfigured = (e: SmtpEnv): boolean => Boolean(e.SMTP_HOST && e.MAIL_FROM && (!e.SMTP_USER || e.SMTP_PASS));

export function smtpTransport(e: SmtpEnv): Transporter {
  return nodemailer.createTransport({
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
}

/** Only the codes of a failure: the server's reply may quote the recipient's address. */
export function smtpFailure(err: unknown): Record<string, string | number> {
  if (typeof err !== 'object' || err === null) return { error: 'unknown' };
  const out: Record<string, string | number> = {};
  for (const k of ['code', 'command', 'responseCode'] as const) {
    const v: unknown = Reflect.get(err, k);
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}
