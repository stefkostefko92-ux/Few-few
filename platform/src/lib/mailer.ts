import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Изпращане на имейл (по избор). Конфигурира се през SMTP_* env. Без конфигурация
// е no-op — платформата работи и без имейл (известията остават в таблото).

let cached: Transporter | null = null;

export function mailConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function transporter(): Transporter | null {
  if (!mailConfigured()) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true", // true за 465, иначе STARTTLS
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return cached;
}

export type Mail = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

// Връща true при успех. Никога не хвърля — грешките се логват, за да не чупят
// потребителския поток (напр. изпращане на контактна форма).
export async function sendMail(mail: Mail): Promise<boolean> {
  const t = transporter();
  if (!t) return false;
  const from =
    process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@carbonstealth.eu";
  try {
    await t.sendMail({
      from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
    });
    return true;
  } catch (err) {
    console.error("Имейл: неуспешно изпращане", err);
    return false;
  }
}
