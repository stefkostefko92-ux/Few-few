import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  byLabel,
  companyData,
  createCompany,
  horizontalOverflow,
  inDays,
  issueSimpleInvoice,
  login,
  PROFILES,
  registerViaUi,
  startApp,
  watch,
} from './support/app.js';
import type { E2eApp } from './support/app.js';

/**
 * Кантора с клиент по пълномощно (чл. 113, ал. 7 ЗДДС), в два браузърни контекста: кантората добавя
 * фирма-клиент → до потвърждението не я вижда → собственикът потвърждава → кантората издава от негово име.
 */
let app: E2eApp;

before(async () => {
  app = await startApp();
});

after(async () => {
  await app.stop();
});

for (const profile of PROFILES) {
  test(`кантора и клиент по пълномощно (${profile.name})`, async (t) => {
    const { t: tr } = app;
    const owner = await createCompany(app, 'Клиент');
    const firm = companyData(app, 'Кантора');
    const firmContext = await app.context(profile);
    const ownerContext = await app.context(profile);
    try {
      const firmPage = await firmContext.newPage();
      // Единственият очакван 404: кантората още не вижда фирмата, докато пълномощното е чакащо.
      const firmWatch = watch(firmPage, [/^404 \S+\/nov$/]);
      const ownerPage = await ownerContext.newPage();
      const ownerWatch = watch(ownerPage);

      await t.test('кантората се регистрира и добавя фирма-клиент', async () => {
        await registerViaUi(app, firmPage, firm, 'accountant');
        await firmPage.getByRole('link', { name: firm.legalName }).waitFor();
        await firmPage.getByRole('link', { name: tr('app.home.addClient'), exact: true }).click();
        await firmPage.getByRole('heading', { level: 1, name: tr('app.client.title') }).waitFor();
        assert.ok((await horizontalOverflow(firmPage)) <= 0, 'хоризонтален скрол: нов клиент');
        await byLabel(firmPage, tr('auth.legalName')).fill(owner.legalName);
        await byLabel(firmPage, tr('auth.eik')).fill(owner.eik);
        await byLabel(firmPage, tr('auth.vatNumber')).fill(owner.vat);
        await byLabel(firmPage, tr('auth.addressStreet')).fill(owner.street);
        await byLabel(firmPage, tr('auth.addressCity')).fill(owner.city);
        await byLabel(firmPage, tr('auth.postalCode')).fill(owner.postalCode);
        await byLabel(firmPage, tr('app.client.documentRef')).fill('Пълномощно № 12 от 01.11.2026');
        await byLabel(firmPage, tr('app.client.validFrom')).fill(inDays(0));
        await firmPage.getByRole('checkbox').check();
        await firmPage.getByRole('button', { name: tr('app.client.save'), exact: true }).click();
        await firmPage.waitForURL(/\/app\?klient=hasOwner$/);
        await firmPage
          .getByRole('status')
          .filter({ hasText: tr('app.home.added.hasOwner') })
          .waitFor();
        await firmPage.getByText(tr('app.home.status.PENDING'), { exact: true }).waitFor();
      });

      await t.test('чакащо пълномощно: кантората не отваря фирмата', async () => {
        // Името е текст, не връзка, докато собственикът не потвърди.
        assert.equal(await firmPage.getByRole('link', { name: owner.legalName }).count(), 0);
        const response = await firmPage.goto(`${app.origin}/app/o/${owner.organizationId}/nov`);
        assert.equal(response?.status(), 404);
      });

      await t.test('собственикът потвърждава пълномощното', async () => {
        await login(app, ownerPage, owner.email);
        await ownerPage.getByRole('link', { name: owner.legalName }).click();
        await ownerPage
          .getByRole('link', { name: new RegExp(`^${tr('app.mandates.title')}`) })
          .click();
        await ownerPage
          .getByRole('heading', { level: 1, name: tr('app.mandates.title') })
          .waitFor();
        await ownerPage.getByText(firm.legalName).waitFor();
        await ownerPage
          .getByRole('button', { name: tr('app.mandates.approve'), exact: true })
          .click();
        await ownerPage.getByText(tr('app.home.status.ACTIVE'), { exact: true }).waitFor();
        assert.equal(
          await ownerPage
            .getByRole('button', { name: tr('app.mandates.approve'), exact: true })
            .count(),
          0,
        );
      });

      let documentUrl = '';
      await t.test('кантората издава фактура от името на клиента', async () => {
        await firmPage.goto(`${app.origin}/app`);
        await firmPage.getByRole('link', { name: owner.legalName }).click();
        await firmPage.getByRole('heading', { level: 1, name: owner.legalName }).waitFor();
        await firmPage.getByText(tr('app.org.via'), { exact: true }).waitFor();
        await firmPage.getByRole('link', { name: tr('app.org.new'), exact: true }).click();
        documentUrl = await issueSimpleInvoice(app, firmPage, {
          buyer: 'Транспорт Варна АД',
          line: 'Консултация',
          quantity: '1',
          price: '200.00',
        });
        await firmPage.getByRole('heading', { level: 1, name: '0000000001' }).waitFor();
        const facts = await firmPage.locator('dl.facts').first().innerText();
        // Издателят по пълномощно е записан в документа: кантората и основанието.
        assert.match(facts, new RegExp(firm.legalName));
        assert.match(facts, /Пълномощно № 12 от 01\.11\.2026/);
        assert.match(facts, /240,00/);
        assert.ok(
          documentUrl.includes(`/app/o/${owner.organizationId}/d/`),
          'документът е на клиента',
        );
      });

      await t.test('собственикът вижда фактурата на своята фирма', async () => {
        await ownerPage.goto(`${app.origin}/app/o/${owner.organizationId}`);
        await ownerPage.getByRole('link', { name: '0000000001' }).click();
        await ownerPage.getByRole('heading', { level: 1, name: '0000000001' }).waitFor();
        assert.match(await ownerPage.locator('dl.facts').first().innerText(), /Транспорт Варна АД/);
      });

      assert.deepEqual(firmWatch.problems(), [], 'кантора: конзола и мрежа');
      assert.deepEqual(ownerWatch.problems(), [], 'собственик: конзола и мрежа');
    } finally {
      await firmContext.close();
      await ownerContext.close();
    }
  });
}
