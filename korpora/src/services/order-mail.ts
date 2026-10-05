import type { UpgradeRequest, User } from '@prisma/client';
import { COMPANY, LEGAL_UPDATED } from '../company.js';
import { config } from '../config.js';
import { accountLocale, translate, type Locale } from '../i18n.js';
import { longDate, longDateTime } from '../mail/dates.js';
import { BUSINESS_TZ } from '../time.js';
import { errorMessage, logger } from '../logger.js';
import type { MailAttachment } from '../mail/mailer.js';
import {
  greetingName,
  mailOrderConfirmed,
  mailStaffNotice,
  mailWithdrawalReceived,
} from '../mail/templates.js';
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

/**
 * Текстовете на писмата за поръчката и отказа. Всичко се смята от записа на поръчката — същите
 * числа и дати, които показват страницата „План“ и панелът.
 */
export type OrderRecord = Pick<
  UpgradeRequest,
  | 'id'
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
 * Копието на приетите общи условия (траен носител) — само ако в сила са още същите, които клиентът е
 * приел с поръчката. Грешка при събирането не спира потвърждението: тогава в писмото остава връзката.
 */
async function acceptedTermsCopy(
  order: OrderRecord,
  locale: Locale,
): Promise<MailAttachment | null> {
  if (order.termsVersion !== LEGAL_UPDATED.terms) return null;
  try {
    return await termsCopy(locale, config().PUBLIC_BASE_URL, config().CONTACT_EMAIL);
  } catch (error) {
    logger.error({ err: errorMessage(error) }, 'копието на общите условия не се събра');
    return null;
  }
}

/**
 * Потвърждението на сключения договор — веднага след поръчката (и пак от поддръжката, ако не тръгне),
 * с приетите общи условия като файл. `replaced` — неизпълнените поръчки, които тази е заменила.
 */
export async function sendOrderConfirmation(
  order: OrderRecord,
  user: Customer,
  replaced: readonly string[] = [],
): Promise<boolean> {
  const locale = accountLocale(user);
  const consumer = order.buyerType === 'CONSUMER';
  const copy = await acceptedTermsCopy(order, locale);
  return mailOrderConfirmed(
    user.email,
    locale,
    greetingName(user),
    {
      when: sofiaDateTime(order.createdAt, locale),
      id: order.id,
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
        ? `\n\n${translate(locale, 'mail.order.replaces', { ids: replaced.join(', '), contact: config().CONTACT_EMAIL })}`
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

/** Текстът на изявлението за отказ — показва се преди потвърждението и влиза в писмото дума по дума. */
export function withdrawalStatement(order: OrderRecord, user: Customer, locale: Locale): string {
  return translate(locale, 'mail.withdrawn.statement', {
    plan: orderPlanName(order, locale),
    id: order.id,
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
  replaced: readonly string[] = [],
): Promise<boolean> {
  const allowed = paidStartAllowedFrom(order);
  return mailStaffNotice('staffOrder', {
    id: order.id,
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
      ? `\n${translate('bg', 'mail.staffOrder.replaces', { ids: replaced.join(', ') })}`
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
    id: order.id,
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
