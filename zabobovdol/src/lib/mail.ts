import "server-only";
import { createHash } from "node:crypto";
import nodemailer from "nodemailer";
import { getMailConfig } from "@/lib/mail-config";
import type { SmtpParams } from "@/lib/mail-config-core";

// Имейл по подразбиране на получателя на сигнали (Община Бобов дол).
export const MUNICIPALITY_EMAIL =
  process.env.MUNICIPALITY_EMAIL || "obshtina@bobovdol.egov.bg";

// Транспортът се прави наново, щом се сменят параметрите (запис в /admin/poshta
// или смяна между панела и .env) — сравнява се отпечатък (SHA-256) на параметрите.
let transporter: { fp: string; t: nodemailer.Transporter } | null = null;

function fingerprint(p: SmtpParams): string {
  return createHash("sha256")
    .update(JSON.stringify([p.host, p.port, p.secure, p.user ?? "", p.pass ?? "", p.from]))
    .digest("hex");
}

/** Нов транспорт по параметрите (и за пробното писмо от панела). */
export function createSmtpTransport(p: SmtpParams): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    auth: p.user && p.pass ? { user: p.user, pass: p.pass } : undefined,
    // Бърз отказ вместо висене на формата, ако сървърът не отговаря.
    connectionTimeout: 15_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

async function getTransporter(): Promise<{ t: nodemailer.Transporter; p: SmtpParams } | null> {
  const { params } = await getMailConfig();
  if (!params) return null;
  const fp = fingerprint(params);
  if (!transporter || transporter.fp !== fp) {
    transporter?.t.close();
    transporter = { fp, t: createSmtpTransport(params) };
  }
  return { t: transporter.t, p: params };
}

export type MailResult = { sent: boolean; reason?: string };

// Позволяваме точно ЕДИН адрес в replyTo: запетая/точка и запетая биха били
// изтълкувани от nodemailer като списък с получатели (header injection през
// потребителския имейл).
function safeReplyTo(v?: string): string | undefined {
  if (!v) return undefined;
  const s = v.trim();
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s) ? s : undefined;
}

// Изпраща имейл, ако има поща (панелът /admin/poshta или SMTP_* от .env). Никога не хвърля грешка нагоре —
// сигналът се запазва в базата дори когато изпращането не успее.
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<MailResult> {
  const tp = await getTransporter();
  if (!tp) return { sent: false, reason: "SMTP не е конфигуриран" };
  try {
    await tp.t.sendMail({
      from: tp.p.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: safeReplyTo(opts.replyTo),
    });
    return { sent: true };
  } catch (err) {
    console.error("Грешка при изпращане на имейл:", err);
    return { sent: false, reason: "грешка при изпращане" };
  }
}
