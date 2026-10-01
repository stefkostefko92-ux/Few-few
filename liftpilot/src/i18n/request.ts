import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';

// messages/<locale>.json: the application; messages/calc/<locale>.json: the calculator texts of the prototype v12,
// kept apart so they can be compared with the prototype line by line.
export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  const requested = explicit ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const [app, calc] = await Promise.all([import(`../../messages/${locale}.json`), import(`../../messages/calc/${locale}.json`)]);
  return {
    locale,
    messages: { ...app.default, calc: calc.default },
    timeZone: 'Europe/Rome',
  };
});
