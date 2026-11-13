import { randomBytes } from 'node:crypto';
import { createServer as createNetServer, type AddressInfo } from 'node:net';
import { prepareTestDatabase, truncateAll } from '../../integration/harness.js';
import {
  launchChromium,
  type Browser,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Response,
} from './playwright.js';

/**
 * Общото за e2e пакета: сървърът срещу тестовата база (същата схема като интеграционните тестове),
 * Chromium, профилите на екрана, пазачът за конзолата и мрежата, фабриките за тестови данни.
 * Ключовете (JWT_SECRET, LEDGER_SEAL_KEY) са случайни за пускането — `prepareTestDatabase`.
 */
export const PASSWORD = 'дълга-и-трудна-парола-2026';

export interface Profile {
  name: 'мобилен 390' | 'десктоп 1280';
  width: number;
  height: number;
  mobile: boolean;
}

export const MOBILE: Profile = { name: 'мобилен 390', width: 390, height: 844, mobile: true };
export const DESKTOP: Profile = { name: 'десктоп 1280', width: 1280, height: 800, mobile: false };
export const PROFILES: readonly Profile[] = [MOBILE, DESKTOP];

type Modules = {
  prisma: (typeof import('../../../src/db.js'))['prisma'];
  register: (typeof import('../../../src/accounts/register.js'))['register'];
  seedPlans: (typeof import('../../../src/billing/seed-plans.js'))['seedPlans'];
  invalidateSettings: (typeof import('../../../src/admin/settings.js'))['invalidateSettings'];
  activatePayment: (typeof import('../../../src/billing/orders.js'))['activatePayment'];
  isValidEik: (typeof import('../../../src/einvoice/bg-ids.js'))['isValidEik'];
  translator: (typeof import('../../../src/i18n.js'))['translator'];
};

export interface E2eApp extends Modules {
  origin: string;
  browser: Browser;
  /** Нов, изолиран контекст (бисквитки, хранилище) с профила на екрана — `bg-BG`, Europe/Sofia. */
  context(profile: Profile): Promise<BrowserContext>;
  /** Български низ от речника на продукта — същият, който вижда потребителят. */
  t: (key: string, params?: Record<string, string | number>) => string;
  stop(): Promise<void>;
}

/**
 * Свободен порт. CSRF пазачът сравнява заглавието Origin с PUBLIC_BASE_URL, а браузърът пише истинския
 * адрес — затова портът се знае, преди приложението да прочете конфига.
 */
