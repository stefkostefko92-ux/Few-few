// Имейл (nodemailer) — нулиране на паролата, потвърждаване и смяна на имейла, писма за
// сигурност. Огледален на medqr/src/mailer.js.
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
  // Кутията се пълни синхронно — писмата за сигурност се пращат без чакане (notifySafely)
  // и тестът ги вижда веднага след отговора.
  if (!prod) {
    outbox.push({ to, subject, text, at: Date.now() });
    if (outbox.length > 200) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[MAIL → ${to}] ${subject}\n${text}\n`);
  }
  await transport.sendMail({ from: FROM, to, subject, text, html });
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

const SIGN = '— Vizitka (Carbon Stealth VCC)';

export function sendVerifyEmail(to, link) {
  return sendMail({
    to,
    subject: 'Потвърди имейла си · Vizitka',
    text: `Здравей,

Благодарим, че създаде визитка във Vizitka. Потвърди, че това е твоят имейл — така
„Забравена парола“ и важните писма за акаунта ще стигат до теб (връзката важи 24 часа):

${link}

Ако не си създавал(а) акаунт, просто игнорирай това писмо.

${SIGN}`,
  });
}

export function sendEmailChangeConfirm(to, link) {
  return sendMail({
    to,
    subject: 'Потвърди новия имейл · Vizitka',
    text: `Здравей,

Заявена е смяна на имейла за вход във Vizitka към този адрес. Отвори връзката, за да
потвърдиш смяната (важи 1 час):

${link}

Докато не я отвориш, нищо не се променя. Ако не си заявявал(а) това, игнорирай писмото.

${SIGN}`,
  });
}

// Писмо за сигурност до ТЕКУЩИЯ имейл: какво се е случило и какво да направи, ако не е бил
// той. Без тайни — нито парола, нито кодове, нито връзки с токен.
export function sendSecurityNotice(to, what, detail = '') {
  return sendMail({
    to,
    subject: `${what} · Vizitka`,
    text: `Здравей,

${what} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.
${detail ? `\n${detail}\n` : ''}
Ако това си ти, не е нужно да правиш нищо.
Ако НЕ си ти: смени паролата веднага от „Забравена парола“ на страницата за вход и
излез от всички други устройства от „Настройки на акаунта“ → „Активни сесии“.

${SIGN}`,
  });
}

// Писмата за сигурност не бива да спират действието, ако пощата е недостъпна.
export function notifySafely(to, what, detail) {
  sendSecurityNotice(to, what, detail).catch((err) =>
    console.error('Писмо за сигурност не беше изпратено:', err.message)
  );
}
