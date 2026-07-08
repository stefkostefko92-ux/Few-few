import { getRequestConfig } from 'next-intl/server';
import type { AbstractIntlMessages } from 'next-intl';
import { routing } from './routing';
import { DEFAULT_LOCALE, isLocale } from './locales';

// Непълните преводи падат към en, за да може нов език да тръгне
// с частично покритие и да се доизпълва постепенно.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale =
    requested && isLocale(requested) ? requested : routing.defaultLocale;

  const fallback = (await import(`../../messages/${DEFAULT_LOCALE}.json`))
    .default as AbstractIntlMessages;
  const messages =
    locale === DEFAULT_LOCALE
      ? fallback
      : ((await import(`../../messages/${locale}.json`))
          .default as AbstractIntlMessages);

  return {
    locale,
    messages: deepMerge(fallback, messages),
  };
});

function deepMerge(
  base: AbstractIntlMessages,
  override: AbstractIntlMessages,
): AbstractIntlMessages {
  const result: AbstractIntlMessages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    if (
      value &&
      typeof value === 'object' &&
      existing &&
      typeof existing === 'object'
    ) {
      result[key] = deepMerge(existing, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
