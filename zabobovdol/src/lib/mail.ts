import "server-only";
import nodemailer from "nodemailer";

// Имейл по подразбиране на получателя на сигнали (Община Бобов дол).
export const MUNICIPALITY_EMAIL =
  process.env.MUNICIPALITY_EMAIL || "obshtina@bobovdol.egov.bg";

function isConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);
}

let transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (!isConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

export type MailResult = { sent: boolean; reason?: string };

// Изпраща имейл, ако е конфигуриран SMTP. Никога не хвърля грешка нагоре —
// сигналът се запазва в базата дори когато изпращането не успее.
export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<MailResult> {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "SMTP не е конфигуриран" };
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || "no-reply@zabobovdol.bg",
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      replyTo: opts.replyTo,
    });
    return { sent: true };
  } catch (err) {
    console.error("Грешка при изпращане на имейл:", err);
    return { sent: false, reason: "грешка при изпращане" };
  }
}
