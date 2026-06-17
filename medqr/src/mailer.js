import nodemailer from 'nodemailer';

const prod = process.env.NODE_ENV === 'production';
const FROM = process.env.MAIL_FROM || 'MedQR <no-reply@example.com>';

// В продукция: реален SMTP (напр. на Hetzner или друг доставчик в ЕС).
// Без конфигурация: JSON транспорт — писмата не се пращат, а се логват.
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

// Кутия за разработка/тест: позволява да се прочете последният линк без реален имейл.
// НЕ се пълни в продукция (там разчитаме на реалния SMTP).
export const outbox = [];

export function baseUrl(req) {
  return (
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
  );
}

export async function sendMail({ to, subject, text, html }) {
  await transport.sendMail({ from: FROM, to, subject, text, html });
  if (!prod) {
    outbox.push({ to, subject, text, at: Date.now() });
    if (outbox.length > 50) outbox.shift();
    console.log(`[MAIL → ${to}] ${subject}\n${text}\n`);
  }
}
