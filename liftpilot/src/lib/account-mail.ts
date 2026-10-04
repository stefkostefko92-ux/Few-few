import 'server-only';
import type { Locale } from '@/i18n/locales';
import { publicBaseUrl } from './env';
import { sendMailLater } from './mail';
import { accountMail, type AccountMailKind } from './mail-templates';

/** An account e-mail to `to` in `locale`, sent in the background (the page's answer does not wait for the relay). */
export function mailAccount(to: string, locale: Locale, m: AccountMailKind): void {
  sendMailLater({ to, ...accountMail(m, locale, publicBaseUrl()) });
}
