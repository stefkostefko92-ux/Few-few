import { config } from '../config.js';
import type { Locale } from '../i18n.js';
import type { MailAttachment } from './mailer.js';
import type { MailAction } from './compose.js';
import { link, send } from './templates.js';

/** Писмата за поръчките водят към „План“ на акаунта — бутонът в HTML варианта. */
const ORDERS: MailAction = { param: 'orders', label: 'orders' };

/*
 * Писмата за поръчките: потвърждението на договора, отказът, отхвърлянето и известията до екипа.
 * Текстовете на частите им се сглобяват в `services/order-mail.ts`.
 */

/**
 * Потвърждението на договора на траен носител (чл. 8, пар. 7 от Директива 2011/83): какво е поръчано,
 * цената, плащането, правото на отказ с образеца и общите условия към деня на поръчката (приложени
 * като файл). Текстовете на частите и копието на условията са сглобени в `services/order-mail.ts`.
 */
export function mailOrderConfirmed(
  to: string,
  locale: Locale,
  name: string | null,
  params: Record<string, string>,
  attachments: MailAttachment[] = [],
): Promise<boolean> {
  return send(to, locale, 'order', { ...params, orders: link('/account/plan', locale) }, name, {
    attachments,
    action: ORDERS,
  });
}

/** Потвърждението, че изявлението за отказ е получено — със съдържанието и часа му (чл. 11а, пар. 4). */
export function mailWithdrawalReceived(
  to: string,
  locale: Locale,
  name: string | null,
  params: Record<string, string>,
): Promise<boolean> {
  return send(to, locale, 'withdrawn', { ...params, orders: link('/account/plan', locale) }, name, {
    action: ORDERS,
  });
}

/** Отхвърлената поръчка: договорът няма да се изпълни и по него не се плаща (общите условия, „Плащане“). */
export function mailOrderRejected(
  to: string,
  locale: Locale,
  name: string | null,
  params: Record<string, string>,
): Promise<boolean> {
  return send(
    to,
    locale,
    'orderRejected',
    { ...params, orders: link('/account/plan', locale) },
    name,
    { action: ORDERS },
  );
}

/**
 * Известие до екипа (CONTACT_EMAIL), на български: нова поръчка, отказ със срок за връщане или изтрит акаунт
 * с отменена поръчка, по която може вече да е платено.
 */
export function mailStaffNotice(
  kind: 'staffOrder' | 'staffWithdrawal' | 'staffAccountDeleted',
  params: Record<string, string>,
): Promise<boolean> {
  return send(
    config().CONTACT_EMAIL,
    'bg',
    kind,
    { ...params, admin: `${config().PUBLIC_BASE_URL}/admin/requests?status=all` },
    null,
    { action: { param: 'admin', label: 'panel' } },
  );
}
