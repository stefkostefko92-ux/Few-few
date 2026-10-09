// Форматиране на час/дата по езика на интерфейса. Никога не хвърля — празен низ при лоша стойност.

import { getLang, t } from './i18n.js';

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** Час за днешни съобщения, дата+час за по-стари. */
export function fmtStamp(iso, now = new Date()) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const opts = sameDay(d, now)
      ? { hour: '2-digit', minute: '2-digit' }
      : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat(getLang(), opts).format(d);
  } catch {
    return '';
  }
}

export function fmtFull(iso) {
  try {
    return new Intl.DateTimeFormat(getLang(), { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return '';
  }
}

export function fmtSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Етикет на ролята (за порталния техник — вместо името на служителя). */
export const roleLabel = (role) => (role ? t(`role.${role}`) : '');
