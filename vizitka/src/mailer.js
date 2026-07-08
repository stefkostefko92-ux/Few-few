// Имейл (nodemailer) — за нулиране на паролата. Огледален на medqr/src/mailer.js.
import nodemailer from 'nodemailer';

const prod = process.env.NODE_ENV === 'production';
const FROM = process.env.MAIL_FROM || 'Vizitka <no-reply@vizitka-bg.com>';

// В продукция: реален SMTP (доставчик в ЕС). Без конфигурация: JSON транспорт —
// писмата не се пращат, а се логват (за разработка/тест).
let transport;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
} else {
  transport = nodemailer.createTransport({ jsonTransport: true });
}

// Кутия за разработка/тест: последните писма, без реален SMTP. Празна в продукция.
export const outbox = [];

export async function sendMail({ to, subject, text, html }) {
  await transport.sendMail({ from: FROM, to, subject, text, html });
  if (!prod) {
    outbox.push({ to, subject, text, at: Date.now() });
    if (outbox.length > 50) outbox.shift();
    console.log(`[MAIL → ${to}] ${subject}\n${text}\n`);
  }
}

export function sendPasswordReset(to, link) {
  return sendMail({
    to,
    subject: 'Нулиране на паролата · Vizitka',
    text: `Здравей,

Заявено е нулиране на паролата за акаунта ти във Vizitka. Отвори линка по-долу,
за да зададеш нова парола (важи 1 час):

${link}

Ако не си заявявал(а) това, просто игнорирай това писмо — паролата ти остава същата.

— Vizitka (Carbon Stealth VCC)`,
  });
}
