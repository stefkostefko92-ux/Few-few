import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  byLabel,
  companyData,
  horizontalOverflow,
  inDays,
  PASSWORD,
  PROFILES,
  startApp,
  watch,
} from './support/app.js';
import type { E2eApp } from './support/app.js';
import type { Page } from './support/playwright.js';

/**
 * Потокът на фирмата, от край до край в истински Chromium: регистрация → изход → вход → контрагент в
 * каталога → фактура от формата → PDF и UBL → плащане (частично, после остатъкът). Мобилен и десктоп.
 */
let app: E2eApp;

before(async () => {
  app = await startApp();
});

after(async () => {
  await app.stop();
});

async function expectNoOverflow(page: Page, where: string): Promise<void> {
  assert.ok((await horizontalOverflow(page)) <= 0, `хоризонтален скрол: ${where}`);
}

for (const profile of PROFILES) {
  test(`фирма (${profile.name}): регистрация, вход, фактура, PDF и UBL, плащане`, async (t) => {
    const { t: tr } = app;
    const company = companyData(app, 'Зора');
    const context = await app.context(profile);
    const page = await context.newPage();
    // Единственият очакван отговор 4xx: грешната парола във входа.
    const watcher = watch(page, [/^400 \S+\/vhod$/]);
    try {
      await t.test('регистрация на фирма води в приложението', async () => {
        await page.goto(`${app.origin}/registraciya`);
        await page.getByRole('heading', { level: 1, name: tr('auth.registerTitle') }).waitFor();
        await expectNoOverflow(page, 'регистрация');
        await byLabel(page, tr('auth.name')).fill(company.name);
        await byLabel(page, tr('auth.email')).fill(company.email);
        await byLabel(page, tr('auth.password')).fill(PASSWORD);
        await byLabel(page, tr('auth.legalName')).fill(company.legalName);
        await byLabel(page, tr('auth.eik')).fill(company.eik);
        await byLabel(page, tr('auth.vatNumber')).fill(company.vat);
        await byLabel(page, tr('auth.addressStreet')).fill(company.street);
        await byLabel(page, tr('auth.addressCity')).fill(company.city);
        await byLabel(page, tr('auth.postalCode')).fill(company.postalCode);
        await byLabel(page, tr('auth.iban')).fill(company.iban);
        await page.getByRole('checkbox').check();
        await page.getByRole('button', { name: tr('auth.create'), exact: true }).click();
        await page.waitForURL(`${app.origin}/app`);
        await page.getByRole('link', { name: company.legalName }).waitFor();
      });

      await t.test('изход и вход: грешната парола не пуска, вярната — да', async () => {
        await page.getByRole('button', { name: tr('auth.logout'), exact: true }).click();
        await page.waitForURL(`${app.origin}/`);
        // Защитена страница без сесия води към входа.
        await page.goto(`${app.origin}/app`);
        await page.waitForURL(/\/vhod/);
        await byLabel(page, tr('auth.email')).fill(company.email);
        await byLabel(page, tr('auth.password')).fill(`${PASSWORD}-грешна`);
        await page.getByRole('button', { name: tr('auth.login'), exact: true }).click();
        await page.getByRole('alert').waitFor();
        assert.equal(await page.getByRole('alert').innerText(), tr('auth.invalid'));
        await byLabel(page, tr('auth.password')).fill(PASSWORD);
        await page.getByRole('button', { name: tr('auth.login'), exact: true }).click();
        await page.waitForURL(`${app.origin}/app`);
        await page.getByRole('link', { name: company.legalName }).click();
        await page.getByRole('heading', { level: 1, name: company.legalName }).waitFor();
        await expectNoOverflow(page, 'страница на фирмата');
      });

      await t.test('контрагент в каталога', async () => {
        await page.getByRole('link', { name: tr('app.catalog.parties'), exact: true }).click();
        await page.waitForURL(/\/kontragenti$/);
        await page.goto(`${page.url()}/nov`);
        await byLabel(page, tr('app.catalog.name')).fill('Пекарна Слънце ООД');
        await byLabel(page, tr('auth.addressStreet')).fill('бул. „България“ 10');
        await byLabel(page, tr('auth.addressCity')).fill('Пловдив');
        await byLabel(page, tr('auth.postalCode')).fill('4000');
        await byLabel(page, tr('app.catalog.emailOptional')).fill('kasa@slance.example.test');
        await page.getByRole('button', { name: tr('app.catalog.save'), exact: true }).click();
        await page.waitForURL(/\/kontragenti(\?.*)?$/);
        await page.getByText('Пекарна Слънце ООД').first().waitFor();
      });

      let documentUrl = '';
      await t.test('фактура от формата с контрагента от каталога', async () => {
        await page.goto(`${app.origin}/app`);
        await page.getByRole('link', { name: company.legalName }).click();
        await page.getByRole('link', { name: tr('app.org.new'), exact: true }).click();
        await page.getByRole('heading', { level: 1, name: tr('app.doc.title') }).waitFor();
        await expectNoOverflow(page, 'нов документ');
        await byLabel(page, tr('app.catalog.pickParty')).selectOption({
          label: 'Пекарна Слънце ООД',
        });
        await page.getByRole('button', { name: tr('app.catalog.fill'), exact: true }).click();
        // Получателят се попълва от каталога — полетата носят данните му.
        await byLabel(page, tr('app.doc.buyerName')).waitFor();
        await page.waitForLoadState('load');
        assert.equal(
          await byLabel(page, tr('app.doc.buyerName')).inputValue(),
          'Пекарна Слънце ООД',
        );
        assert.equal(await byLabel(page, tr('app.doc.city')).inputValue(), 'Пловдив');
        // BR-CO-25: при сума за плащане над нула е нужен падеж.
        await byLabel(page, tr('app.doc.dueDate')).fill(inDays(14));
        await byLabel(page, `${tr('app.doc.lineName')} 1`).fill('Абонаментна поддръжка');
        await byLabel(page, `${tr('app.doc.quantity')} 1`).fill('2');
        await byLabel(page, `${tr('app.doc.price')} 1`).fill('50.00');
        await page.getByRole('button', { name: tr('app.doc.issue'), exact: true }).click();
        await page.waitForURL(/\/d\/[^/?]+\?issued=1$/);
        documentUrl = page.url().split('?')[0] ?? '';
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.view.issued') })
          .waitFor();
        await page.getByRole('heading', { level: 1, name: '0000000001' }).waitFor();
        const facts = await page.locator('dl.facts').first().innerText();
        assert.match(facts, /Пекарна Слънце ООД/);
        assert.match(facts, /100,00/);
        assert.match(facts, /20,00/);
        assert.match(facts, /120,00/);
        await expectNoOverflow(page, 'издадена фактура');
      });

      await t.test('PDF и UBL се теглят и съдържат документа', async () => {
        const [pdf] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('link', { name: `${tr('app.view.download')} PDF`, exact: true }).click(),
        ]);
        assert.equal(pdf.suggestedFilename(), '0000000001.pdf');
        assert.equal(
          readFileSync(await pdf.path())
            .subarray(0, 5)
            .toString('latin1'),
          '%PDF-',
        );
        const [ubl] = await Promise.all([
          page.waitForEvent('download'),
          page
            .getByRole('link', {
              name: `${tr('app.view.download')} ${tr('app.view.ubl')}`,
              exact: true,
            })
            .click(),
        ]);
        assert.match(ubl.suggestedFilename(), /^0000000001-ubl\.xml$/);
        const xml = readFileSync(await ubl.path(), 'utf8');
        assert.match(xml, /<cbc:ID>0000000001<\/cbc:ID>/);
        assert.match(xml, /Пекарна Слънце ООД/);
        assert.match(xml, new RegExp(`<cbc:CompanyID>BG${company.eik}</cbc:CompanyID>`));
        assert.match(xml, /<cbc:PayableAmount currencyID="EUR">120\.00<\/cbc:PayableAmount>/);
      });

      await t.test('плащане: частично, после остатъкът → платена', async () => {
        await page.goto(documentUrl);
        const panel = page.locator('#plashtane');
        await panel.getByText(tr('app.payment.states.UNPAID'), { exact: true }).waitFor();
        const amount = byLabel(page, `${tr('app.payment.amount')} (EUR)`);
        await amount.fill('20.00');
        await page.getByRole('button', { name: tr('app.payment.record'), exact: true }).click();
        await panel.getByText(tr('app.payment.states.PARTIAL'), { exact: true }).waitFor();
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.payment.result.ok') })
          .waitFor();
        // Остатъкът е предложен в полето; записва се както е.
        assert.equal(await amount.inputValue(), '100.00');
        await page.getByRole('button', { name: tr('app.payment.record'), exact: true }).click();
        await panel.getByText(tr('app.payment.states.PAID'), { exact: true }).waitFor();
        // Платената фактура няма форма за ново плащане.
        assert.equal(await panel.locator('form[action$="/plashtane"]').count(), 0);
        await expectNoOverflow(page, 'платена фактура');
      });

      assert.deepEqual(watcher.problems(), [], 'конзола и мрежа');
    } finally {
      await context.close();
    }
  });
}
