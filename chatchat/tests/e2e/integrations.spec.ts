import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { E2E_HELPDESK } from './support/constants.js';
import { apiAs, cookieLogin, newStaff, tenantAlfa } from './support/world.js';

/**
 * Интеграцията с helpdesk (FR-09, §14.4) в административната конзола: администраторът настройва
 * подписан webhook (генерирана тайна), тества връзката, вижда доставката в дневника и пуска отново
 * доставка от dead-letter. Тайните не се показват след запис. axe WCAG 2.1 AA върху раздела.
 */

async function newTicket(): Promise<string> {
  const tech = await apiAs(await newStaff('INTERNAL_TECHNICIAN', 'Tecnico Integrazione'));
  const created = await tech.post('/api/v1/sessions', {
    context: {
      productModel: 'LTX-500',
      hardwareRevision: 'B',
      firmware: '4.2',
      serial: null,
      errorCode: 'E37',
    },
  });
  expect(created.status).toBe(201);
  const ticket = await tech.post('/api/v1/tickets', {
    caseId: created.body.case.id,
    reason: 'Serve un operatore per il contatto porta',
  });
  expect(ticket.status).toBe(201);
  return ticket.body.ticket.number as string;
}

/** Редът на тикета в дневника (опреснява, докато се появи статусът). */
async function expectRow(page: Page, number: string, status: string) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Aggiorna' }).click();
    await expect(
      page.getByRole('row').filter({ hasText: number }).filter({ hasText: status }),
    ).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
}

test.afterAll(async () => {
  // Другите спецификации не трябва да пращат към фалшивия helpdesk.
  const t = await tenantAlfa();
  await db.helpdeskIntegration.updateMany({ where: { tenantId: t.id }, data: { enabled: false } });
});

test('администратор: webhook → тест на връзката → доставка в дневника → повторно пускане от dead-letter', async ({
  page,
  context,
}) => {
  const admin = await newStaff('TENANT_ADMIN', 'Ada Integrazioni');
  await cookieLogin(context, admin);
  await page.goto('/admin.html#integrations');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Integrazione con il helpdesk' }),
  ).toBeVisible();

  await page.getByLabel('Tipo di helpdesk').selectOption('WEBHOOK');
  await page.getByLabel('Indirizzo del webhook').fill(`${E2E_HELPDESK}/hook`);
  const signing = page.getByLabel('Segreto di firma (invio)');
  await page.getByRole('button', { name: 'Genera' }).first().click();
  await expect(signing).toHaveValue(/^[\w-]{40,}$/);
  await page.getByLabel('Invia i ticket al helpdesk').check();
  await page.getByRole('button', { name: 'Salva la configurazione' }).click();
  await expect(page.locator('#toasts').getByText('Configurazione salvata.')).toBeVisible();

  // Тайната не се връща: полето е празно, с „Impostato“.
  const signingAfter = page.getByLabel('Segreto di firma (invio)');
  await expect(signingAfter).toHaveValue('');
  await expect(signingAfter).toHaveAttribute('placeholder', /Impostato/);
  await expect(page.getByLabel('Indirizzo da configurare nel helpdesk')).toHaveValue(
    /\/api\/v1\/integrations\/inbound\/[\w-]{16,}$/,
  );

  await page.getByRole('button', { name: 'Prova la connessione' }).click();
  await expect(page.getByText('Connessione riuscita', { exact: true })).toBeVisible();

  const first = await newTicket();
  await expectRow(page, first, 'Consegnato');

  // Окончателна грешка → dead-letter → „Riprova“ → доставено.
  await fetch(`${E2E_HELPDESK}/__control`, {
    method: 'POST',
    body: JSON.stringify({ failNext: [{ status: 400 }] }),
  });
  const second = await newTicket();
  await expectRow(page, second, 'Non consegnato');
  const row = page.getByRole('row').filter({ hasText: second });
  await expect(row.getByText('HTTP 400', { exact: false })).toBeVisible();
  await row.getByRole('button', { name: `Riprova la consegna del ticket ${second}` }).click();
  await expect(page.locator('#toasts').getByText('Consegna rimessa in coda.')).toBeVisible();
  await expectRow(page, second, 'Consegnato');

  const audit = await db.auditEvent.findFirst({
    where: { action: 'integration.delivery.replay', actorId: admin.id },
  });
  expect(audit).not.toBeNull();

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
  );
  expect(report, report.join('\n')).toEqual([]);

  // Смяна на вида (без запис): полетата следват вида и начина на удостоверяване; предупреждение.
  await page.getByLabel('Tipo di helpdesk').selectOption('ZENDESK');
  await expect(page.getByText(/Cambiando tipo o destinazione/)).toBeVisible();
  await expect(page.getByLabel('Sottodominio Zendesk')).toBeVisible();
  await expect(page.getByLabel('Token di accesso OAuth')).toBeVisible();
  await page.getByLabel('Autenticazione').selectOption('api_token');
  await expect(page.getByLabel('Token API')).toBeVisible();
  await expect(page.getByLabel('Token di accesso OAuth')).toHaveCount(0);
  await page.getByLabel('Tipo di helpdesk').selectOption('JSM');
  await expect(page.getByLabel('ID del service desk')).toBeVisible();
});

test('поддръжката не вижда раздела; API-то отказва', async ({ page, context }) => {
  const support = await newStaff('SUPPORT', 'Sara Integrazioni');
  await cookieLogin(context, support);
  await page.goto('/admin.html');
  await expect(page.getByRole('link', { name: 'Integrazione helpdesk' })).toHaveCount(0);
  const api = await apiAs(support);
  expect((await api.get('/api/v1/admin/integrations')).status).toBe(403);
});