async function freePort(): Promise<number> {
  const probe = createNetServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

/** Вдига сървъра на свободен порт, празни таблиците и зарежда плановете; връща и браузъра. */
export async function startApp(): Promise<E2eApp> {
  const port = await freePort();
  process.env['PUBLIC_BASE_URL'] = `http://127.0.0.1:${port}`;
  prepareTestDatabase();
  // Логът на сървъра заглушава изхода на тестовете; грешките (warn+) остават.
  process.env['LOG_LEVEL'] ??= 'warn';
  process.env['REGISTRATION_OPEN'] = 'true';
  process.env['BILLING_IBAN'] = 'BG80BNBG96611020345678';
  // Без SMTP писмата чакат в опашката — тестът не праща нищо навън.
  delete process.env['SMTP_HOST'];
  const { prisma } = await import('../../../src/db.js');
  const { register } = await import('../../../src/accounts/register.js');
  const { seedPlans } = await import('../../../src/billing/seed-plans.js');
  const { invalidateSettings } = await import('../../../src/admin/settings.js');
  const { activatePayment } = await import('../../../src/billing/orders.js');
  const { isValidEik } = await import('../../../src/einvoice/bg-ids.js');
  const { translator } = await import('../../../src/i18n.js');
  const { createServer } = await import('../../../src/server.js');

  await truncateAll(prisma);
  await prisma.$transaction((tx) => seedPlans(tx));
  const server = createServer().listen(port, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${port}`;
  const browser = await launchChromium();
  const t = translator('bg', true);
  return {
    prisma,
    register,
    seedPlans,
    invalidateSettings,
    activatePayment,
    isValidEik,
    translator,
    origin,
    browser,
    t,
    async context(profile) {
      const context = await browser.newContext({
        viewport: { width: profile.width, height: profile.height },
        locale: 'bg-BG',
        timezoneId: 'Europe/Sofia',
        isMobile: profile.mobile,
        hasTouch: profile.mobile,
        acceptDownloads: true,
      });
      // Авто-чакането на Playwright е до 10 с: бавна заявка минава, счупена страница не виси 30 с.
      context.setDefaultTimeout(10_000);
      return context;
    },
    async stop() {
      await browser.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
    },
  };
}

let eikCursor = 100_000_000 + (randomBytes(2).readUInt16BE() % 5000) * 100;

/** Следващият ЕИК с вярна контролна цифра — всеки тест взема свой, без сблъсък в `Organization.eik`. */
export function nextEik(app: Pick<E2eApp, 'isValidEik'>): string {
  for (;;) {
    eikCursor += 1;
    const candidate = String(eikCursor);
    if (app.isValidEik(candidate)) return candidate;
  }
}

export interface Company {
  name: string;
  email: string;
  legalName: string;
  eik: string;
  vat: string;
  street: string;
  city: string;
  postalCode: string;
  iban: string;
}

let sequence = 0;

/** Данни за нова фирма (още не е регистрирана) — уникални имейл, ЕИК и име. */
export function companyData(app: Pick<E2eApp, 'isValidEik'>, label: string): Company {
  sequence += 1;
  const eik = nextEik(app);
  return {
    name: 'Иван Петров',
    email: `e2e-${sequence}@example.test`,
    legalName: `${label} ${sequence} ЕООД`,
    eik,
    vat: `BG${eik}`,
    street: 'ул. „Витоша“ 1',
    city: 'София',
    postalCode: '1000',
    iban: 'BG80BNBG96611020345678',
  };
}

/** Фабрика: фирма през същата транзакция като регистрацията (за предусловия, не за потока). */
export async function createCompany(
  app: E2eApp,
  label: string,
  kind: 'company' | 'accountant' = 'company',
): Promise<Company & { userId: string; organizationId: string }> {
  const data = companyData(app, label);
  const created = await app.register({
    kind,
    name: data.name,
    email: data.email,
    password: PASSWORD,
    acceptTerms: 'on',
    legalName: data.legalName,
    eik: data.eik,
    vatNumber: data.vat,
    addressStreet: data.street,
    addressCity: data.city,
    postalCode: data.postalCode,
    iban: data.iban,
  });
  return { ...data, ...created };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Поле по етикета му. Етикетът в продукта обгръща и подсказката („Парола … Поне 12 знака“), затова
 * съвпадението е по началото на името (без цифра след него: „Количество 1“ не хваща „Количество 10“) — не подниз.
 */
export function byLabel(page: Pick<Page, 'getByLabel'>, text: string) {
  return page.getByLabel(new RegExp(`^${escapeRegExp(text)}(?!\\d)`));
}

/** Вход през формата на `/vhod`. */
export async function login(app: E2eApp, page: Page, email: string): Promise<void> {
  await page.goto(`${app.origin}/vhod`);
  await byLabel(page, app.t('auth.email')).fill(email);
  await byLabel(page, app.t('auth.password')).fill(PASSWORD);
  await page.getByRole('button', { name: app.t('auth.login'), exact: true }).click();
  await page.waitForURL(`${app.origin}/app`);
}

/**
 * Пазач за грешки в конзолата, необработени изключения и отговори 4xx/5xx („СТАТУС адрес“). Очакваните
 * (напр. 400 при грешна парола) се подават в `allow`.
 */
export interface Watcher {
  problems(): string[];
}

export function watch(page: Page, allow: ReadonlyArray<RegExp> = []): Watcher {
  const seen: string[] = [];
  const note = (text: string) => {
    if (!allow.some((pattern) => pattern.test(text))) seen.push(text);
  };
  page.on('console', (message: ConsoleMessage) => {
    // „Failed to load resource“ дублира отговора 4xx/5xx — той е хванат по-долу, с адреса.
    if (message.text().startsWith('Failed to load resource')) return;
    if (message.type() === 'error' || message.type() === 'warning') {
      note(`конзола ${message.type()} (${message.location().url}): ${message.text()}`);
    }
  });
  page.on('pageerror', (error: Error) => note(`изключение: ${error.message}`));
  page.on('response', (response: Response) => {
    if (response.status() >= 400) note(`${response.status()} ${response.url()}`);
  });
  return { problems: () => [...seen] };
}

/** Страницата не излиза встрани: няма хоризонтален скрол. */
export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate<number>(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
}

/** Дата `ГГГГ-ММ-ДД` след `days` дни от днес — за падежи и срокове във формите. */
export function inDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Регистрация през формата на `/registraciya` (за потоците, където тя е предусловие, не предмет). */
export async function registerViaUi(
  app: E2eApp,
  page: Page,
  data: Company,
  kind: 'company' | 'accountant',
): Promise<void> {
  const { t } = app;
  await page.goto(`${app.origin}/registraciya`);
  if (kind === 'accountant') {
    await page.getByRole('radio', { name: t('auth.kindAccountant') }).check();
  }
  await byLabel(page, t('auth.name')).fill(data.name);
  await byLabel(page, t('auth.email')).fill(data.email);
  await byLabel(page, t('auth.password')).fill(PASSWORD);
  await byLabel(page, t('auth.legalName')).fill(data.legalName);
  await byLabel(page, t('auth.eik')).fill(data.eik);
  await byLabel(page, t('auth.vatNumber')).fill(data.vat);
  await byLabel(page, t('auth.addressStreet')).fill(data.street);
  await byLabel(page, t('auth.addressCity')).fill(data.city);
  await byLabel(page, t('auth.postalCode')).fill(data.postalCode);
  await byLabel(page, t('auth.iban')).fill(data.iban);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: t('auth.create'), exact: true }).click();
  await page.waitForURL(`${app.origin}/app`);
}

/** Попълва формата „Нов документ“ с купувач, един ред и падеж и я подава; връща адреса на документа. */
export async function issueSimpleInvoice(
  app: E2eApp,
  page: Page,
  options: { buyer: string; line: string; quantity: string; price: string },
): Promise<string> {
  const { t } = app;
  await page.getByRole('heading', { level: 1, name: t('app.doc.title') }).waitFor();
  await byLabel(page, t('app.doc.buyerName')).fill(options.buyer);
  await byLabel(page, t('app.doc.street')).fill('ул. „Цар Борис III“ 5');
  await byLabel(page, t('app.doc.city')).fill('Варна');
  await byLabel(page, t('app.doc.postalCode')).fill('9000');
  await byLabel(page, t('app.doc.dueDate')).fill(inDays(14));
  await byLabel(page, `${t('app.doc.lineName')} 1`).fill(options.line);
  await byLabel(page, `${t('app.doc.quantity')} 1`).fill(options.quantity);
  await byLabel(page, `${t('app.doc.price')} 1`).fill(options.price);
  await page.getByRole('button', { name: t('app.doc.issue'), exact: true }).click();
  await page.waitForURL(/\/d\/[^/?]+\?issued=1$/);
  return page.url().split('?')[0] ?? '';
}

/** Какво показва страницата на четец и клавиатура — един преглед на DOM, без CSS селектори в тестовете. */
export interface PageAudit {
  lang: string;
  title: string;
  h1: string[];
  /** Полета без име (етикет, aria-label, aria-labelledby или title). */
  unnamedFields: string[];
  /** Връзки и бутони без текст и без aria-label. */
  unnamedActions: string[];
  /** Изображения без атрибут alt. */
  imagesWithoutAlt: string[];
  landmarks: { main: number };
  /** Анимации, които още вървят в момента. */
  runningAnimations: number;
}

const AUDIT_EXPRESSION = `(() => {
  const named = (el) => Boolean(el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title') || (el.labels && el.labels.length > 0));
  const fields = [...document.querySelectorAll('input, select, textarea')]
    .filter((el) => !['hidden', 'submit', 'button', 'image'].includes(el.type))
    .filter((el) => !named(el))
    .map((el) => el.name || el.id || el.tagName);
  const actions = [...document.querySelectorAll('a[href], button')]
    .filter((el) => !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.querySelector('img[alt]:not([alt=""])'))
    .map((el) => el.outerHTML.slice(0, 80));
  const images = [...document.querySelectorAll('img')].filter((el) => !el.hasAttribute('alt')).map((el) => el.getAttribute('src') || 'img');
  return {
    lang: document.documentElement.lang,
    title: document.title,
    h1: [...document.querySelectorAll('h1')].map((el) => (el.textContent || '').trim()),
    unnamedFields: fields,
    unnamedActions: actions,
    imagesWithoutAlt: images,
    landmarks: { main: document.querySelectorAll('main, [role=main]').length },
    runningAnimations: document.getAnimations().filter((a) => a.playState === 'running').length,
  };
})()`;

export function auditPage(page: Page): Promise<PageAudit> {
  return page.evaluate<PageAudit>(AUDIT_EXPRESSION);
}
