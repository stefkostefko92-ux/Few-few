import nodemailer, { type Transporter } from "nodemailer";
import type { MailTestResult } from "@aso/shared";
import { env } from "../env.js";
import { logger } from "../logger.js";
import { mailVersion, smtpParams, type SmtpParams } from "./settings.js";

/**
 * Transactional email sender (verification + password reset).
 *
 * Откъде тръгва писмото решава `settings.ts`: настройката от админ панела (Brevo),
 * иначе SMTP_* от .env. Без нито едно писмото — с връзката — отива в лога, така
 * че потоците се тестват в dev, без да изтича нищо към трета страна.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** SMTP, винаги шифровано: 465 — TLS от началото; 587/2525 — задължителен STARTTLS. */
export function createTransport(p: SmtpParams): Transporter {
  return nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    requireTLS: !p.secure && p.source === "console",
    auth: p.user ? { user: p.user, pass: p.pass } : undefined,
    // Never let a hung SMTP server stall the awaiting request indefinitely.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  });
}

let transport: { version: number; source: string; t: Transporter } | null = null;
function getTransport(p: SmtpParams): Transporter {
  if (transport && transport.version === mailVersion() && transport.source === p.source) return transport.t;
  transport?.t.close();
  transport = { version: mailVersion(), source: p.source, t: createTransport(p) };
  return transport.t;
}

export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  const p = await smtpParams();
  if (!p) {
    // No SMTP configured: surface the link so dev/test can complete the flow.
    // The body carries verification/reset tokens, so never log it in production.
    if (env.isProd) {
      logger.warn({ to: msg.to, subject: msg.subject }, "email dropped (smtp disabled in prod)");
    } else {
      logger.info({ to: msg.to, subject: msg.subject, body: msg.text }, "email (smtp disabled)");
    }
    return;
  }

  try {
    await getTransport(p).sendMail({ from: p.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    logger.info({ to: msg.to, subject: msg.subject, source: p.source }, "email sent");
  } catch (err) {
    // Never fail the request because email delivery hiccupped; log for ops.
    logger.error({ err, to: msg.to, source: p.source }, "email send failed");
  }
}

const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,30}$/;

/**
 * Пробното писмо от админ панела: връзка и вход в SMTP сървъра (`verify`), после
 * писмо до самия собственик. Връща само кода на грешката (EAUTH, ECONNECTION…).
 */
export async function sendTestEmail(to: string, subject: string, text: string): Promise<MailTestResult> {
  const p = await smtpParams();
  if (!p) return { result: "disabled" };
  const t = createTransport(p);
  try {
    await t.verify();
    await t.sendMail({ from: p.from, to, subject, text });
    return { result: "sent", to };
  } catch (err) {
    const raw = (err as { code?: unknown }).code;
    return { result: "error", code: typeof raw === "string" && ERROR_CODE.test(raw) ? raw : "EUNKNOWN" };
  } finally {
    t.close();
  }
}
