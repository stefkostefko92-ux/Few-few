import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { BrowserContext, Page } from 'playwright';
import { PASSWORD, startApp, type E2eApp } from '../tests/e2e/support/app.js';

/**
 * Живите кадри за промо клипа (promo/README.md): вдига Фактурист върху тестова база, зарежда примерни
 * данни на български (измислени фирми; на екрана ЕИК-ите са заменени с явно примерни номера) и снима
 * реалните страници на компютър (1440×900 @2x) и телефон (390×844 @3x) в dist/promo/shots/.
 *
 *   TEST_DATABASE_URL=postgresql://…/fakturist_audit_test npx tsx promo/capture.ts
 */
const OUT = join(process.cwd(), 'dist', 'promo', 'shots');
mkdirSync(OUT, { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

interface Session {
  cookie: string;
  csrf: string;
}
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0] ?? '')
    .join('; ');

async function login(app: E2eApp, email: string): Promise<Session> {
  const res = await fetch(`${app.origin}/vhod`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: PASSWORD }),
  });
  const cookie = cookieOf(res);
  const page = await (await fetch(`${app.origin}/app`, { headers: { cookie } })).text();
  return { cookie, csrf: /name="_csrf" value="([^"]+)"/.exec(page)?.[1] ?? '' };
}

