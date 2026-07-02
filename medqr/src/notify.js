import db from './db.js';
import { sendMail } from './mailer.js';

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

// Дали известяването при сканиране е активно за този профил.
export function notifyActive(profile) {
  return !!(profile.emergency_contact_email && profile.notify_on_scan);
}

// При отваряне на спешния профил уведомява близкия (с анти-спам прозорец).
export function notifyScan(profile) {
  if (!notifyActive(profile)) return false;
  if (!claimWindow(profile.id, 'last_notified_at', SCAN_COOLDOWN_MIN)) return false;
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Спешно известие — профилът на ${profile.full_name} беше отворен`,
    text:
      `Здравейте,\n\nПолучавате това съобщение, защото сте посочен(а) като спешен контакт на ` +
      `${profile.full_name} в MedQR.\n\nНякой току-що отвори спешния медицински профил на ` +
      `${profile.full_name}. Това често означава злополука или нужда от помощ.\n\n` +
      `Моля, опитайте да се свържете с ${profile.full_name}. Ако не успеете, обмислете да се ` +
      `обадите на 112.\n\nАвтоматично съобщение от MedQR. Не съдържа медицински данни.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifyScan:', e.message));
  return true;
}

// SOS: самият притежател на профила натиска бутон за спешна помощ. Уведомяваме
// близкия по имейл (без медицински данни), по избор с местоположение.
export function notifySos(profile, lat = null, lng = null) {
  if (!profile.emergency_contact_email) return false;
  if (!claimWindow(profile.id, 'last_sos_at', SOS_COOLDOWN_MIN)) return false;
  const loc =
    lat != null && lng != null
      ? `\nМестоположение: https://www.google.com/maps?q=${lat},${lng}\nКоординати: ${lat}, ${lng}`
      : '\n(Местоположението не е налично.)';
  sendMail({
    to: profile.emergency_contact_email,
    subject: `SOS — ${profile.full_name} се нуждае от спешна помощ`,
    text:
      `Това е SOS сигнал от ${profile.full_name} през MedQR.\n\n` +
      `${profile.full_name} натисна бутона за спешна помощ. Моля, опитайте веднага да се ` +
      `свържете. Ако не успеете, обадете се на 112.${loc}\n\n` +
      `Автоматично съобщение от MedQR. Не съдържа медицински данни.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifySos:', e.message));
  return true;
}

// Споделяне на местоположението на намерилия с близкия.
export function notifyLocation(profile, lat, lng, accuracy = null) {
  if (!profile.emergency_contact_email) return false;
  if (!claimWindow(profile.id, 'last_located_at', LOCATE_COOLDOWN_MIN)) return false;
  const maps = `https://www.google.com/maps?q=${lat},${lng}`;
  const accLine = accuracy != null ? `Приблизителна точност: ±${accuracy} м\n` : '';
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Местоположение — ${profile.full_name}`,
    text:
      `Някой сподели местоположение от спешния профил на ${profile.full_name}:\n${maps}\n\n` +
      `Координати: ${lat}, ${lng}\n${accLine}\nАвтоматично съобщение от MedQR.` +
      GDPR_NOTICE,
  }).catch((e) => console.error('notifyLocation:', e.message));
  return true;
}
