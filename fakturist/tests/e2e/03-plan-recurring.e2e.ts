import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  byLabel,
  createCompany,
  horizontalOverflow,
  issueSimpleInvoice,
  login,
  PROFILES,
  startApp,
  watch,
} from './support/app.js';
import type { E2eApp } from './support/app.js';

/**
 * „План“ (поръчка по банков път → проформа → потвърдено плащане → активен план) и „Повтарящи се“ от
 * издадена фактура: на безплатния план функцията е заключена, след платения — отключена.
 * Картовият път (Revolut) няма ключ тук — така радио „С карта“ не се предлага и това е част от проверката.
 */
let app: E2eApp;
let masterId = '';

before(async () => {
  app = await startApp();
  // Доставчикът на плановете (Карбон Стелт): фирма с IBAN и серия; настройката го сочи.
  const supplier = await createCompany(app, 'Карбон Стелт');
  await app.prisma.setting.upsert({
    where: { key: 'billing.supplierOrgId' },
    create: { key: 'billing.supplierOrgId', value: supplier.organizationId },
    update: { value: supplier.organizationId },
  });
  app.invalidateSettings();
  masterId = (
    await app.prisma.user.create({
      data: {
        email: 'master-e2e@example.test',
        name: 'Мастър',
        passwordHash: 'x',
        platformRole: 'MASTER',
      },
    })
  ).id;
});

after(async () => {
  await app.stop();
});

function pdfText(path: string): string {
  const run = spawnSync('pdftotext', ['-layout', path, '-'], {
    encoding: 'utf8',
    maxBuffer: 10_000_000,
  });
  assert.equal(run.status, 0, `pdftotext: ${run.stderr}`);
  return run.stdout;
}

