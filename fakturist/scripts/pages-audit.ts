import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { companyData, PASSWORD, startApp, type E2eApp } from '../tests/e2e/support/app.js';
import { SITE_PAGES } from '../src/seo/pages.js';
import { isLanding } from '../src/seo/landing.js';

/**
 * Визуален одит на всяка страница (собственикът, 15.11.2026: „преди да слееш в мейн провери визуално всяка
 * една страница“): вдига приложението върху тестовата база, зарежда данни с латински имена (така всяка
 * кирилица на английска страница е непреведен интерфейс или законно българско съдържание на документ),
 * обхожда витрината, приложението (фирма и кантора) и мастър панела на български и английски, на 390 и
 * 1280 px. Пише снимките, контактни листове и `report.json` (статус, грешки в конзолата, хоризонтален
 * скрол, счупени картинки, кирилица на английските страници) в AUDIT_OUT.
 *
 *   TEST_DATABASE_URL=… AUDIT_OUT=/път npx tsx scripts/pages-audit.ts
 */
const OUT = process.env['AUDIT_OUT'] ?? '.tmp/pages-audit';
/** `dark` — снимките на тъмна тема (prefers-color-scheme). */
const SCHEME = process.env['AUDIT_SCHEME'] === 'dark' ? 'dark' : 'light';
/** Само адресите, които съдържат този низ (бърза проверка на една страница). */
const ONLY = process.env['AUDIT_ONLY'] ?? '';
/** `en` — само английският проход (проверката на превода е там). */
const LOCALES: readonly Locale[] = process.env['AUDIT_LOCALES'] === 'en' ? ['en'] : ['bg', 'en'];
type Locale = 'bg' | 'en';
const VIEWPORTS = [
  { name: 'm', width: 390, height: 844 },
  { name: 'd', width: 1280, height: 800 },
] as const;

interface Finding {
  url: string;
  role: string;
  locale: Locale;
  viewport: string;
  status: number;
  file: string;
  overflow: number;
  console: string[];
  brokenImages: number;
  cyrillic: string[];
}

interface Session {
  cookie: string;
  csrf: string;
}

const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .join('; ');

async function formLogin(app: E2eApp, email: string, code?: () => string): Promise<Session> {
  const first = await fetch(`${app.origin}/vhod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }),
  });
  let cookie = cookieOf(first);
  if (code) {
    const form = await (await fetch(`${app.origin}/vhod/kod`, { headers: { cookie } })).text();
    const csrf = /name="_csrf" value="([^"]+)"/.exec(form)?.[1] ?? '';
    const verified = await fetch(`${app.origin}/vhod/kod`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ _csrf: csrf, code: code() }),
    });
    cookie = cookieOf(verified)
      .split('; ')
      .filter((c) => c.startsWith('fakturist_sid='))
      .join('; ');
  }
  const page = await (await fetch(`${app.origin}/app`, { headers: { cookie } })).text();
  const csrf = /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '';
  return { cookie, csrf };
}

async function post(app: E2eApp, s: Session, path: string, fields: Record<string, string>) {
  const res = await fetch(`${app.origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: s.cookie },
    body: new URLSearchParams({ _csrf: s.csrf, ...fields }),
  });
  if (res.status !== 303) {
    const body = await res.text();
    const issues = [...body.matchAll(/<li><span class="mono">([^<]*)<\/span> · ([^<]*)/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    const errors = [...body.matchAll(/class="error"[^>]*>([^<]*)/g)].map((m) => m[1]);
    throw new Error(`${path}: ${res.status} ${[...issues, ...errors].join(' | ')}`);
  }
  return res.headers.get('location') ?? '';
}

const today = () => new Date().toISOString().slice(0, 10);

async function invoice(
  app: E2eApp,
  s: Session,
  orgId: string,
  buyer: Record<string, string>,
  iban: string,
) {
  const series = await app.prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: orgId },
  });
  const location = await post(app, s, `/app/o/${orgId}/nov`, {
    typeCode: '380',
    seriesId: series.id,
    issueDate: today(),
    taxPointDate: today(),
    dueDate: today(),
    currency: 'EUR',
    ...buyer,
    'buyer[street]': '5 Tsar Boris III Blvd',
    'buyer[city]': 'Varna',
    'buyer[postalCode]': '9000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Bookkeeping service',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '250.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
    'payment[meansCode]': '30',
    'payment[accountId]': iban,
  });
  return /\/d\/([^/?]+)/.exec(location)?.[1] ?? '';
}

