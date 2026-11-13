import { prisma } from '../db.js';

/**
 * Регистърът на мастър панела — ВСЯКА таблица от prisma/schema.prisma има ред тук (tests/admin-registry.test.ts
 * пада, ако някоя липсва). Така нов модел се появява в панела автоматично: списък, търсене, преглед на
 * запис и броят му на таблото. Чувствителните полета (`hidden`) никога не стигат до изгледа.
 */
export interface AdminResource {
  /** Името на модела в Prisma. */
  model: string;
  /** Адресът в панела: /admin/r/<slug>. */
  slug: string;
  group: 'accounts' | 'documents' | 'billing' | 'platform';
  label: { bg: string; en: string };
  /** Колоните в списъка. */
  columns: string[];
  /** Полетата за търсене (contains, без значение на регистъра). */
  search: string[];
  /** Никога не се показват (хешове на пароли, шифровани тайни, CSRF токени). */
  hidden: string[];
  /** Сортиране по подразбиране. */
  orderBy: Record<string, 'asc' | 'desc'>;
  /** Първичният ключ (по подразбиране `id`). */
  idField?: string;
  /** Специализиран изглед за редакция в панела (иначе — само преглед). */
  editor?: string;
}

export const ADMIN_RESOURCES: AdminResource[] = [
  {
    model: 'User',
    slug: 'users',
    group: 'accounts',
    label: { bg: 'Потребители', en: 'Users' },
    columns: [
      'email',
      'name',
      'platformRole',
      'totpEnabledAt',
      'lastLoginAt',
      'disabledAt',
      'createdAt',
    ],
    search: ['email', 'name'],
    hidden: ['passwordHash', 'totpSecretEnc'],
    orderBy: { createdAt: 'desc' },
    editor: 'user',
  },
  {
    model: 'Session',
    slug: 'sessions',
    group: 'accounts',
    label: { bg: 'Сесии', en: 'Sessions' },
    columns: ['userId', 'verified', 'createdAt', 'lastSeenAt', 'expiresAt'],
    search: ['userId'],
    hidden: ['csrfToken'],
    orderBy: { lastSeenAt: 'desc' },
  },
  {
    model: 'Organization',
    slug: 'organizations',
    group: 'accounts',
    label: { bg: 'Фирми и кантори', en: 'Companies and firms' },
    columns: ['legalName', 'kind', 'eik', 'vatNumber', 'addressCity', 'createdAt'],
    search: ['legalName', 'eik', 'vatNumber'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'Membership',
    slug: 'memberships',
    group: 'accounts',
    label: { bg: 'Членства', en: 'Memberships' },
    columns: ['userId', 'organizationId', 'role', 'createdAt'],
    search: ['userId', 'organizationId'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'ClientMandate',
    slug: 'mandates',
    group: 'accounts',
    label: { bg: 'Пълномощни', en: 'Authorisations' },
    columns: ['firmId', 'clientId', 'status', 'documentRef', 'validFrom', 'validTo'],
    search: ['firmId', 'clientId', 'documentRef'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'Party',
    slug: 'parties',
    group: 'documents',
    label: { bg: 'Контрагенти', en: 'Counterparties' },
    columns: ['name', 'organizationId', 'eik', 'vatNumber', 'countryCode'],
    search: ['name', 'eik', 'vatNumber'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'Item',
    slug: 'items',
    group: 'documents',
    label: { bg: 'Артикули', en: 'Items' },
    columns: ['name', 'organizationId', 'unitCode', 'netPrice', 'vatCategory', 'vatRate'],
    search: ['name', 'sellerItemId'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'DocumentSeries',
    slug: 'series',
    group: 'documents',
    label: { bg: 'Серии номера', en: 'Number series' },
    columns: ['name', 'organizationId', 'rangeStart', 'rangeEnd', 'nextNumber', 'isDefault'],
    search: ['name', 'organizationId'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'Document',
    slug: 'documents',
    group: 'documents',
    label: { bg: 'Документи', en: 'Documents' },
    columns: ['number', 'typeCode', 'status', 'issueDate', 'buyerName', 'payableCents', 'currency'],
    search: ['number', 'buyerName', 'buyerEik'],
    // XML-ът е голям — изтегля се от отделна връзка, не се рисува в таблицата.
    hidden: ['ublXml', 'ciiXml', 'input'],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'InboxEntry',
    slug: 'inbox',
    group: 'documents',
    label: { bg: 'Шкафчета (доставки)', en: 'Inbox deliveries' },
    columns: ['documentId', 'senderOrgId', 'recipientOrgId', 'status', 'deliveredAt', 'readAt'],
    search: ['documentId', 'senderOrgId', 'recipientOrgId'],
    hidden: [],
    orderBy: { deliveredAt: 'desc' },
  },
  {
    model: 'Notification',
    slug: 'notifications',
    group: 'platform',
    label: { bg: 'Писма (опашка)', en: 'Emails (queue)' },
    columns: [
      'kind',
      'organizationId',
      'status',
      'attempts',
      'nextAttemptAt',
      'sentAt',
      'lastError',
    ],
    search: ['kind', 'organizationId'],
    // Адресът на получателя е личен данни — не се показва в панела.
    hidden: ['toEmail', 'payload'],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'AuditLog',
    slug: 'audit',
    group: 'platform',
    label: { bg: 'Одит', en: 'Audit log' },
    columns: ['at', 'action', 'actorId', 'organizationId', 'targetType', 'targetId'],
    search: ['action', 'targetId', 'actorId'],
    hidden: [],
    orderBy: { id: 'desc' },
  },
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
  {
    model: 'Setting',
    slug: 'settings-raw',
    group: 'platform',
    label: { bg: 'Настройки (записи)', en: 'Settings (records)' },
    columns: ['key', 'value', 'updatedAt', 'updatedById'],
    search: ['key'],
    hidden: [],
    orderBy: { key: 'asc' },
    idField: 'key',
  },
  {
    model: 'FeatureFlag',
    slug: 'flags-raw',
    group: 'platform',
    label: { bg: 'Функции (записи)', en: 'Feature flags (records)' },
    columns: ['code', 'enabled', 'updatedAt', 'updatedById'],
    search: ['code'],
    hidden: [],
    orderBy: { code: 'asc' },
    idField: 'code',
  },
];

/** Минималният интерфейс на делегат на Prisma, който панелът ползва — само четене. */
interface ReadDelegate {
  findMany(args: {
    where?: unknown;
    orderBy?: unknown;
    skip?: number;
    take?: number;
  }): Promise<Array<Record<string, unknown>>>;
  count(args: { where?: unknown }): Promise<number>;
  findUnique(args: { where: Record<string, unknown> }): Promise<Record<string, unknown> | null>;
}

function delegateOf(model: string): ReadDelegate {
  const name = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate: unknown = (prisma as unknown as Record<string, unknown>)[name];
  if (
    typeof delegate !== 'object' ||
    delegate === null ||
    !('findMany' in delegate) ||
    !('count' in delegate) ||
    !('findUnique' in delegate)
  ) {
    throw new Error(`Няма делегат за ${model}`);
  }
  return delegate as ReadDelegate;
}

export function resourceBySlug(slug: string): AdminResource | undefined {
  return ADMIN_RESOURCES.find((resource) => resource.slug === slug);
}

function searchWhere(resource: AdminResource, q: string): unknown {
  if (!q) return undefined;
  return {
    OR: resource.search.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } })),
  };
}

/** Махa скритите полета — каквото не е позволено, не стига до изгледа дори по грешка в шаблона. */
export function redact(
  resource: AdminResource,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!resource.hidden.includes(key)) out[key] = value;
  }
  return out;
}

export const PAGE_SIZE = 50;

export async function listResource(
  resource: AdminResource,
  q: string,
  page: number,
): Promise<{ rows: Array<Record<string, unknown>>; total: number }> {
  const delegate = delegateOf(resource.model);
  const where = searchWhere(resource, q);
  const [rows, total] = await Promise.all([
    delegate.findMany({
      where,
      orderBy: resource.orderBy,
      skip: (Math.max(1, page) - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    delegate.count({ where }),
  ]);
  return { rows: rows.map((row) => redact(resource, row)), total };
}

export async function getResource(
  resource: AdminResource,
  id: string,
): Promise<Record<string, unknown> | null> {
  const field = resource.idField ?? 'id';
  // Одитът е с числов ключ — нечислов адрес е просто липсващ запис (404), не грешка на базата.
  if (resource.model === 'AuditLog' && !/^\d{1,19}$/.test(id)) return null;
  const value = resource.model === 'AuditLog' ? BigInt(id) : id;
  const row = await delegateOf(resource.model).findUnique({ where: { [field]: value } });
  return row ? redact(resource, row) : null;
}

export async function countResource(resource: AdminResource): Promise<number> {
  return delegateOf(resource.model).count({});
}
