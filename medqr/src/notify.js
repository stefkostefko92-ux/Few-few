import db from './db.js';
import { sendMail, mailConfigured } from './mailer.js';

// Известяване на спешния контакт. Имейлите НЕ съдържат медицински данни —
// само че профилът е отворен (вероятна спешност) и по избор споделена локация.
const SCAN_COOLDOWN_MIN = 10; // пасивно сканиране
const SOS_COOLDOWN_MIN = 2; // изричен SOS от потребителя (анти-двойно натискане)
const LOCATE_COOLDOWN_MIN = 2; // споделяне на локация от намерилия

// Кратко уведомление по GDPR чл. 14 към третото лице (спешния контакт), което не
// е предоставило данните си само — защо получава имейла, кой обработва и права.
const GDPR_NOTICE =
  '\n\n— — —\nЗащо получавате това: този човек е посочил вашия имейл като спешен контакт в ' +
  'MedQR (услуга на Carbon Stealth, carbonstealth.eu). Обработваме адреса ви единствено, за да ' +
  'ви уведомим при вероятна спешност. Права и отписване: privacy@carbonstealth.eu.';

// Атомарен анти-спам прозорец върху дадена колона с време. Обновява само ако е
// празна или по-стара от `minutes`; връща true само за „спечелилия“ ред — така
// едновременни/повторни събития не дублират имейла. Колоната е от фиксиран списък
// (не потребителски вход) за защита срещу SQL инжекция през име на колона.
const WINDOW_COLUMNS = new Set(['last_notified_at', 'last_sos_at', 'last_located_at']);
function claimWindow(profileId, column, minutes) {
  if (!WINDOW_COLUMNS.has(column)) throw new Error('invalid window column');
  const res = db
    .prepare(
      `UPDATE profiles SET ${column} = datetime('now')
       WHERE id = ?
         AND (${column} IS NULL OR ${column} <= datetime('now', ?))`
    )
    .run(profileId, `-${minutes} minutes`);
  return res.changes === 1;
}

// Име за писмата: без нови редове/табове, без връзки, с таван на дължината —
// иначе името (контролирано от потребителя) става канал за подправено съдържание
// в писмо, изпратено от НАШ домейн до произволен адрес.
export function mailName(profile) {
  const noLinks = String(profile.full_name || '').replace(/https?:\/\/\S+/gi, '');
  // контролни знаци (нови редове, табове, NUL) и ъглови скоби → интервал
  const clean = Array.from(noLinks, (ch) => {
    const code = ch.codePointAt(0);
    return code < 32 || code === 127 || ch === '<' || ch === '>' ? ' ' : ch;
  })
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
  return clean || 'потребител на MedQR';
}

// Може ли изобщо да се праща писмо до спешния контакт: има адрес, поща е настроена
// (иначе интерфейсът би излъгал „уведомен“) и самият акаунт е с потвърден имейл
// (непотвърден акаунт не може да ползва услугата като релей към чужд адрес).
function canMail(profile) {
  if (!profile.emergency_contact_email || !mailConfigured) return false;
  const owner = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(profile.user_id);
  return !!(owner && owner.email_verified);
}

// Дали известяването при сканиране е активно за този профил (opt-in + реално възможно).
export function notifyActive(profile) {
  return !!(profile.notify_on_scan && canMail(profile));
}

// При отваряне на спешния профил уведомява близкия (с анти-спам прозорец).
export function notifyScan(profile) {
  if (!notifyActive(profile)) return false;
  if (!claimWindow(profile.id, 'last_notified_at', SCAN_COOLDOWN_MIN)) return false;
  const who = mailName(profile);
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Спешно известие — профилът на ${who} беше отворен`,
    text:
      `Здравейте,\n\nПолучавате това съобщение, защото сте посочен(а) като спешен контакт на ` +
      `${who} в MedQR.\n\nНякой току-що отвори спешния медицински профил на ` +
      `${who}. Това често означава злополука или нужда от помощ.\n\n` +
      `Моля, опитайте да се свържете с ${who}. Ако не успеете, обмислете да се ` +
      `обадите на 112.\n\nАвтоматично съобщение от MedQR. Не съдържа медицински данни.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifyScan:', e.message));
  return true;
}

// SOS: самият притежател на профила натиска бутон за спешна помощ. Уведомяваме
// близкия по имейл (без медицински данни), по избор с местоположение.
export function notifySos(profile, lat = null, lng = null) {
  // Изричен жест на самия собственик — не изисква opt-in за скенирането, но
  // изисква верифициран акаунт и настроена поща.
  if (!canMail(profile)) return false;
  if (!claimWindow(profile.id, 'last_sos_at', SOS_COOLDOWN_MIN)) return false;
  const who = mailName(profile);
  const loc =
    lat != null && lng != null
      ? `\nМестоположение: https://www.google.com/maps?q=${lat},${lng}\nКоординати: ${lat}, ${lng}`
      : '\n(Местоположението не е налично.)';
  sendMail({
    to: profile.emergency_contact_email,
    subject: `SOS — ${who} се нуждае от спешна помощ`,
    text:
      `Това е SOS сигнал от ${who} през MedQR.\n\n` +
      `${who} натисна бутона за спешна помощ. Моля, опитайте веднага да се ` +
      `свържете. Ако не успеете, обадете се на 112.${loc}\n\n` +
      `Автоматично съобщение от MedQR. Не съдържа медицински данни.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifySos:', e.message));
  return true;
}

// Споделяне на местоположението на намерилия с близкия.
export function notifyLocation(profile, lat, lng, accuracy = null) {
  // Споделянето на локация от трето лице е част от известяването — уважава opt-in.
  if (!notifyActive(profile)) return false;
  if (!claimWindow(profile.id, 'last_located_at', LOCATE_COOLDOWN_MIN)) return false;
  const who = mailName(profile);
  const maps = `https://www.google.com/maps?q=${lat},${lng}`;
  const accLine = accuracy != null ? `Приблизителна точност: ±${accuracy} м\n` : '';
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Местоположение — ${who}`,
    text:
      `Някой сподели местоположение от спешния профил на ${who}:\n${maps}\n\n` +
      `Координати: ${lat}, ${lng}\n${accLine}\nАвтоматично съобщение от MedQR.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifyLocation:', e.message));
  return true;
}