async function seed(app: E2eApp) {
  const { prisma } = app;
  const { generateTotpSecret, totpCodeAt, totpStep } = await import('../src/auth/totp.js');
  const { encryptTotpSecret } = await import('../src/auth/keys.js');
  const { hashPassword } = await import('../src/auth/password.js');
  const { grantPlan } = await import('../src/billing/grant.js');

  const secret = generateTotpSecret();
  const master = await prisma.user.create({
    data: {
      email: 'master@example.test',
      name: 'Platform Master',
      passwordHash: await hashPassword(PASSWORD),
      platformRole: 'MASTER',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.user.update({
    where: { id: master.id },
    data: { totpSecretEnc: encryptTotpSecret(secret, master.id), totpEnabledAt: new Date() },
  });
  const masterCode = () => totpCodeAt(secret, totpStep(Math.floor(Date.now() / 1000)));

  const make = async (kind: 'company' | 'accountant', legalName: string) => {
    const data = companyData(app, legalName);
    const created = await app.register({
      kind,
      name: 'Ivan Petrov',
      email: data.email,
      password: PASSWORD,
      acceptTerms: 'on',
      legalName,
      eik: data.eik,
      vatNumber: kind === 'company' ? data.vat : undefined,
      addressStreet: '1 Vitosha Blvd',
      addressCity: 'Sofia',
      postalCode: '1000',
      iban: data.iban,
    });
    await prisma.organization.update({
      where: { id: created.organizationId },
      data: { verifiedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: created.userId },
      data: { emailVerifiedAt: new Date() },
    });
    return { ...data, ...created, legalName };
  };
  const a = await make('company', 'Zora Bakery EOOD');
  const b = await make('company', 'Zlato Mill OOD');
  const f = await make('accountant', 'Balance Accounting OOD');
  await grantPlan({
    organizationId: a.organizationId,
    actorId: master.id,
    planCode: 'business',
    months: 'forever',
    note: 'Visual audit',
    replacePaid: false,
  });

  const sa = await formLogin(app, a.email);
  const sb = await formLogin(app, b.email);
  const sf = await formLogin(app, f.email);
  const toB = {
    'buyer[name]': b.legalName,
    'buyer[legalId]': b.eik,
    'buyer[vatId]': b.vat,
  };
  const docId = await invoice(app, sa, a.organizationId, toB, a.iban);
  // От Б към А — документ в шкафчето на А.
  await invoice(
    app,
    sb,
    b.organizationId,
    {
      'buyer[name]': a.legalName,
      'buyer[legalId]': a.eik,
      'buyer[vatId]': a.vat,
    },
    b.iban,
  );
  const series = await prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: a.organizationId },
  });
  const proformaLocation = await post(app, sa, `/app/o/${a.organizationId}/nov`, {
    typeCode: 'proforma',
    seriesId: series.id,
    issueDate: today(),
    taxPointDate: today(),
    dueDate: today(),
    currency: 'EUR',
    ...toB,
    'buyer[street]': '5 Tsar Boris III Blvd',
    'buyer[city]': 'Varna',
    'buyer[postalCode]': '9000',
    'buyer[countryCode]': 'BG',
    'lines[0][name]': 'Annual support',
    'lines[0][quantity]': '1',
    'lines[0][unitCode]': 'C62',
    'lines[0][netPrice]': '1200.00',
    'lines[0][category]': 'S',
    'lines[0][rate]': '20',
  });
  const proformaId = /\/proformi\/([^/?]+)/.exec(proformaLocation)?.[1] ?? '';
  const party = await prisma.party.create({
    data: {
      organizationId: a.organizationId,
      name: b.legalName,
      eik: b.eik,
      vatNumber: b.vat,
      addressStreet: '5 Tsar Boris III Blvd',
      addressCity: 'Varna',
      postalCode: '9000',
      email: 'billing@example.test',
    },
  });
  const item = await prisma.item.create({
    data: { organizationId: a.organizationId, name: 'Bookkeeping service', netPrice: '250.00' },
  });
  // Кантората добавя фирма-клиент (пълномощно по декларацията на договора за обработване).
  const client = companyData(app, 'Client');
  await post(app, sf, `/app/o/${f.organizationId}/klienti/nov`, {
    legalName: 'Sunrise Trading EOOD',
    eik: client.eik,
    vatNumber: client.vat,
    addressStreet: '3 Rakovski St',
    addressCity: 'Plovdiv',
    postalCode: '4000',
    iban: client.iban,
    documentRef: 'Contract 12/2026',
    validFrom: today(),
    processorDeclaration: 'on',
  }).catch(() => '');
  const clientOrg = await prisma.organization.findFirst({
    where: { legalName: 'Sunrise Trading EOOD' },
    select: { id: true },
  });
  // Пълномощното чака собственика или мастъра — потвърждаваме го, за да се видят страниците на клиента.
  if (clientOrg) {
    await prisma.clientMandate.updateMany({
      where: { clientId: clientOrg.id },
      data: { status: 'ACTIVE' },
    });
  }
  const { buildEInvoice } = await import('../src/einvoice/index.js');
  const { domestic } = await import('../tests/fixtures/einvoice-samples.js');
  const built = buildEInvoice(
    { ...domestic, issueDate: today(), taxPointDate: today(), dueDate: today() },
    { profile: 'en16931' },
  );
  const incoming = await prisma.incomingInvoice.create({
    data: {
      organizationId: a.organizationId,
      format: 'UBL',
      xml: built.ok ? (built.ubl ?? '') : '',
      sha256: 'a'.repeat(64),
      supplierName: domestic.seller.name,
      supplierVat: domestic.seller.vatId ?? null,
      number: domestic.number,
      typeCode: '380',
      issueDate: new Date(`${today()}T00:00:00Z`),
      currency: 'EUR',
      payableCents: 11469n,
      vatCents: 1820n,
      issues: [],
      valid: true,
    },
  });
  const inbox = await prisma.inboxEntry.findFirst({
    where: { recipientOrgId: a.organizationId },
    select: { id: true },
  });
  const sub = await prisma.subscription.findFirstOrThrow({
    where: { organizationId: a.organizationId, status: 'ACTIVE' },
  });
  const { ADMIN_RESOURCES } = await import('../src/admin/registry.js');
  return {
    slugs: ADMIN_RESOURCES.map((r) => r.slug),
    master,
    masterCode,
    a,
    f,
    docId,
    proformaId,
    partyId: party.id,
    itemId: item.id,
    clientId: clientOrg?.id ?? null,
    inboxId: inbox?.id ?? null,
    incomingId: incoming.id,
    subscriptionId: sub.id,
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const LANDING_PAGES = SITE_PAGES.filter((page) => isLanding(page.id));

function urls(s: Seeded): Record<'public' | 'owner' | 'firm' | 'master', string[]> {
  const o = `/app/o/${s.a.organizationId}`;
  const fo = `/app/o/${s.f.organizationId}`;
  return {
    public: [
      '/',
      '/ceni',
      '/za-schetovoditeli',
      '/e-fakturi-2028',
      // Страниците за рекламите — само публикуваните (функция „проверява се“ няма страница, SPEC 99).
      ...LANDING_PAGES.map((page) => page.paths.bg),
      '/kakvo-novo',
      '/obshti-usloviya',
      '/poveritelnost',
      '/dogovor-za-obrabotvane',
      '/en/',
      '/en/pricing',
      '/en/accountants',
      ...LANDING_PAGES.map((page) => page.paths.en),
      '/en/e-invoicing-2028',
      '/en/whats-new',
      '/en/terms',
      '/en/privacy',
      '/en/data-processing',
      '/vhod',
      '/vhod?lang=en',
      '/registraciya',
      '/registraciya?lang=en',
      '/zabravena-parola',
      '/zabravena-parola?lang=en',
      '/prilozhenie',
      '/kak-raboti',
      '/en/how-it-works',
      '/nyama-takava-stranitsa',
      '/en/no-such-page',
    ],
    owner: [
      '/app',
      o,
      `${o}/nov`,
      `${o}/d/${s.docId}`,
      `${o}/d/${s.docId}/povtaryay`,
      `${o}/nov?zamenya=${s.docId}`,
      `${o}/proformi`,
      ...(s.proformaId ? [`${o}/proformi/${s.proformaId}`] : []),
      `${o}/vhodyashti`,
      `${o}/vhodyashti/${s.incomingId}`,
      `${o}/shkafche`,
      ...(s.inboxId ? [`${o}/shkafche/${s.inboxId}`] : []),
      `${o}/banka`,
      `${o}/povtaryashti`,
      `${o}/d/${s.docId}?ok=paid`,
      `${o}/kontragenti`,
      `${o}/kontragenti/nov`,
      `${o}/kontragenti/${s.partyId}`,
      `${o}/artikuli`,
      `${o}/artikuli/nov`,
      `${o}/artikuli/${s.itemId}`,
      `${o}/serii`,
      `${o}/chlenove`,
      `${o}/palnomoshtni`,
      `${o}/nastroyki`,
      `${o}/plan`,
      `${o}/api`,
      `${o}/peppol`,
      `${o}/dnevnik`,
      `${o}/saf-t`,
      `${o}/prekratyavane`,
      `${o}/sobstvenost`,
      '/app/sigurnost',
      '/app/pomosht',
    ],
    firm: [
      '/app',
      fo,
      `${fo}/klienti/nov`,
      `${fo}/palnomoshtni`,
      `${fo}/plan`,
      ...(s.clientId ? [`/app/o/${s.clientId}`, `/app/o/${s.clientId}/nov`] : []),
    ],
    master: [
      '/admin',
      '/admin/nastroyki',
      '/admin/funktsii',
      '/admin/planove/business',
      '/admin/mastari',
      '/admin/saobshteniya',
      '/admin/iztochnitsi',
      '/admin/iztochnitsi?dni=vsichki',
      `/admin/veriga/${s.a.organizationId}`,
      `/admin/r/organizations/${s.a.organizationId}`,
      `/admin/r/subscriptions/${s.subscriptionId}`,
      `/admin/r/documents/${s.docId}`,
      `/admin/r/users/${s.master.id}`,
      ...s.slugs.map((slug) => `/admin/r/${slug}`),
    ],
  };
}

async function inspect(
  page: Page,
  locale: Locale,
): Promise<Omit<Finding, 'url' | 'role' | 'locale' | 'viewport' | 'status' | 'file' | 'console'>> {
  return page.evaluate((loc) => {
    const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const brokenImages = [...document.images].filter(
      (i) => i.complete && i.naturalWidth === 0,
    ).length;
    // На английски: целият текст на страницата, вкл. скрития (затворени details/dialog, опциите на
    // падащите менюта), атрибутите, които четат екранните четци и браузърът, и заглавието на раздела.
    const found: string[] = [];
    if (loc === 'en') {
      const cyr = /[А-Яа-яЁё]/;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const parent = node.parentElement;
        if (!parent || parent.closest('script, style, noscript, [lang="bg"]')) continue;
        const text = (node.textContent ?? '').trim();
        if (cyr.test(text)) found.push(text.slice(0, 160));
      }
      const attrs = ['placeholder', 'title', 'aria-label', 'alt', 'data-label', 'aria-description'];
      for (const el of document.querySelectorAll('*')) {
        if (el.closest('[lang="bg"]')) continue;
        for (const name of attrs) {
          const value = el.getAttribute(name);
          if (value && cyr.test(value)) found.push(`@${name}: ${value.slice(0, 160)}`);
        }
        if (
          el instanceof HTMLInputElement &&
          /^(submit|button)$/.test(el.type) &&
          cyr.test(el.value)
        ) {
          found.push(`@value: ${el.value}`);
        }
      }
      if (cyr.test(document.title)) found.push(`<title>: ${document.title}`);
      const description = document
        .querySelector('meta[name="description"]')
        ?.getAttribute('content');
      if (description && cyr.test(description)) found.push(`<meta description>: ${description}`);
    }
    const cyrillic = [...new Set(found)].slice(0, 80);
    return { overflow, brokenImages, cyrillic };
  }, locale);
}

async function visit(
  context: BrowserContext,
  url: string,
  meta: { role: string; locale: Locale; viewport: string },
  origin: string,
): Promise<Finding> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 200)}`));
  const response = await page.goto(`${origin}${url}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const safe = url.replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 80) || 'root';
  const file = `${meta.role}-${meta.locale}-${meta.viewport}-${safe}.png`;
  await page.screenshot({ path: join(OUT, 'shots', file), fullPage: true });
  const found = await inspect(page, meta.locale);
  await page.close();
  return {
    url,
    ...meta,
    status: response?.status() ?? 0,
    file,
    console: consoleErrors,
    ...found,
  };
}