for (const profile of PROFILES) {
  test(`план по банков път и повтарящи се (${profile.name})`, async (t) => {
    const { t: tr } = app;
    const customer = await createCompany(app, 'Клиент');
    const context = await app.context(profile);
    const page = await context.newPage();
    const watcher = watch(page);
    const orgUrl = `${app.origin}/app/o/${customer.organizationId}`;
    try {
      await login(app, page, customer.email);

      let invoiceUrl = '';
      await t.test('безплатен план: „Повтаряй“ е заключено', async () => {
        await page.goto(`${orgUrl}/nov`);
        invoiceUrl = await issueSimpleInvoice(app, page, {
          buyer: 'Мебели Север ЕООД',
          line: 'Абонамент {период}',
          quantity: '1',
          price: '30.00',
        });
        await page.getByRole('link', { name: tr('app.recurring.repeat'), exact: true }).click();
        await page.getByRole('heading', { level: 1, name: tr('app.recurring.newTitle') }).waitFor();
        await page.getByText(tr('app.recurring.needsPlan')).first().waitFor();
        assert.equal(
          await page
            .getByRole('button', { name: tr('app.recurring.create'), exact: true })
            .isDisabled(),
          true,
        );
      });

      let reference = '';
      await t.test('„План“: поръчка по банков път дава проформа', async () => {
        await page.goto(orgUrl);
        await page.getByRole('link', { name: tr('app.plan.title'), exact: true }).click();
        await page.getByRole('heading', { level: 1, name: tr('app.plan.title') }).waitFor();
        await page.getByText(tr('app.plan.current')).waitFor();
        assert.ok((await horizontalOverflow(page)) <= 0, 'хоризонтален скрол: план');
        // Картата няма ключ → само банков път; цената е от сървъра: 9,00 + 1,80 ДДС = 10,80 €.
        assert.equal(
          await page.getByRole('radio', { name: new RegExp(`^${tr('app.plan.card')}`) }).count(),
          0,
        );
        const month = page.getByRole('radio', {
          name: new RegExp(`^Професионален · ${tr('app.plan.interval.MONTH')}`),
        });
        assert.match(
          await month.evaluate((el) => el.closest('label')?.textContent ?? ''),
          /10,80 €/,
        );
        await month.check();
        await page.getByRole('radio', { name: new RegExp(`^${tr('app.plan.transfer')}`) }).check();
        await page.getByRole('button', { name: tr('app.plan.order'), exact: true }).click();
        await page.waitForURL(/\/plan\/[^/?]+$/);
        const heading = await page.getByRole('heading', { level: 1 }).innerText();
        reference = /FKT-[A-Z0-9-]+/.exec(heading)?.[0] ?? '';
        assert.ok(reference, `основанието „FKT-…“ в заглавието: ${heading}`);
        await page.getByText(tr('app.plan.statuses.PENDING'), { exact: true }).first().waitFor();
        const panel = await page.locator('section.panel').first().innerText();
        assert.match(panel, new RegExp(customer.iban.slice(0, 4))); // IBAN на доставчика (същият тестов IBAN)
        assert.match(panel, /10,80 €/);
        assert.ok(panel.includes(reference));
        const [proforma] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('link', { name: tr('app.plan.proforma'), exact: true }).click(),
        ]);
        const bytes = readFileSync(await proforma.path());
        assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-');
        const text = pdfText(await proforma.path());
        assert.ok(text.includes(reference), 'проформата носи основанието');
        assert.match(text, /10,80 €/);
        assert.match(text, /BG80BNBG96611020345678/);
      });

      await t.test('потвърдено плащане → активен план и фактура', async () => {
        const payment = await app.prisma.payment.findFirstOrThrow({ where: { reference } });
        // Потвърждението е на мастъра (панелът има 2FA) — тук е същата функция, която той вика.
        const result = await app.activatePayment({
          paymentId: payment.id,
          paidAt: new Date(),
          confirmedById: masterId,
        });
        assert.equal(result.activated, true);
        await page.goto(`${orgUrl}/plan`);
        await page.getByText('Професионален').first().waitFor();
        await page.getByText(tr('app.plan.statuses.COMPLETED'), { exact: true }).first().waitFor();
        // Фактурата от Карбон Стелт е в шкафчето на фирмата: връзка с номера ѝ (от серията на доставчика).
        await page.getByRole('link', { name: /^\d{10}$/ }).click();
        await page.waitForURL(/\/shkafche\/[^/?]+$/);
      });

      await t.test('платен план: „Повтаряй“ създава повтаряща се фактура', async () => {
        await page.goto(`${invoiceUrl}/povtaryay`);
        await page.getByRole('heading', { level: 1, name: tr('app.recurring.newTitle') }).waitFor();
        assert.equal(await page.getByText(tr('app.recurring.needsPlan')).count(), 0);
        assert.equal(
          await byLabel(page, tr('app.recurring.name')).inputValue(),
          'Мебели Север ЕООД',
        );
        assert.equal(
          await byLabel(page, tr('app.recurring.line', { n: 1 })).inputValue(),
          'Абонамент {период}',
        );
        await byLabel(page, tr('app.recurring.name')).fill('Абонамент Мебели Север');
        await page.getByRole('button', { name: tr('app.recurring.create'), exact: true }).click();
        await page.waitForURL(/\/povtaryashti\?ok=created$/);
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.recurring.ok.created') })
          .waitFor();
        const row = page.locator('tbody tr').filter({ hasText: 'Абонамент Мебели Север' });
        await row.getByText(tr('app.recurring.statuses.ACTIVE'), { exact: true }).waitFor();
        await row.getByText(tr('app.recurring.frequencies.MONTHLY'), { exact: true }).waitFor();
        assert.ok((await horizontalOverflow(page)) <= 0, 'хоризонтален скрол: повтарящи се');
      });

      await t.test('пауза и продължаване', async () => {
        const row = page.locator('tbody tr').filter({ hasText: 'Абонамент Мебели Север' });
        await row
          .getByRole('button', { name: tr('app.recurring.actions.pause'), exact: true })
          .click();
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.recurring.ok.pause') })
          .waitFor();
        await row.getByText(tr('app.recurring.statuses.PAUSED'), { exact: true }).waitFor();
        await row
          .getByRole('button', { name: tr('app.recurring.actions.resume'), exact: true })
          .click();
        await row.getByText(tr('app.recurring.statuses.ACTIVE'), { exact: true }).waitFor();
      });

      assert.deepEqual(watcher.problems(), [], 'конзола и мрежа');
    } finally {
      await context.close();
    }
  });
}