async function post(app: E2eApp, s: Session, path: string, fields: Record<string, string>) {
  const res = await fetch(`${app.origin}${path}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: s.cookie },
    body: new URLSearchParams({ _csrf: s.csrf, ...fields }),
  });
  if (res.status !== 303)
    throw new Error(`${path}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.headers.get('location') ?? '';
}

type Line = [name: string, qty: string, unit: string, price: string, rate?: string];

async function issue(
  app: E2eApp,
  s: Session,
  orgId: string,
  iban: string,
  buyer: { name: string; eik: string; vat?: string; city: string; street: string; pc: string },
  lines: Line[],
  date: string,
  typeCode = '380',
  extra: Record<string, string> = {},
) {
  const series = await app.prisma.documentSeries.findFirstOrThrow({
    where: { organizationId: orgId, isDefault: true },
  });
  const fields: Record<string, string> = {
    typeCode,
    seriesId: series.id,
    issueDate: date,
    taxPointDate: date,
    dueDate: daysAgo(-14),
    currency: 'EUR',
    'buyer[name]': buyer.name,
    'buyer[legalId]': buyer.eik,
    ...(buyer.vat ? { 'buyer[vatId]': buyer.vat } : {}),
    'buyer[street]': buyer.street,
    'buyer[city]': buyer.city,
    'buyer[postalCode]': buyer.pc,
    'buyer[countryCode]': 'BG',
    'payment[meansCode]': '30',
    'payment[accountId]': iban,
    ...extra,
  };
  lines.forEach(([name, qty, unit, price, rate], i) => {
    fields[`lines[${i}][name]`] = name;
    fields[`lines[${i}][quantity]`] = qty;
    fields[`lines[${i}][unitCode]`] = unit;
    fields[`lines[${i}][netPrice]`] = price;
    fields[`lines[${i}][category]`] = 'S';
    fields[`lines[${i}][rate]`] = rate ?? '20';
  });
  const location = await post(app, s, `/app/o/${orgId}/nov`, fields);
  return /\/d\/([^/?]+)/.exec(location)?.[1] ?? '';
}

/** На екрана — явно примерни ЕИК/ДДС номера вместо истинските от сийда (те може да са на реални фирми). */
type Rects = Record<string, number[] | number[][]>;
/** Къде са ключовите елементи (CSS px от горния ляв ъгъл на страницата) — камерата на клипа се насочва по тях. */
const RECT_SELECTORS: Record<string, string> = {
  h1: 'main h1',
  table: 'main table',
  nav: '.org-nav',
  buyerName: 'input[name="buyer[name]"]',
  buyerEik: 'input[name="buyer[legalId]"]',
  buyerVat: 'input[name="buyer[vatId]"]',
  buyerStreet: 'input[name="buyer[street]"]',
  buyerCity: 'input[name="buyer[city]"]',
  buyerPc: 'input[name="buyer[postalCode]"]',
  line0name: 'input[name="lines[0][name]"]',
  line0qty: 'input[name="lines[0][quantity]"]',
  line0price: 'input[name="lines[0][netPrice]"]',
  line1name: 'input[name="lines[1][name]"]',
  line1qty: 'input[name="lines[1][quantity]"]',
  line1price: 'input[name="lines[1][netPrice]"]',
  issue: 'button.big',
  pdf: 'a[href$="/pdf"]',
  ubl: 'a[href$="ubl.xml"]',
  cii: 'a[href$="cii.xml"]',
  chain: '.chain',
};
/** Низ, не функция: tsx добавя помощника `__name`, който го няма в браузъра. */
const RECTS_OF = `(sel) => {
  const box = (el) => { const r = el.getBoundingClientRect(); return [r.x + scrollX, r.y + scrollY, r.width, r.height]; };
  const out = {};
  for (const [k, q] of Object.entries(sel)) { const el = document.querySelector(q); if (el) out[k] = box(el); }
  out.rows = [...document.querySelectorAll('main table tbody tr')].map(box);
  return out;
}`;

async function main() {
  const app = await startApp();
  const shots: Record<string, { file: string; w: number; h: number; rects: Rects }> = {};
  try {
    const { prisma } = app;
    const { grantPlan } = await import('../src/billing/grant.js');
    // Явно примерни ЕИК-и (вярна контролна цифра, поредици като 12345678…) — не на реални фирми по замисъл.
    const eiks = [
      '123456786',
      '987654322',
      '112233440',
      '556677881',
      '998877668',
      '135792467',
      '246813579',
      '864213570',
    ];
    const company = async (
      i: number,
      kind: 'company' | 'accountant',
      legalName: string,
      name: string,
      city: string,
      street: string,
      pc: string,
      email: string,
    ) => {
      const iban = ['BG80BNBG96611020345678', 'BG18RZBB91550123456789', 'BG27STSA93000012345678'][
        i % 3
      ]!;
      const r = await app.register({
        kind,
        name,
        email,
        password: PASSWORD,
        acceptTerms: 'on',
        legalName,
        eik: eiks[i]!,
        vatNumber: kind === 'company' ? `BG${eiks[i]}` : undefined,
        addressStreet: street,
        addressCity: city,
        postalCode: pc,
        iban,
      });
      await prisma.organization.update({
        where: { id: r.organizationId },
        data: { verifiedAt: new Date() },
      });
      await prisma.user.update({ where: { id: r.userId }, data: { emailVerifiedAt: new Date() } });
      return { ...r, iban, eik: eiks[i]!, legalName, city, street, pc };
    };
    const A = await company(
      0,
      'company',
      'Пекарна Зора ЕООД',
      'Мария Иванова',
      'София',
      'бул. „Витоша“ 18',
      '1000',
      'maria@zora.example',
    );
    const B = await company(
      1,
      'company',
      'Мелница Злато ООД',
      'Петър Колев',
      'Пловдив',
      'ул. „Гладстон“ 7',
      '4000',
      'petar@zlato.example',
    );
    const F = await company(
      2,
      'accountant',
      'Счетоводна кантора Баланс ООД',
      'Елена Георгиева',
      'Варна',
      'ул. „Драгоман“ 3',
      '9000',
      'elena@balans.example',
    );
    const master = await prisma.user.create({
      data: {
        email: 'promo-master@example.test',
        name: 'Екипът',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    });
    await grantPlan({
      organizationId: A.organizationId,
      actorId: master.id,
      planCode: 'business',
      months: 'forever',
      note: 'Промо клип',
      replacePaid: false,
    });

    const sa = await login(app, 'maria@zora.example');
    const sb = await login(app, 'petar@zlato.example');
    const sf = await login(app, 'elena@balans.example');
    const buyers = [
      {
        name: 'Кафе „Ъгъла“ ЕООД',
        eik: eiks[3]!,
        vat: `BG${eiks[3]}`,
        city: 'София',
        street: 'ул. „Шипка“ 12',
        pc: '1504',
      },
      {
        name: 'Хотел „Морска звезда“ АД',
        eik: eiks[4]!,
        vat: `BG${eiks[4]}`,
        city: 'Бургас',
        street: 'ул. „Александровска“ 40',
        pc: '8000',
      },
      {
        name: 'Магазини „Свежо“ ООД',
        eik: eiks[5]!,
        vat: `BG${eiks[5]}`,
        city: 'Русе',
        street: 'ул. „Александровска“ 5',
        pc: '7000',
      },
    ];
    const docs: string[] = [];
    docs.push(
      await issue(
        app,
        sa,
        A.organizationId,
        A.iban,
        buyers[0]!,
        [
          ['Хляб „Добруджа“ 650 г', '120', 'H87', '1.45'],
          ['Козунак с орехи', '24', 'H87', '6.90'],
          ['Доставка', '1', 'C62', '15.00'],
        ],
        daysAgo(9),
      ),
    );
    docs.push(
      await issue(
        app,
        sa,
        A.organizationId,
        A.iban,
        buyers[1]!,
        [
          ['Закуски — кетъринг, ноември', '1', 'C62', '1840.00'],
          ['Баничка със сирене', '300', 'H87', '1.20'],
        ],
        daysAgo(6),
      ),
    );
    docs.push(
      await issue(
        app,
        sa,
        A.organizationId,
        A.iban,
        buyers[2]!,
        [
          ['Хляб пълнозърнест 500 г', '200', 'H87', '1.60'],
          ['Питка с маслини', '80', 'H87', '2.10'],
        ],
        daysAgo(3),
      ),
    );
    docs.push(
      await issue(
        app,
        sa,
        A.organizationId,
        A.iban,
        buyers[0]!,
        [
          ['Хляб „Добруджа“ 650 г', '140', 'H87', '1.45'],
          ['Кроасан с масло', '60', 'H87', '1.30'],
        ],
        daysAgo(1),
      ),
    );
    // От Мелница Злато към Пекарна Зора — документ в шкафчето ѝ.
    await issue(
      app,
      sb,
      B.organizationId,
      B.iban,
      {
        name: A.legalName,
        eik: A.eik,
        vat: `BG${A.eik}`,
        city: A.city,
        street: A.street,
        pc: A.pc,
      },
      [
        ['Брашно тип 500, 25 кг', '40', 'H87', '17.80'],
        ['Брашно пълнозърнесто, 25 кг', '12', 'H87', '21.40'],
      ],
      daysAgo(2),
    );
    // Плащане по първия документ и повтаряща се фактура от втория.
    await post(app, sa, `/app/o/${A.organizationId}/d/${docs[0]}/plashtane`, {
      amount: '429.48',
      paidOn: daysAgo(4),
      note: '',
    }).catch(() => '');
    await post(app, sa, `/app/o/${A.organizationId}/d/${docs[1]}/povtaryay`, {
      name: 'Кетъринг за „Морска звезда“ — всеки месец',
      frequency: 'MONTHLY',
      nextRunOn: daysAgo(-20),
      dueDays: '14',
    }).catch(() => '');
    // Кантората: три фирми-клиенти.
    for (const [i, name] of [
      [6, 'Строй Груп ЕООД'],
      [7, 'Аптека „Здраве“ ООД'],
    ] as const) {
      await post(app, sf, `/app/o/${F.organizationId}/klienti/nov`, {
        legalName: name,
        eik: eiks[i]!,
        vatNumber: `BG${eiks[i]}`,
        addressStreet: 'ул. „Раковски“ 2',
        addressCity: 'Варна',
        postalCode: '9000',
        iban: 'BG80BNBG96611020345678',
        documentRef: 'Договор 12/2026',
        validFrom: today,
        processorDeclaration: 'on',
      }).catch(() => '');
    }
    await prisma.clientMandate.updateMany({
      where: { firmId: F.organizationId },
      data: { status: 'ACTIVE' },
    });
    const firmClients = await prisma.clientMandate.findMany({
      where: { firmId: F.organizationId },
      select: { clientId: true },
    });

    // Банково извлечение: двете постъпления се сверяват с документите.
    const numbers = await prisma.document.findMany({
      where: { organizationId: A.organizationId },
      orderBy: { number: 'asc' },
      select: { number: true, payableCents: true },
    });
    const csv = [
      'Дата;Наредител;Основание;Кредит;Валута',
      ...numbers.slice(1, 3).map(
        (d, i) =>
          `${daysAgo(1 - i)
            .split('-')
            .reverse()
            .join(
              '.',
            )};${buyers[i + 1]!.name};ф-ра ${d.number};${(Number(d.payableCents) / 100).toFixed(2).replace('.', ',')};EUR`,
      ),
    ].join('\r\n');
    const form = new FormData();
    form.set('_csrf', sa.csrf);
    form.set('file', new Blob([csv], { type: 'text/csv' }), 'izvlechenie.csv');
    await fetch(`${app.origin}/app/o/${A.organizationId}/banka`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: sa.cookie },
      body: form,
    });

    // ── снимките ─────────────────────────────────────────────────────────────────────────────────
    const o = `/app/o/${A.organizationId}`;
    const inbox = await prisma.inboxEntry.findFirst({
      where: { recipientOrgId: A.organizationId },
      select: { id: true },
    });
    const desk: Array<[string, string, string]> = [
      ['company', sa.cookie, o],
      ['new', sa.cookie, `${o}/nov`],
      ['doc', sa.cookie, `${o}/d/${docs[3]}`],
      ['inbox', sa.cookie, `${o}/shkafche`],
      ['inbox-entry', sa.cookie, `${o}/shkafche/${inbox?.id ?? ''}`],
      ['recurring', sa.cookie, `${o}/povtaryashti`],
      ['bank', sa.cookie, `${o}/banka`],
      ['journal', sa.cookie, `${o}/dnevnik`],
      ['saft', sa.cookie, `${o}/saf-t`],
      ['api', sa.cookie, `${o}/api`],
      ['security', sa.cookie, '/app/sigurnost'],
      ['firm-home', sf.cookie, '/app'],
      ['firm', sf.cookie, `/app/o/${F.organizationId}`],
      ...(firmClients[0]
        ? ([['client-new', sf.cookie, `/app/o/${firmClients[0].clientId}/nov`]] as Array<
            [string, string, string]
          >)
        : []),
      ['site', '', '/'],
      ['pricing', '', '/ceni'],
    ];
    const shoot = async (
      ctx: BrowserContext,
      name: string,
      cookie: string,
      path: string,
      prepare?: (page: Page) => Promise<void>,
    ) => {
      if (cookie) {
        const [k, v] =
          cookie
            .split('; ')
            .find((c) => c.startsWith('fakturist_sid='))
            ?.split('=') ?? [];
        if (k && v) await ctx.addCookies([{ name: k, value: v, url: app.origin }]);
      }
      const page: Page = await ctx.newPage();
      await page.goto(`${app.origin}${path}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // Без прозореца „Какво ново“ и без лентата за потвърждение — кадърът е на работната страница.
      await page.evaluate(() =>
        document
          .querySelectorAll('dialog[open], .news-popup, .verify-bar')
          .forEach((e) => e.remove()),
      );
      if (prepare) await prepare(page);
      const file = `${name}.png`;
      await page.screenshot({ path: join(OUT, file), fullPage: true });
      const size = await page.evaluate(() => ({
        w: innerWidth,
        h: document.documentElement.scrollHeight,
      }));
      const rects = (await page.evaluate(
        `(${RECTS_OF})(${JSON.stringify(RECT_SELECTORS)})`,
      )) as Rects;
      shots[name] = { file, w: size.w, h: size.h, rects };
      await page.close();
      await ctx.clearCookies();
    };
    const deskCtx = await app.browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      locale: 'bg-BG',
      timezoneId: 'Europe/Sofia',
    });
    for (const [name, cookie, path] of desk) await shoot(deskCtx, name, cookie, path);
    // Същата форма, попълнена като документ № 4 — клипът я „пише“ поле по поле върху празната.
    await shoot(deskCtx, 'new-filled', sa.cookie, `${o}/nov`, async (page) => {
      const fill: Array<[string, string]> = [
        ['buyer[name]', buyers[0]!.name],
        ['buyer[legalId]', buyers[0]!.eik],
        ['buyer[vatId]', buyers[0]!.vat],
        ['buyer[street]', buyers[0]!.street],
        ['buyer[city]', buyers[0]!.city],
        ['buyer[postalCode]', buyers[0]!.pc],
        ['lines[0][name]', 'Хляб „Добруджа“ 650 г'],
        ['lines[0][quantity]', '140'],
        ['lines[0][netPrice]', '1.45'],
        ['lines[1][name]', 'Кроасан с масло'],
        ['lines[1][quantity]', '60'],
        ['lines[1][netPrice]', '1.30'],
      ];
      for (const [field, value] of fill) {
        const input = page.locator(`input[name="${field}"]`);
        if ((await input.count()) > 0) await input.first().fill(value);
      }
    });
    await deskCtx.close();
    const phoneCtx = await app.browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      locale: 'bg-BG',
      timezoneId: 'Europe/Sofia',
    });
    for (const [name, cookie, path] of [
      ['phone-doc', sa.cookie, `${o}/d/${docs[3]}`],
      ['phone-company', sa.cookie, o],
    ] as const) {
      await shoot(phoneCtx, name, cookie, path);
    }
    await phoneCtx.close();

    // PDF и XML на документа — за 3D листа и за кода в клипа.
    for (const format of ['pdf', 'ubl.xml', 'cii.xml']) {
      const res = await fetch(`${app.origin}${o}/d/${docs[3]}/${format}`, {
        headers: { cookie: sa.cookie },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(join(OUT, `invoice.${format}`), buf);
    }
    execFileSync('pdftoppm', [
      '-png',
      '-r',
      '220',
      '-singlefile',
      join(OUT, 'invoice.pdf'),
      join(OUT, 'invoice'),
    ]);
    writeFileSync(join(OUT, 'shots.json'), JSON.stringify(shots, null, 1));
    console.log(`снимки: ${Object.keys(shots).length} → ${OUT}`);
  } finally {
    await app.stop();
  }
}

await main();
