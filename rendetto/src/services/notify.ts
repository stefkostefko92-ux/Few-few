import type { Device, User } from '@prisma/client';
import { mailDeviceSummary } from '../auth/device.js';
import { countryName } from '../auth/geoip.js';
import { isLocale, LOCALE_TAG, translate } from '../i18n.js';
import type { RequestMeta } from '../http/meta.js';
import { greetingName, mailNewDevice } from '../mail/templates.js';

/** Писмото „нов вход от непознато устройство“ — на езика на акаунта, с час по София. */
export async function notifyNewDevice(
  user: User,
  device: Device,
  meta: RequestMeta,
): Promise<boolean> {
  const locale = isLocale(user.locale) ? user.locale : 'bg';
  const tag = LOCALE_TAG[locale];
  const when = new Intl.DateTimeFormat(tag, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Sofia',
  }).format(new Date());
  return mailNewDevice(user.email, locale, greetingName(user), {
    when,
    device: mailDeviceSummary(device.userAgent),
    ip: meta.ip ?? '—',
    country: meta.country ? countryName(meta.country, tag) : translate(locale, 'common.unknown'),
  });
}
