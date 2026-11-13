import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { calculate, toUbl } from '../../src/einvoice/index.js';
import { SAMPLES, domestic } from '../fixtures/einvoice-samples.js';
import {
  byLabel,
  createCompany,
  horizontalOverflow,
  login,
  PROFILES,
  startApp,
  watch,
} from './support/app.js';
import type { E2eApp } from './support/app.js';

/**
 * „Входящи“: е-фактура от друг софтуер се качва през формата (UBL от официалните проби на ядрото) и се
 * проверява по правилата на EN 16931 и ЗДДС. Повторен файл се отказва, подправена сума се вижда като грешка,
 * платена се отбелязва с дата.
 */
let app: E2eApp;

before(async () => {
  app = await startApp();
});

after(async () => {
  await app.stop();
});

const ubl = (input: typeof domestic) => Buffer.from(toUbl(input, calculate(input)), 'utf8');

for (const profile of PROFILES) {
  test(`входящи: качване на UBL от пробите (${profile.name})`, async (t) => {
    const { t: tr } = app;
    const customer = await createCompany(app, 'Получател');
    const context = await app.context(profile);
    const page = await context.newPage();
    const watcher = watch(page);
    const upload = async (file: { name: string; buffer: Buffer }) => {
      await byLabel(page, tr('app.incoming.file')).setInputFiles({
        ...file,
        mimeType: 'application/xml',
      });
      await page.getByRole('button', { name: tr('app.incoming.upload'), exact: true }).click();
    };
    try {
      await login(app, page, customer.email);
      await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
      await page.getByRole('heading', { level: 1, name: tr('app.incoming.title') }).waitFor();
      await page.getByText(tr('app.incoming.none')).waitFor();
      assert.ok((await horizontalOverflow(page)) <= 0, 'хоризонтален скрол: входящи');

      await t.test('качва се UBL; доставчикът, номерът и сумите са разчетени', async () => {
        await upload({ name: 'domestic.xml', buffer: ubl(domestic) });
        await page.waitForURL(/\/vhodyashti\/[^/?]+\?ok=\w+$/);
        await page.getByRole('heading', { level: 1, name: domestic.number }).waitFor();
        const facts = await page.locator('dl.facts').first().innerText();
        assert.ok(facts.includes(domestic.seller.name), 'доставчикът');
        assert.match(facts, /114,69 EUR/);
        assert.match(facts, /18,20 EUR/);
        await page
          .locator('dl.facts')
          .getByText(tr('app.incoming.statuses.RECEIVED'), { exact: true })
          .waitFor();
        await page.getByText(tr('app.incoming.check')).waitFor();
        assert.ok((await horizontalOverflow(page)) <= 0, 'хоризонтален скрол: входяща фактура');
      });

      await t.test('всички официални проби се приемат и влизат в регистъра', async () => {
        for (const [name, input] of Object.entries(SAMPLES)) {
          if (input === domestic) continue;
          await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
          await upload({ name: `${name}.xml`, buffer: ubl(input) });
          await page.waitForURL(/\/vhodyashti\/[^/?]+\?ok=\w+$/);
          await page.getByRole('heading', { level: 1, name: input.number }).waitFor();
        }
        await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
        for (const input of Object.values(SAMPLES)) {
          await page.getByRole('link', { name: input.number, exact: true }).waitFor();
        }
        assert.equal(
          await page.locator('tbody tr').evaluateAll((rows) => rows.length),
          Object.keys(SAMPLES).length,
        );
      });

      await t.test('същият файл втори път се отказва', async () => {
        await upload({ name: 'domestic-again.xml', buffer: ubl(domestic) });
        const alert = page.getByRole('alert');
        await alert.waitFor();
        assert.equal(await alert.innerText(), tr('app.incoming.err.duplicate'));
      });

      await t.test('подправена обща сума се вижда като грешка TOTALS', async () => {
        const forged = toUbl(
          { ...domestic, number: '0000000999' },
          calculate({ ...domestic, number: '0000000999' }),
        ).replace(
          /<cbc:PayableAmount currencyID="EUR">[^<]+<\/cbc:PayableAmount>/,
          '<cbc:PayableAmount currencyID="EUR">1.00</cbc:PayableAmount>',
        );
        await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
        await upload({ name: 'forged.xml', buffer: Buffer.from(forged, 'utf8') });
        await page.waitForURL(/\/vhodyashti\/[^/?]+\?ok=uploadedIssues$/);
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.incoming.ok.uploadedIssues') })
          .waitFor();
        await page.locator('li').filter({ hasText: 'TOTALS' }).first().waitFor();
      });

      await t.test('не-фактура се отказва с обяснение', async () => {
        await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
        await upload({ name: 'drugo.xml', buffer: Buffer.from('<root><a>1</a></root>', 'utf8') });
        const alert = page.getByRole('alert');
        await alert.waitFor();
        assert.equal(await alert.innerText(), tr('app.incoming.err.notInvoice'));
      });

      await t.test('платена: статусът и датата се записват', async () => {
        await page.goto(`${app.origin}/app/o/${customer.organizationId}/vhodyashti`);
        await page.getByRole('link', { name: domestic.number, exact: true }).click();
        await byLabel(page, tr('app.incoming.status')).selectOption({
          label: tr('app.incoming.statuses.PAID'),
        });
        await page.getByRole('button', { name: tr('app.catalog.save'), exact: true }).click();
        await page
          .getByRole('status')
          .filter({ hasText: tr('app.incoming.ok.status') })
          .waitFor();
        await page
          .locator('dl.facts')
          .getByText(tr('app.incoming.statuses.PAID'), { exact: true })
          .waitFor();
      });

      // Очакваните отговори 4xx няма — отказите са пренасочвания с код, не грешки на мрежата.
      assert.deepEqual(watcher.problems(), [], 'конзола и мрежа');
    } finally {
      await context.close();
    }
  });
}
