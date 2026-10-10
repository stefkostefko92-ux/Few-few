import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { ask, newCase } from '../integration/world.js';
import { apiAs, cookieLogin, formLogin, newPortalUser, newStaff } from './support/world.js';

/**
 * Поток WF: обратната връзка към знанието и UX на техника —
 *  (1) коментар към „Non utile“ → предложение в опашката на отговорника за знанието (FR-10);
 *  (2) решен случай → ЧЕРНОВА SOLVED_CASE от персонала (§11.3);
 *  (3) интерактивни липсващи данни → „попитай отново“ с обновения контекст (FR-07);
 *  (4) търсене на документ → визуализатор (FR-03); (5) бърз преглед на код (§12.1).
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
  );
  expect(report, `a11y нарушения на „${screen}“:\n${report.join('\n')}`).toEqual([]);
}

const lastAnswer = (page: Page) =>
  page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();

test('коментар към „Non utile“ → предложение в опашката на отговорника за знанието', async ({
  page,
  browser,
}) => {
  const comment = `Manca il passo sul morsetto X3 ${Date.now().toString(36)}`;
  const tech = await newPortalUser('Paolo Commento');
  const techApi = await apiAs(tech);
  const caseId = await newCase(techApi);
  await ask(techApi, caseId, 'Il display mostra E37');

  await cookieLogin(page.context(), tech);
  await page.goto('/');
  const answer = lastAnswer(page);
  await expect(answer.getByRole('heading', { name: 'Esito: Causa identificata' })).toBeVisible();
  await answer.getByRole('button', { name: 'Non utile', exact: true }).click();
  await answer.getByLabel('Cosa non va? (facoltativo)').fill(comment);
  await answer.getByRole('button', { name: 'Invii il commento' }).click();
  await expect(answer.getByText(/il commento è stato inviato/).first()).toBeVisible();

  // Отговорникът за знанието вижда предложението в административната конзола.
  const ko = await newStaff('KNOWLEDGE_OWNER', 'Kora Conoscenza');
  const context = await browser.newContext({ locale: 'it-IT' });
  await cookieLogin(context, ko);
  const admin = await context.newPage();
  await admin.goto('/admin.html#proposals');
  await expect(admin.getByRole('heading', { name: 'Proposte per la conoscenza' })).toBeVisible();
  const row = admin.getByRole('row', { name: new RegExp(comment) });
  await expect(row).toBeVisible();
  await expectNoViolations(admin, 'опашка с предложения');
  await row.getByRole('button', { name: /Apri/ }).click();
  const detail = admin.getByRole('dialog', { name: 'Feedback' });
  await detail.getByRole('button', { name: 'Prenda in revisione' }).click();
  await admin.getByRole('button', { name: /In revisione \(\d+\)/ }).click();
  await expect(admin.getByRole('row', { name: new RegExp(comment) })).toBeVisible();
  const stored = await db.knowledgeProposal.findFirstOrThrow({ where: { comment } });
  expect([stored.source, stored.status, stored.rating]).toEqual([
    'FEEDBACK',
    'IN_REVIEW',
    'NOT_USEFUL',
  ]);
  await context.close();
});

test('решен случай → ЧЕРНОВА SOLVED_CASE от персонала', async ({ page, browser }) => {
  const tech = await newPortalUser('Paolo Risolto');
  const techApi = await apiAs(tech);
  const caseId = await newCase(techApi);
  await ask(techApi, caseId, 'Il display mostra E37');
  const resolved = await techApi.post(`/api/v1/cases/${caseId}/outcome`, { outcome: 'RESOLVED' });
  expect(resolved.status).toBe(200);
  const { number } = await db.case.findUniqueOrThrow({ where: { id: caseId } });

  const support = await newStaff('SUPPORT', 'Sara Supporto');
  await cookieLogin(page.context(), support);
  await page.goto('/');
  await page
    .getByRole('button', { name: new RegExp(number) })
    .first()
    .click();
  await page.getByRole('button', { name: 'Proponga per la base di conoscenza' }).click();
  const dialog = page.getByRole('dialog', { name: 'Caso risolto → base di conoscenza' });
  await dialog.getByLabel('Titolo').fill('E37: connettore encoder ossidato');
  await dialog.getByLabel('Soluzione', { exact: true }).fill('Sostituito il connettore X3.');
  await dialog.getByRole('button', { name: 'Invii la proposta' }).click();
  await expect(page.getByText(/Proposta inviata: bozza SC-\d{4}-\d{6}/).first()).toBeVisible();

  const proposal = await db.knowledgeProposal.findFirstOrThrow({
    where: { caseId, source: 'SOLVED_CASE' },
    include: { draftDocument: true },
  });
  expect([proposal.draftDocument?.type, proposal.draftDocument?.status]).toEqual([
    'SOLVED_CASE',
    'DRAFT',
  ]);
  // Порталът не вижда бутона (няма proposal:create).
  const portal = await browser.newContext({ locale: 'it-IT' });
  await cookieLogin(portal, tech);
  const techPage = await portal.newPage();
  await techPage.goto('/');
  await expect(techPage.getByRole('heading', { name: /Esito/ }).first()).toBeVisible();
  await expect(
    techPage.getByRole('button', { name: 'Proponga per la base di conoscenza' }),
  ).toBeHidden();
  await portal.close();
});

test('липсващи данни като полета → „попитай отново“ с обновения контекст', async ({ page }) => {
  const tech = await newPortalUser('Paolo Mancante');
  await formLogin(page, tech.email);
  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();
  await page.getByLabel('Descriva cosa vede sul quadro').fill('Il display mostra E37');
  await page.getByRole('button', { name: 'Invia' }).click();

  const first = lastAnswer(page);
  await expect(first.getByRole('heading', { name: 'Esito: Non determinabile' })).toBeVisible();
  const missing = first.getByRole('region', { name: 'Dati mancanti' });
  // Редът по диагностична стойност: сериен номер/QR → фърмуер → HW ревизия → снимка → лог → проверки.
  const labels = await missing.locator('.missing-item > label, .missing-label').allTextContents();
  expect(labels.slice(0, 3)).toEqual([
    'Numero di serie del quadro (o QR)',
    'Versione del firmware',
    'Revisione hardware',
  ]);
  await expectNoViolations(page, 'интерактивни липсващи данни');
  const again = missing.getByRole('button', { name: 'Aggiorni e chieda di nuovo' });
  await expect(again).toBeDisabled();
  await missing.getByLabel('Versione del firmware').fill('4.2');
  await missing.getByLabel('Revisione hardware').fill('B');
  await again.click();

  await expect(
    lastAnswer(page).getByRole('heading', { name: 'Esito: Causa identificata' }),
  ).toBeVisible();
  await expect(page.locator('#ctx-fw')).toHaveValue('4.2');
  const stored = await db.case.findFirstOrThrow({ where: { createdById: tech.id } });
  expect(stored.context).toMatchObject({ firmware: '4.2', hardwareRevision: 'B' });
  expect(await db.caseMessage.count({ where: { caseId: stored.id, kind: 'HUMAN' } })).toBe(2);
});

test('търсене на документ → визуализатор; бърз преглед на код → източник', async ({ page }) => {
  const tech = await newPortalUser('Paolo Cerca');
  await cookieLogin(page.context(), tech);
  await page.goto('/');

  await page.getByRole('button', { name: 'Cerca documenti' }).click();
  const search = page.getByRole('dialog', { name: 'Documenti e codici errore' });
  await search.getByLabel('Modello').fill('LTX-500');
  await search.getByLabel('Firmware').fill('4.2');
  await search.getByLabel('Cerchi nel testo, nel codice o nel titolo').fill('encoder');
  await search.getByRole('button', { name: 'Cerca', exact: true }).click();
  const hit = search.getByRole('listitem').filter({ hasText: 'MAN-500 · rev. A' });
  await expect(hit).toContainText('Applicabile a questo quadro');
  await expect(search.getByText('INT-BULL-001')).toHaveCount(0);
  await expectNoViolations(page, 'търсене на документи');
  await hit.getByRole('button', { name: /Apra pag\. 4/ }).click();
  const viewer = page.getByRole('dialog', { name: 'Fonte' });
  await expect(viewer).toContainText('MAN-500');
  await expect(viewer).toContainText('cavo encoder');
  await viewer.getByRole('button', { name: 'Chiudi' }).click();
  await search.getByRole('button', { name: 'Chiudi' }).click();

  // Бърз преглед на код от началния екран.
  await page.getByRole('button', { name: 'Codice errore', exact: true }).click();
  await expect(search.getByRole('tab', { name: 'Codice errore' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await search.getByLabel('Modello').fill('LTX-500');
  await search.getByLabel('Firmware').fill('4.2');
  await search.getByRole('textbox', { name: 'Codice errore' }).fill('E37');
  await search.getByRole('button', { name: 'Mostri il codice' }).click();
  const code = search.getByRole('article').filter({ hasText: 'Guasto encoder' });
  await expect(code).toContainText('Applicabile a questo quadro');
  await code.getByRole('button', { name: 'Apra la fonte ERR-LIST-500' }).click();
  await expect(page.getByRole('dialog', { name: 'Fonte' })).toContainText('ERR-LIST-500');
});
