import { AxeBuilder } from '@axe-core/playwright';
import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import type { User } from '@prisma/client';
import { cookieLogin, formLogin, newPortalUser, newStaff } from './support/world.js';

/**
 * Достъпност (WCAG 2.1 AA · EAA/EN 301 549): автоматичният слой на axe върху критичните екрани, в
 * светла и тъмна тема. Тестът пада при ВСЯКО нарушение със списък „правило · влияние · селектор“.
 * Автоматиката хваща само част от проблемите — клавиатурата, екранният четец и зумът са ръчни
 * (.claude/skills/wcag-audit). Правила не се изключват; изключение само при доказан фалшив сигнал.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
  );
  expect(report, `a11y нарушения на „${screen}“:\n${report.join('\n')}`).toEqual([]);
}

async function open(
  browser: Browser,
  scheme: 'light' | 'dark',
  user: User | null,
  mobile = false,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    ...(mobile ? devices['Pixel 5'] : {}),
    locale: 'it-IT',
    colorScheme: scheme,
  });
  if (user) await cookieLogin(context, user);
  return { context, page: await context.newPage() };
}

/** Нов случай (през формуляра) + въпрос → отговор с цитат. */
async function caseWithAnswer(page: Page) {
  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Revisione HW').fill('B');
  await dialog.getByLabel('Firmware').fill('4.2');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();
  await page.getByLabel('Descriva cosa vede sul quadro').fill('Il display mostra E37');
  await page.getByRole('button', { name: 'Invia' }).click();
  const answer = page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
  await expect(answer.getByRole('heading', { name: 'Esito: Causa identificata' })).toBeVisible();
  await expect(answer.getByRole('blockquote')).toBeVisible();
  return answer;
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`a11y · тема ${scheme}`, () => {
    test('екран за вход', async ({ browser }) => {
      const { context, page } = await open(browser, scheme, null);
      try {
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
        await expectNoViolations(page, 'вход');
      } finally {
        await context.close();
      }
    });

    test('работно пространство: случай, отговор с цитат, „Fonte“, нов случай', async ({
      browser,
    }) => {
      const { context, page } = await open(browser, scheme, await newPortalUser('Paolo A11y'));
      try {
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Nessun caso aperto' })).toBeVisible();
        await expectNoViolations(page, 'работно пространство (празно)');

        // Формулярът за нов случай.
        await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Nuovo caso' })).toBeVisible();
        await expectNoViolations(page, 'формуляр „Nuovo caso“');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: 'Nuovo caso' })).toBeHidden();

        const answer = await caseWithAnswer(page);
        await expectNoViolations(page, 'случай с AI отговор');

        await answer.getByRole('button', { name: /Apri pagina/ }).click();
        const source = page.getByRole('dialog', { name: 'Fonte' });
        await expect(source).toContainText('ERR-LIST-500');
        await expectNoViolations(page, 'диалог „Fonte“');
        await source.getByRole('button', { name: 'Chiudi' }).click();
        await expect(source).toBeHidden();

        // Обратна връзка и тикет.
        await answer.getByRole('button', { name: 'Utile', exact: true }).click();
        await expect(answer.getByRole('status').last()).not.toBeEmpty();
        await page.getByRole('button', { name: 'Apri ticket' }).first().click();
        await expect(page.getByRole('dialog', { name: 'Apri ticket' })).toBeVisible();
        await expectNoViolations(page, 'диалог „Apri ticket“');
      } finally {
        await context.close();
      }
    });

    test('мобилен изглед (Pixel 5): случай с отговор', async ({ browser }) => {
      const user = await newPortalUser('Paolo Mobile');
      const { context, page } = await open(browser, scheme, user, true);
      try {
        await page.goto('/');
        await expect(page.getByRole('button', { name: 'Cambia conversazione' })).toBeVisible();
        await expectNoViolations(page, 'мобилен списък');
        await caseWithAnswer(page);
        await expectNoViolations(page, 'мобилен случай с отговор');
      } finally {
        await context.close();
      }
    });

    test('персонал: нов разговор и директно съобщение; админ диалози', async ({ browser }) => {
      const tag = `${scheme}${Date.now().toString(36)}`;
      const sara = await newStaff('SUPPORT', `Sara ${tag}`);
      await newStaff('ENGINEERING', `Enzo ${tag}`);
      const admin = await newStaff('TENANT_ADMIN', 'Ada Dialoghi');
      const a = await open(browser, scheme, sara);
      try {
        await a.page.goto('/');
        await a.page.getByRole('button', { name: 'Nuovo messaggio' }).click();
        const dialog = a.page.getByRole('dialog', { name: 'Nuova conversazione' });
        await dialog.getByLabel('Persone').fill(`Enzo ${tag}`);
        await expect(dialog.getByRole('button', { name: new RegExp(`Enzo ${tag}`) })).toBeVisible();
        await expectNoViolations(a.page, 'диалог „Nuova conversazione“');
        await dialog.getByRole('button', { name: new RegExp(`Enzo ${tag}`) }).click();
        await dialog.getByRole('button', { name: 'Crea', exact: true }).click();
        const box = a.page.getByLabel('Messaggio', { exact: true });
        await box.fill('Controllo accessibilità');
        await box.press('Control+Enter');
        await expect(
          a.page.getByRole('log').filter({ hasText: 'Controllo accessibilità' }),
        ).toBeVisible();
        await expectNoViolations(a.page, 'разговор със съобщение');
      } finally {
        await a.context.close();
      }
      const b = await open(browser, scheme, admin);
      try {
        await b.page.goto('/admin.html#users');
        await b.page.getByRole('button', { name: 'Nuovo utente' }).click();
        await expect(b.page.getByRole('dialog', { name: 'Nuovo utente' })).toBeVisible();
        await expectNoViolations(b.page, 'админ: диалог „Nuovo utente“');
      } finally {
        await b.context.close();
      }
    });

    test('административна конзола: директория, документи, KPI', async ({ browser }) => {
      const admin = await newStaff('TENANT_ADMIN', 'Ada Admin');
      const owner = await newStaff('KNOWLEDGE_OWNER', 'Olga Autrice');
      for (const [user, hash] of [
        [admin, 'users'],
        [owner, 'documents'],
        [admin, 'kpi'],
      ] as const) {
        const { context, page } = await open(browser, scheme, user);
        try {
          await page.goto(`/admin.html#${hash}`);
          await expect(page.locator('#sec-title')).toBeVisible();
          await expect(page.locator('#view [aria-busy="true"]')).toHaveCount(0);
          await expectNoViolations(page, `админ: ${hash}`);
          if (hash === 'documents') {
            await page.getByRole('button', { name: 'Carica documento' }).click();
            await expect(page.getByRole('dialog', { name: 'Carica documento' })).toBeVisible();
            await expectNoViolations(page, 'админ: диалог „Carica documento“');
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog')).toHaveCount(0);
            await page.getByRole('row').nth(1).getByRole('button').first().click();
            await expect(page.getByRole('dialog')).toBeVisible();
            await expectNoViolations(page, 'админ: детайл на документ');
          }
        } finally {
          await context.close();
        }
      }
    });
  });
}

