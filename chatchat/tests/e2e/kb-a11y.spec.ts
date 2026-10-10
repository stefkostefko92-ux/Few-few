import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { cookieLogin, newStaff } from './support/world.js';

/**
 * Достъпност (WCAG 2.1 AA) на новите екрани на знанието — в светла и тъмна тема: сравнението на
 * ревизии (две колони, разлика със знак + текст), документите на табло и детайлът на код за грешка
 * с историята. Същото правило като a11y.spec.ts: всяко нарушение е червен тест.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
  );
  expect(report, `a11y нарушения на „${screen}“:\n${report.join('\n')}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`a11y · знание (${scheme}): сравнение на ревизии, документи на табло, код с история`, async ({
    browser,
  }) => {
    const owner = await newStaff('KNOWLEDGE_OWNER', 'Olga Accessibile');
    const context = await browser.newContext({ locale: 'it-IT', colorScheme: scheme });
    try {
      await cookieLogin(context, owner);
      const page = await context.newPage();

      await page.goto('/admin.html#documents');
      await page.getByRole('searchbox').fill('MAN-500');
      await page
        .getByRole('row', { name: /MAN-500.*Revisione A/ })
        .getByRole('button')
        .first()
        .click();
      const detail = page.getByRole('dialog', { name: 'MAN-500 · A' });
      await expect(detail.locator('.kb-chunk').first()).toBeVisible();
      await detail.getByRole('button', { name: /Confronta con questa/ }).click();
      const compare = page.getByRole('dialog', { name: /Confronto tra revisioni/ });
      await expect(compare.locator('.kb-diff-add').first()).toBeVisible();
      await expectNoViolations(page, 'знание: сравнение на ревизии');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');

      await page.goto('/admin.html#devices');
      await page
        .getByRole('row', { name: /SN-ALFA-1/ })
        .getByRole('button', { name: /Documenti/ })
        .click();
      await expect(page.getByRole('dialog', { name: 'Quadro SN-ALFA-1' })).toBeVisible();
      await expectNoViolations(page, 'знание: документи на табло');
      await page.keyboard.press('Escape');

      await page.goto('/admin.html#codes');
      await page.getByRole('searchbox').fill('E37');
      await page.getByRole('row', { name: /E37/ }).first().getByRole('button').first().click();
      await expect(page.getByRole('heading', { name: 'Cronologia' })).toBeVisible();
      await expectNoViolations(page, 'знание: код за грешка с история');
    } finally {
      await context.close();
    }
  });
}
