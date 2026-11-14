import { AUTOMATION_RESOURCES } from './resources-automation.js';
import { BILLING_RESOURCES } from './resources-billing.js';

/**
 * Регистърът на мастър панела — ВСЯКА таблица от prisma/schema.prisma има ред тук (tests/admin-registry.test.ts
 * пада, ако някоя липсва). Така нов модел се появява в панела автоматично: списък, търсене, преглед на
 * запис и броят му на таблото. Чувствителните полета (`hidden`) никога не стигат до изгледа.
 * Таблиците на автоматизацията (Етап 2) са в resources-automation.ts.
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
  ...BILLING_RESOURCES,
  ...AUTOMATION_RESOURCES,
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
    // Контрагентът може да е физическо лице: мастърът вижда само каквото е нужно (т. 6 от договора за
    // обработване) — без имейла и точния адрес.
    hidden: ['email', 'addressStreet', 'postalCode'],
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
  {
    model: 'Integration',
    slug: 'integrations',
    group: 'platform',
    label: { bg: 'Интеграции', en: 'Integrations' },
    columns: ['code', 'lastCheckOk', 'lastCheckAt', 'updatedAt'],
    search: ['code'],
    // Шифрованите тайни не стигат до изгледа; подсказките (последните 4 знака) — да.
    hidden: ['secretsEnc'],
    orderBy: { code: 'asc' },
    idField: 'code',
  },
  {
    model: 'PdfStyle',
    slug: 'pdf-styles',
    group: 'documents',
    label: { bg: 'Изглед на PDF', en: 'PDF styles' },
    columns: ['organizationId', 'template', 'font', 'accent', 'logoType', 'updatedAt'],
    search: ['organizationId'],
    // Логото е двоично — не се рисува в панела (вижда се в образеца на фирмата).
    hidden: ['logo'],
    orderBy: { updatedAt: 'desc' },
    idField: 'organizationId',
  },
  {
    model: 'TransferInvite',
    slug: 'transfers',
    group: 'accounts',
    label: { bg: 'Покани за прехвърляне', en: 'Transfer invitations' },
    columns: ['organizationId', 'mandateId', 'createdAt', 'expiresAt', 'acceptedAt', 'revokedAt'],
    search: ['organizationId'],
    hidden: ['tokenHash'],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'UserToken',
    slug: 'user-tokens',
    group: 'accounts',
    label: { bg: 'Връзки по имейл', en: 'Email links' },
    columns: ['userId', 'purpose', 'createdAt', 'expiresAt', 'usedAt'],
    search: ['userId'],
    // Хешът е ключ за достъп до профила; адресът е личен — в панела се вижда профилът, не писмото.
    hidden: ['tokenHash', 'email'],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'MemberInvite',
    slug: 'member-invites',
    group: 'accounts',
    label: { bg: 'Покани за членове', en: 'Member invitations' },
    columns: ['organizationId', 'role', 'createdAt', 'expiresAt', 'acceptedAt', 'revokedAt'],
    search: ['organizationId'],
    hidden: ['tokenHash', 'email'],
    orderBy: { createdAt: 'desc' },
  },
  {
    model: 'LegalAcceptance',
    slug: 'legal-acceptances',
    group: 'accounts',
    label: { bg: 'Приети условия', en: 'Accepted terms' },
    columns: ['userId', 'organizationId', 'document', 'version', 'acceptedAt'],
    search: ['userId', 'organizationId'],
    hidden: [],
    orderBy: { acceptedAt: 'desc' },
  },
  {
    model: 'NewsEntry',
    slug: 'news-entries',
    group: 'platform',
    label: { bg: 'Новини („Какво ново“)', en: 'Updates (“What’s new”)' },
    columns: ['id', 'publishedAt'],
    search: ['id'],
    hidden: [],
    orderBy: { publishedAt: 'desc' },
  },
  {
    model: 'Announcement',
    slug: 'announcements',
    group: 'accounts',
    label: { bg: 'Съобщения до клиентите', en: 'Notices to customers' },
    columns: ['kind', 'subject', 'effectiveOn', 'recipients', 'createdAt'],
    search: ['subject'],
    hidden: [],
    orderBy: { createdAt: 'desc' },
  },
];