/** Клавиатурата (WCAG 2.1.1/2.4.1/2.4.3/2.4.7): минимумът, който axe не вижда. */
test.describe('a11y · клавиатура', () => {
  const focused = (page: Page) =>
    page.evaluate<string>(
      "(() => { const e = document.activeElement; return e && e !== document.body ? e.id || e.tagName : 'BODY'; })()",
    );

  test('след вход през форма фокусът не се губи; „пропускане“ премества фокуса', async ({
    page,
  }) => {
    const user = await newPortalUser('Paolo Tastiera');
    await formLogin(page, user.email);
    await expect(page.getByRole('button', { name: 'Nuovo caso' }).first()).toBeVisible();
    await expect.poll(() => focused(page)).toBe('chat-pane');

    const skip = page.getByRole('link', { name: 'Vai alla conversazione' });
    await skip.focus();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect.poll(() => focused(page)).toBe('chat-pane');
  });

  test('диалог: Tab остава вътре, Esc го затваря и връща фокуса към бутона', async ({
    page,
    context,
  }) => {
    await cookieLogin(context, await newPortalUser('Paolo Dialogo'));
    await page.goto('/');
    const opener = page.getByRole('button', { name: 'Nuovo caso' }).first();
    await opener.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      // Фокусът е в диалога или (кратко) в браузъра; никога върху страницата зад него.
      const behind = await page.evaluate<boolean>(
        '(() => { const e = document.activeElement; return !!e && e !== document.body && !e.closest("dialog"); })()',
      );
      expect(behind).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
  });
});
