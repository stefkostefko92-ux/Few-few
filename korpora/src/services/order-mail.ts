import type { UpgradeRequest, User } from '@prisma/client';
import { COMPANY, LEGAL_UPDATED } from '../company.js';
import { config } from '../config.js';
import { accountLocale, translate, type Locale } from '../i18n.js';
import { longDate, longDateTime } from '../mail/dates.js';
import { BUSINESS_TZ } from '../time.js';
import { errorMessage, logger } from '../logger.js';
import type { MailAttachment } from '../mail/mailer.js';
import {
  mailOrderConfirmed,
  mailOrderRejected,
  mailStaffNotice,
  mailWithdrawalReceived,
} from '../mail/order-templates.js';
import { greetingName } from '../mail/templates.js';
import { orderNo } from '../plans/order-number.js';
import { formatMoney, VAT_BG_PERCENT, withVatCents } from '../plans/pricing.js';
import {
  paidStartAllowedFrom,
  REFUND_DAYS,
  refundDeadline,
  WITHDRAWAL_DAYS,
  withdrawalLastDay,
  type PlanOutcome,
} from '../plans/withdrawal.js';
import { legalPath } from '../seo/paths.js';
import { termsCopy } from './terms-copy.js';
import { keepTermsCopy, keptTermsCopy } from './terms-snapshots.js';

/**
 * Текстовете на писмата за поръчката и отказа. Всичко се смята от записа на поръчката — същите
 * числа и дати, които показват страницата „План“ и панелът.
 */
export type OrderRecord = Pick<
  UpgradeRequest,
  | 'id'
  | 'number'
  | 'option'
  | 'months'
  | 'listPriceCents'
  | 'buyerType'
  | 'earlyStartRequestedAt'
  | 'termsVersion'
  | 'status'
  | 'createdAt'
  | 'withdrawnAt'
>;
/** Поръчка, от която потребителят се е отказал — моментът на отказа е задължителен за писмата. */
export type WithdrawnOrder = OrderRecord & { withdrawnAt: Date };
type Customer = Pick<User, 'email' | 'name' | 'locale' | 'emailVerifiedAt'>;
/** Заменена поръчка — колкото да се изпише номерът ѝ. */
export type ReplacedOrder = Pick<UpgradeRequest, 'number' | 'createdAt'>;

/** „KP-2026-000001, KP-2026-000002“ — заменените поръчки в писмата. */
function numbers(orders: readonly ReplacedOrder[]): string {
  return orders.map(orderNo).join(', ');
}

