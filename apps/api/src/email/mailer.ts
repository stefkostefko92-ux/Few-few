import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env.js";
import { logger } from "../logger.js";

/**
 * Transactional email sender (verification + password reset).
 *
 * Env-gated: a real SMTP transport is built only when SMTP_HOST is set. With
 * no provider configured the message — including the action link — is written
 * to the log at info level, so the flows stay fully testable in dev without
 * leaking anything to a third party.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;
function getTransport(): Transporter {
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export async function sendEmail(msg: OutgoingEmail): Promise<void> {
  if (!env.emailEnabled) {
    // No SMTP configured: surface the link so dev/test can complete the flow.
    logger.info({ to: msg.to, subject: msg.subject, body: msg.text }, "email (smtp disabled)");
    return;
  }

  try {
    await getTransport().sendMail({
      from: env.EMAIL_FROM,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    logger.info({ to: msg.to, subject: msg.subject }, "email sent");
  } catch (err) {
    // Never fail the request because email delivery hiccupped; log for ops.
    logger.error({ err, to: msg.to }, "email send failed");
  }
}
