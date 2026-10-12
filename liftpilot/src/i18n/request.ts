import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import app from '../../messages/it.json';
import calc from '../../messages/calc/it.json';

// messages/it.json: the application; messages/calc/it.json: the calculator texts of the prototype v12, kept apart so
// they can be compared with the prototype line by line. Italian is the only language of the interface.
export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  const requested = explicit ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: { ...app, calc },
    timeZone: 'Europe/Rome',
  };
});
