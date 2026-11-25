import type { AdminResource } from './resources.js';

/** Плановете, абонаментите, плащанията и webhook събитията в мастър панела (групата „billing“). */
export const BILLING_RESOURCES: AdminResource[] = [
  {
    model: 'Plan',
    slug: 'plans',
    group: 'billing',
    label: { bg: 'Планове', en: 'Plans' },
    columns: ['code', 'nameBg', 'priceMonthlyCents', 'priceYearlyCents', 'isPublic', 'isActive'],
    search: ['code', 'nameBg', 'nameEn'],
    hidden: [],
    orderBy: { sortOrder: 'asc' },
    editor: 'plan',
  },
  {
    model: 'Subscription',
    slug: 'subscriptions',
    group: 'billing',
    label: { bg: 'Абонаменти', en: 'Subscriptions' },
    columns: ['organizationId', 'planCode', 'status', 'interval', 'currentPeriodEnd', 'provider'],
    search: ['organizationId', 'planCode'],
    hidden: [],
    orderBy: { updatedAt: 'desc' },
  },
  {
    model: 'Payment',
    slug: 'payments',
    group: 'billing',
    label: { bg: 'Плащания', en: 'Payments' },
    columns: [
      'organizationId',
      'amountCents',
      'currency',
      'provider',
      'status',
      'paidAt',
      'createdAt',
    ],
    search: ['organizationId', 'providerOrderId'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'WebhookEvent',
    slug: 'webhooks',
    group: 'billing',
    label: { bg: 'Webhook събития', en: 'Webhook events' },
    columns: ['provider', 'type', 'eventKey', 'receivedAt', 'processedAt'],
    search: ['type', 'eventKey'],
    hidden: [],
    orderBy: { receivedAt: 'desc' },
  },
];
