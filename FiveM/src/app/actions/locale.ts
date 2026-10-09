import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';

/**
 * Езикът пътува през скрито поле във формата. Не се чете от `Referer` (може
 * да липсва) и не се гадае — иначе английски посетител би бил върнат на
 * българска страница след изпращане.
 */
export function readLocale(formData: FormData): Locale {
  const value = formData.get('locale');
  return typeof value === 'string' && isLocale(value) ? value : DEFAULT_LOCALE;
}
