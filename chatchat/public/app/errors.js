import { t, has } from './i18n.js';

/** Преведено съобщение за грешка от API — никога суровият текст на сървъра. */
export function errorText(err) {
  if (!err || typeof err !== 'object') return t('err.server');
  if (err.code && has(`err.${err.code}`)) return t(`err.${err.code}`);
  switch (err.status) {
    case 0:
      return t('err.network');
    case 400:
    case 422:
      return t('err.validation');
    case 401:
      return t('err.unauthorized');
    case 403:
      return t('err.forbidden');
    case 404:
      return t('err.notFound');
    case 409:
      return t('ticket.exists');
    case 429:
      return t('err.rateLimited');
    default:
      return t('err.server');
  }
}