/**
 * Състоянията с грешка на английски: формите, изпратени празни или с невалидни стойности — съобщенията
 * за грешки, флаговете след пренасочване и страниците на гост (вход, регистрация, забравена парола).
 */
async function errorStates(app: E2eApp, s: Seeded): Promise<Finding[]> {
  const o = `/app/o/${s.a.organizationId}`;
  const fo = `/app/o/${s.f.organizationId}`;
  const owner = await formLogin(app, s.a.email);
  const firm = await formLogin(app, s.f.email);
  const master = await formLogin(app, 'master@example.test', s.masterCode);
  const guest: Session = { cookie: '', csrf: '' };
  const bad = { 'lines[0][netPrice]': '-5', issueDate: '2026-02-31', currency: 'XXX' };
  const cases: Array<[string, Session, string, Record<string, string>]> = [
    ['owner', owner, `${o}/nov`, {}],
    ['owner', owner, `${o}/nov`, { typeCode: '380', ...bad }],
    ['owner', owner, `${o}/nov`, { typeCode: '381' }],
    ['owner', owner, `${o}/kontragenti/nov`, { eik: '123', email: 'x' }],
    ['owner', owner, `${o}/artikuli/nov`, { netPrice: 'abc' }],
    ['owner', owner, `${o}/serii/nova`, { name: '', rangeStart: '9', rangeEnd: '1' }],
    ['owner', owner, `${o}/chlenove/pokani`, { email: 'x', role: 'ADMIN' }],
    ['owner', owner, `${o}/api`, { name: '' }],
    ['owner', owner, `${o}/saf-t`, { from: 'x' }],
    ['owner', owner, `${o}/prekratyavane`, { password: 'wrong' }],
    ['owner', owner, `${o}/nastroyki/pdf`, { accent: 'red' }],
    ['owner', owner, `${o}/plan/poruchka`, { planCode: 'nope' }],
    ['owner', owner, `${o}/peppol/vklyuchi`, {}],
    ['owner', owner, '/app/sigurnost/parola', { current: 'x', password: 'short' }],
    ['owner', owner, '/app/sigurnost/2fa', { code: '000000' }],
    ['owner', owner, `${o}/d/${s.docId}/plashtane`, { amount: '-1', paidOn: 'x' }],
    ['firm', firm, `${fo}/klienti/nov`, { eik: '1' }],
    ['master', master, '/admin/nastroyki', { 'documents.issueDeadlineDays': '-1' }],
    ['master', master, '/admin/saobshteniya', { subject: '' }],
    ['master', master, '/admin/mastari', { email: 'x' }],
    ['master', master, `/admin/firmi/${s.a.organizationId}/plan`, { planCode: 'business' }],
    ['master', master, `/admin/firmi/${s.a.organizationId}/plan/prekrati`, {}],
    [
      'public',
      guest,
      '/vhod?lang=en',
      { email: 'nobody@example.test', password: 'wrong-password' },
    ],
    ['public', guest, '/registraciya?lang=en', { email: 'x' }],
    ['public', guest, '/zabravena-parola?lang=en', { email: 'nobody@example.test' }],
  ];
  const context = await app.browser.newContext({ locale: 'en-GB', colorScheme: SCHEME });
  const out: Finding[] = [];
  for (const [role, session, path, fields] of cases) {
    if (!path.includes(ONLY)) continue;
    const res = await fetch(`${app.origin}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        ...(session.cookie ? { cookie: session.cookie } : {}),
      },
      body: new URLSearchParams({ ...(session.csrf ? { _csrf: session.csrf } : {}), ...fields }),
    });
    const page = await context.newPage();
    let status = res.status;
    let shown = path;
    if (status === 303) {
      shown = res.headers.get('location') ?? '/';
      await res.body?.cancel();
      if (session.cookie) {
        const [name, value] =
          session.cookie
            .split('; ')
            .find((c) => c.startsWith('fakturist_sid='))
            ?.split('=') ?? [];
        if (name && value) await context.addCookies([{ name, value, url: app.origin }]);
      }
      status =
        (await page.goto(`${app.origin}${shown}`, { waitUntil: 'networkidle' }))?.status() ?? 0;
      await context.clearCookies();
    } else {
      await page.setContent(await res.text(), { waitUntil: 'domcontentloaded' });
    }
    const found = await inspect(page, 'en');
    await page.close();
    out.push({
      url: `POST ${path} → ${shown}`,
      role,
      locale: 'en',
      viewport: 'form',
      status,
      file: '',
      console: [],
      ...found,
      overflow: 0,
      brokenImages: 0,
    });
  }
  await context.close();
  return out;
}

async function main() {
  mkdirSync(join(OUT, 'shots'), { recursive: true });
  const app = await startApp();
  const findings: Finding[] = [];
  try {
    const s = await seed(app);
    const list = urls(s);
    const users = {
      owner: s.a.userId,
      firm: s.f.userId,
      master: s.master.id,
    } as const;
    for (const locale of LOCALES) {
      await app.prisma.user.updateMany({
        where: { id: { in: Object.values(users) } },
        data: { locale },
      });
      for (const vp of VIEWPORTS) {
        for (const role of ['public', 'owner', 'firm', 'master'] as const) {
          const context = await app.browser.newContext({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: 1,
            locale: locale === 'en' ? 'en-GB' : 'bg-BG',
            colorScheme: SCHEME,
          });
          if (role !== 'public') {
            const email =
              role === 'owner' ? s.a.email : role === 'firm' ? s.f.email : 'master@example.test';
            const session = await formLogin(
              app,
              email,
              role === 'master' ? s.masterCode : undefined,
            );
            const [name, value] =
              session.cookie
                .split('; ')
                .find((c) => c.startsWith('fakturist_sid='))
                ?.split('=') ?? [];
            if (name && value) {
              await context.addCookies([{ name, value, url: app.origin }]);
            }
          }
          const pages = (role === 'public' && locale === 'en' ? [] : list[role]).filter((u) =>
            u.includes(ONLY),
          );
          for (const url of pages) {
            findings.push(
              await visit(context, url, { role, locale, viewport: vp.name }, app.origin),
            );
          }
          await context.close();
        }
      }
    }
    findings.push(...(await errorStates(app, s)));
    writeFileSync(join(OUT, 'report.json'), JSON.stringify(findings, null, 2));
    const problems = findings.filter(
      (f) =>
        (f.status >= 400 && !f.url.includes('nyama') && !f.url.includes('no-such')) ||
        f.console.length ||
        f.overflow > 0 ||
        f.brokenImages ||
        f.cyrillic.length,
    );
    console.log(`страници: ${findings.length} · с находки: ${problems.length} · ${OUT}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await app.browser.close();
    await app.prisma.$disconnect();
  }
  process.exit(process.exitCode ?? 0);
}

await main();
