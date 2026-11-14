// Имейл (nodemailer) — нулиране на паролата, потвърждаване и смяна на имейла, писма за
// сигурност. Огледален на medqr/src/mailer.js.
import { isIP } from 'node:net';
import nodemailer from 'nodemailer';
import { mailParams, mailVersion, publicHost } from './mailsettings.js';

const prod = process.env.NODE_ENV === 'production';

// Откъде тръгват писмата: настройката от админ панела (/admin/poshta, Brevo), иначе SMTP_* от
// средата (src/mailsettings.js). Без нито едно — JSON транспорт: писмата не се пращат, а се логват
// (разработка/тест).
export function createTransport(p) {
  // Винаги шифровано (STARTTLS или TLS) — освен локален тестов сървър извън продукция.
  const local = !prod && (p.host === 'localhost' || isIP(p.host) !== 0);
  return nodemailer.createTransport({
    host: p.host,
    port: p.port,
    secure: p.secure,
    requireTLS: !p.secure && !local,
    ignoreTLS: local,
    auth: p.user && p.pass ? { user: p.user, pass: p.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

const json = nodemailer.createTransport({ jsonTransport: true });
let current = null; // { key, t } — нов транспорт при всяка нова настройка
function transportFor(p) {
  if (!p) return json;
  const key = `${mailVersion()}|${p.source}`;
  if (current?.key === key) return current.t;
  current?.t.close();
  current = { key, t: createTransport(p) };
  return current.t;
}

// Кутия за разработка/тест: последните писма. Празна в продукция.
export const outbox = [];

export async function sendMail({ to, subject, text, html }) {
  // Кутията се пълни синхронно — писмата за сигурност се пращат без чакане (notifySafely)
  // и тестът ги вижда веднага след отговора.
  if (!prod) {
    outbox.push({ to, subject, text, at: Date.now() });
    if (outbox.length > 200) outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[MAIL → ${to}] ${subject}\n${text}\n`);
  }
  const p = mailParams();
  // В продукция без SMTP писмото изчезва — поне да личи в лога (без адреса на получателя).
  if (!p && prod) console.error(`[mail] няма включен SMTP — „${subject}“ не е изпратено`);
  await transportFor(p).sendMail({ from: p?.from || FROM_FALLBACK, to, subject, text, html });
}

const FROM_FALLBACK = 'Vizitka <no-reply@vizitka-bg.com>';

// Пробното писмо от админ панела: връзка + вход в сървъра (verify), после писмо до самия админ.
// Връща само кода на грешката (EAUTH, ECONNECTION…) — текстът на сървъра може да цитира адреси.
const CODE = /^[A-Z][A-Z0-9_]{1,30}$/;
export async function sendTestMail(to) {
  const p = mailParams();
  if (!p) return { result: 'off' };
  if (!(await publicHost(p.host))) return { result: 'error', code: 'EPRIVATE' };
  const t = createTransport(p);
  try {
    await t.verify();
    await t.sendMail({
      from: p.from,
      to,
      subject: 'Пробно писмо · Vizitka',
      text: `Здравей,\n\nтова е пробно писмо от админ панела на Vizitka: пощата работи.\n\n${SIGN}`,
    });
    return { result: 'sent' };
  } catch (err) {
    const code = err && typeof err.code === 'string' && CODE.test(err.code) ? err.code : 'EERROR';
    return { result: 'error', code };
  } finally {
    t.close();
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
