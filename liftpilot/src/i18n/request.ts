import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import app from '../../messages/it.json';
import calc from '../../messages/calc/it.json';
import rt from '../../messages/rt/ui.json';
import allegati from '../../messages/rt/allegati.json';

// messages/it.json: the application; messages/calc/it.json: the calculator texts of the prototype v12, kept apart so
// they can be compared with the prototype line by line; messages/rt/: the relazione tecnica di modifica (round 49) —
// its pages (namespace «rt») and the uploaded files (namespace «allegati»); the texts of its PDF (messages/rt/doc.json)
// are read by the document builder, not by the pages. Italian is the only language of the interface.
export default getRequestConfig(async ({ locale: explicit, requestLocale }) => {
  const requested = explicit ?? (await requestLocale);
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: { ...app, calc, rt, allegati },
    timeZone: 'Europe/Rome',
  };
});