/** Дата и час по София с отместването спрямо UTC — за момента на сключване и на отказа. */
function sofiaDateTime(at: Date, locale: Locale): string {
  const when = longDateTime(at, locale);
  const offset =
    new Intl.DateTimeFormat('en', { timeZone: BUSINESS_TZ, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  return `${when} (${offset.replace('GMT', 'UTC')})`;
}

/** „Premium за 12 месеца“ / „Lifetime“ — какво е поръчано. */
export function orderPlanName(
  order: Pick<OrderRecord, 'option' | 'months'>,
  locale: Locale,
): string {
  return order.option === 'lifetime'
    ? translate(locale, 'plan.lifetime')
    : translate(locale, 'plan.orderName', {
        term: translate(locale, 'plan.months', { n: order.months ?? 0 }),
      });
}

function price(order: OrderRecord, locale: Locale): string {
  const net = formatMoney(order.listPriceCents, locale);
  const gross = formatMoney(withVatCents(order.listPriceCents), locale);
  return order.buyerType === 'CONSUMER'
    ? translate(locale, 'mail.order.priceConsumer', { gross, net, vat: VAT_BG_PERCENT })
    : translate(locale, 'mail.order.priceBusiness', { net });
}

function companyAddress(locale: Locale): string {
  const t = (key: string) => translate(locale, key);
  return `${t('company.street')}, ${COMPANY.postalCode} ${t('company.city')}, ${t('company.region')}, ${t('company.country')}`;
}

/** Образецът на формуляр за отказ (приложение I, част Б от Директивата) с нашите данни. */
function withdrawalForm(locale: Locale): string {
  return translate(locale, 'mail.withdrawalForm', {
    to: `${translate(locale, 'company.legalName')}, ${companyAddress(locale)}, ${config().CONTACT_EMAIL}`,
  });
}

function paymentText(order: OrderRecord, locale: Locale): string {
  if (order.buyerType === 'BUSINESS') return translate(locale, 'mail.order.paymentBusiness');
  if (order.earlyStartRequestedAt)
    return translate(locale, 'mail.order.paymentEarly', { days: WITHDRAWAL_DAYS });
  return translate(locale, 'mail.order.paymentWait', {
    date: longDate(withdrawalLastDay(order.createdAt), locale),
  });
}

/**
 * Копието на приетите общи условия (траен носител): условията в сила се събират наново и се пазят; за
 * поръчка по по-стари условия — пазеното копие на нейната версия. Без копие на условията в сила писмото
 * чака (`retry`): поддръжката опитва пак, вместо да прати само връзка към страница, която се променя.
 * null (само връзката) остава за поръчка без версия и за стара версия, от която копие няма.
 */
async function acceptedTermsCopy(
  order: OrderRecord,
  locale: Locale,
): Promise<MailAttachment | null | 'retry'> {
  const version = order.termsVersion;
  if (!version) return null;
  const current = version === LEGAL_UPDATED.terms;
  if (current) {
    try {
      const copy = await termsCopy(locale, config().PUBLIC_BASE_URL, config().CONTACT_EMAIL);
      await keepTermsCopy(version, locale, copy.content);
      return copy;
    } catch (error) {
      logger.error({ err: errorMessage(error) }, 'копието на общите условия не се събра');
    }
  }
  const kept = await keptTermsCopy(version, locale);
  if (kept) return kept;
  if (current) return 'retry';
  logger.error({ version }, 'няма пазено копие на приетите общи условия: писмото е с връзка');
  return null;
}

/**
 * Потвърждението на сключения договор — веднага след поръчката (и пак от поддръжката, ако не тръгне),
 * с приетите общи условия като файл. `replaced` — неизпълнените поръчки, които тази е заменила. false —
 * не е тръгнало (SMTP или липсващо копие на условията): поддръжката опитва пак.
 */
export async function sendOrderConfirmation(
  order: OrderRecord,
  user: Customer,
  replaced: readonly ReplacedOrder[] = [],
): Promise<boolean> {
  const locale = accountLocale(user);
  const consumer = order.buyerType === 'CONSUMER';
  const copy = await acceptedTermsCopy(order, locale);
  if (copy === 'retry') return false;
  return mailOrderConfirmed(
    user.email,
    locale,
    greetingName(user),
    {
      when: sofiaDateTime(order.createdAt, locale),
      id: orderNo(order),
      plan: orderPlanName(order, locale),
      price: price(order, locale),
      buyer: translate(locale, consumer ? 'plan.buyer.consumer' : 'plan.buyer.business'),
      payment: paymentText(order, locale),
      duration:
        order.option === 'lifetime'
          ? translate(locale, 'mail.order.durationLifetime')
          : translate(locale, 'mail.order.durationTerm', {
              term: translate(locale, 'plan.months', { n: order.months ?? 0 }),
            }),
      replaces: replaced.length
        ? `\n\n${translate(locale, 'mail.order.replaces', { ids: numbers(replaced), contact: config().CONTACT_EMAIL })}`
        : '',
      withdrawal: consumer
        ? `${translate(locale, 'mail.order.withdrawalConsumer', {
            date: longDate(withdrawalLastDay(order.createdAt), locale),
            contact: config().CONTACT_EMAIL,
            refundDays: REFUND_DAYS,
            form: withdrawalForm(locale),
          })}\n\n${translate(locale, 'mail.order.consumerRights', { contact: config().CONTACT_EMAIL })}`
        : translate(locale, 'mail.order.withdrawalBusiness'),
      trader: translate(locale, 'mail.order.trader', {
        company: translate(locale, 'company.legalName'),
        form: translate(locale, 'company.legalForm'),
        eik: COMPANY.eik,
        address: companyAddress(locale),
        phone: COMPANY.phone,
        contact: config().CONTACT_EMAIL,
      }),
      terms: translate(locale, copy ? 'mail.order.termsAttached' : 'mail.order.termsLink', {
        date: longDate(new Date(`${order.termsVersion ?? LEGAL_UPDATED.terms}T12:00:00Z`), locale),
        link: `${config().PUBLIC_BASE_URL}${legalPath(locale, 'terms')}`,
      }),
    },
    copy ? [copy] : [],
  );
}

/** Потвърждението, че отказът е получен: съдържанието на изявлението, датата и часа му. */
export function sendWithdrawalReceipt(
  order: WithdrawnOrder,
  user: Customer,
  outcome: PlanOutcome,
): Promise<boolean> {
  const locale = accountLocale(user);
  const refundBy = longDate(refundDeadline(order.withdrawnAt), locale);
  return mailWithdrawalReceived(user.email, locale, greetingName(user), {
    when: sofiaDateTime(order.withdrawnAt, locale),
    statement: withdrawalStatement(order, user, locale),
    plan: translate(locale, `mail.withdrawn.plan.${outcome}`),
    refund: translate(
      locale,
      order.earlyStartRequestedAt ? 'mail.withdrawn.refundEarly' : 'mail.withdrawn.refund',
      { date: refundBy },
    ),
  });
}

/** Поръчката е отхвърлена от екипа (плащането не е пристигнало): няма да се изпълни и не се плаща. */
export function sendOrderRejected(
  order: Pick<OrderRecord, 'number' | 'option' | 'months' | 'createdAt'>,
  user: Customer,
): Promise<boolean> {
  const locale = accountLocale(user);
  return mailOrderRejected(user.email, locale, greetingName(user), {
    id: orderNo(order),
    plan: orderPlanName(order, locale),
    date: longDate(order.createdAt, locale),
    contact: config().CONTACT_EMAIL,
  });
}

/** Текстът на изявлението за отказ — показва се преди потвърждението и влиза в писмото дума по дума. */
export function withdrawalStatement(order: OrderRecord, user: Customer, locale: Locale): string {
  return translate(locale, 'mail.withdrawn.statement', {
    plan: orderPlanName(order, locale),
    id: orderNo(order),
    date: longDate(order.createdAt, locale),
    name: user.name,
    email: user.email,
  });
}

/**
 * Известие до екипа за нова поръчка: кога може да се активира и какво да се изпрати. Заменената
 * поръчка вече не може да се активира — екипът проверява дали по нея не е платено.
 */
export function notifyStaffOfOrder(
  order: OrderRecord,
  user: Customer,
  replaced: readonly ReplacedOrder[] = [],
): Promise<boolean> {
  const allowed = paidStartAllowedFrom(order);
  return mailStaffNotice('staffOrder', {
    id: orderNo(order),
    email: user.email,
    buyer: translate(
      'bg',
      order.buyerType === 'CONSUMER' ? 'plan.buyer.consumer' : 'plan.buyer.business',
    ),
    plan: orderPlanName(order, 'bg'),
    price: price(order, 'bg'),
    early: translate(
      'bg',
      order.earlyStartRequestedAt ? 'mail.staffOrder.yes' : 'mail.staffOrder.no',
    ),
    activation:
      allowed.getTime() > order.createdAt.getTime()
        ? translate('bg', 'mail.staffOrder.activationAfter', { date: sofiaDateTime(allowed, 'bg') })
        : translate('bg', 'mail.staffOrder.activationNow'),
    replaces: replaced.length
      ? `\n${translate('bg', 'mail.staffOrder.replaces', { ids: numbers(replaced) })}`
      : '',
  });
}

/** Известие до екипа за отказ: срокът за връщане на парите тече от момента на отказа. */
export function notifyStaffOfWithdrawal(
  order: WithdrawnOrder,
  user: Customer,
  outcome: PlanOutcome,
): Promise<boolean> {
  return mailStaffNotice('staffWithdrawal', {
    id: orderNo(order),
    email: user.email,
    plan: orderPlanName(order, 'bg'),
    when: sofiaDateTime(order.withdrawnAt, 'bg'),
    planState: translate('bg', `mail.staffWithdrawal.plan.${outcome}`),
    date: longDate(refundDeadline(order.withdrawnAt), 'bg'),
    early: translate(
      'bg',
      order.earlyStartRequestedAt ? 'mail.staffWithdrawal.early' : 'mail.staffWithdrawal.full',
    ),
  });
}
