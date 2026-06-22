import db from './db.js';
import { sendMail } from './mailer.js';

// Известяване на спешния контакт. Имейлите НЕ съдържат медицински данни —
// само че профилът е отворен (вероятна спешност) и по избор споделена локация.
const DEDUPE_MINUTES = 10;

// Дали известяването е активно за този профил.
export function notifyActive(profile) {
  return !!(profile.emergency_contact_email && profile.notify_on_scan);
}

// При отваряне на спешния профил уведомява близкия (с анти-спам прозорец).
// Записва маркера синхронно; самият имейл се праща неблокиращо.
export function notifyScan(profile, when = new Date()) {
  if (!notifyActive(profile)) return false;
  if (
    profile.last_notified_at &&
    Date.now() - new Date(profile.last_notified_at).getTime() < DEDUPE_MINUTES * 60000
  ) {
    return false;
  }
  db.prepare("UPDATE profiles SET last_notified_at = datetime('now') WHERE id = ?").run(profile.id);
  const ts = when.toLocaleString('bg-BG');
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Спешно известие — профилът на ${profile.full_name} беше отворен`,
    text:
      `Здравейте,\n\nПолучавате това съобщение, защото сте посочен(а) като спешен контакт на ` +
      `${profile.full_name} в MedQR.\n\nНякой току-що отвори спешния медицински профил на ` +
      `${profile.full_name} (${ts}). Това често означава злополука или нужда от помощ.\n\n` +
      `Моля, опитайте да се свържете с ${profile.full_name}. Ако не успеете, обмислете да се ` +
      `обадите на 112.\n\nАвтоматично съобщение от MedQR. Не съдържа медицински данни.`,
  }).catch((e) => console.error('notifyScan:', e.message));
  return true;
}

// Споделяне на местоположението на намерилия с близкия.
export function notifyLocation(profile, lat, lng, accuracy = null) {
  if (!profile.emergency_contact_email) return false;
  const maps = `https://www.google.com/maps?q=${lat},${lng}`;
  const accLine = accuracy != null ? `Приблизителна точност: ±${accuracy} м\n` : '';
  sendMail({
    to: profile.emergency_contact_email,
    subject: `Местоположение — ${profile.full_name}`,
    text:
      `Някой сподели местоположение от спешния профил на ${profile.full_name}:\n${maps}\n\n` +
      `Координати: ${lat}, ${lng}\n${accLine}\nАвтоматично съобщение от MedQR.`,
  }).catch((e) => console.error('notifyLocation:', e.message));
  return true;
}
