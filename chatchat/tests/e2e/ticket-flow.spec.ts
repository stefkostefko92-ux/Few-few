import { AxeBuilder } from '@axe-core/playwright';
import { devices, expect, test, type Page } from '@playwright/test';
import { db } from '../integration/helpers.js';
import { cookieLogin, newPortalUser, newStaff } from './support/world.js';

/** WCAG 2.1 AA (axe) върху новите екрани на потока — нарушение = червен тест. */
async function expectNoViolations(page: Page, screen: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const report = violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
  );
  expect(report, `a11y нарушения на „${screen}“:\n${report.join('\n')}`).toEqual([]);
}

/**
 * Поток (д): работният поток на тикета (FR-09, FR-19, §11.2) в два браузъра — техник и поддръжка.
 * Техникът отбелязва стъпка → иска разрешение за стъпката по безопасност → поддръжката разрешава
 * с причина → техникът я изпълнява → „Passa a un operatore“ → опашка → поемане → „Chiedi altri
 * dati“ → техникът отговаря в чата → затваряне с резолюция. Реалното време носи промените.
 */

const QUESTION = 'Come verifico il contatto porta di piano con il multimetro?';

async function newCaseWithSteps(page: Page) {
  await page.getByRole('button', { name: 'Nuovo caso' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nuovo caso' });
  await dialog.getByLabel('Modello').fill('LTX-500');
  await dialog.getByLabel('Revisione HW').fill('B');
  await dialog.getByLabel('Firmware').fill('4.2');
  await dialog.getByLabel('Codice errore').fill('E37');
  await dialog.getByRole('button', { name: 'Crea caso' }).click();
  await page.getByLabel('Descriva cosa vede sul quadro').fill(QUESTION);
  await page.getByRole('button', { name: 'Invia' }).click();
  const answer = page.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
  await expect(answer.getByRole('group', { name: 'Esito del passo 2' })).toBeVisible();
  return answer;
}

test('техник → разрешение от поддръжката → предаване → опашка → данни → затваряне', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const tech = await newPortalUser('Paolo Flusso');
  const staff = await newStaff('SUPPORT', 'Sara Flusso');
  const techCtx = await browser.newContext({ locale: 'it-IT' });
  const staffCtx = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(techCtx, tech);
    await cookieLogin(staffCtx, staff);
    const t = await techCtx.newPage();
    const s = await staffCtx.newPage();
    await t.goto('/');
    await s.goto('/');
    await expect(t.getByText('Tempo reale attivo')).toBeVisible();
    await expect(s.getByText('Tempo reale attivo')).toBeVisible();

    // 1. Техникът: стъпка 1 (диагностична) — „OK“; стъпка 2 (безопасност) — заключена.
    const answer = await newCaseWithSteps(t);
    const step1 = answer.getByRole('group', { name: 'Esito del passo 1' });
    await step1.getByRole('button', { name: 'Eseguito: OK' }).click();
    await expect(answer.getByText(/Ultimo esito: Eseguito: OK/)).toBeVisible();
    const step2 = answer.getByRole('group', { name: 'Esito del passo 2' });
    await expect(step2.getByRole('button', { name: 'Eseguito: OK' })).toBeDisabled();

    // 2. Иска разрешение от поддръжката.
    await answer.getByRole('button', { name: /autorizzazione \(Supporto\)/ }).click();
    await expect(answer.getByText(/In attesa di autorizzazione \(Supporto\)/)).toBeVisible();

    // 3. Поддръжката: опашка → „Autorizzazioni in attesa“ → случаят → „Autorizza“ с причина.
    await s.getByRole('button', { name: 'Coda ticket' }).click();
    await expect(s.getByRole('heading', { name: 'Autorizzazioni in attesa (1)' })).toBeVisible();
    await s.getByRole('button', { name: /· Passo 2/ }).click();
    const staffAnswer = s.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
    await staffAnswer
      .getByLabel('Motivazione (obbligatoria)')
      .fill('Procedura PROC-DOOR-001 verificata');
    await staffAnswer.getByRole('button', { name: 'Autorizza' }).click();
    await expect(staffAnswer.getByText(/Autorizzato da Lei/)).toBeVisible();

    // 4. Техникът вижда разрешението в реално време (ролята, не името) и изпълнява стъпката.
    await expect(answer.getByText(/Autorizzato da Supporto/)).toBeVisible();
    await expect(answer.getByText('Sara Flusso')).toHaveCount(0);
    await step2.getByRole('button', { name: 'Eseguito: OK' }).click();
    await expect(step2.getByRole('button', { name: 'Eseguito: OK' })).toBeEnabled();
    await expect.poll(() => db.caseStepExecution.count({ where: { authorId: tech.id } })).toBe(2);

    // 5. „Passa a un operatore“: тикет, AI на пауза.
    await t.getByRole('button', { name: 'Passa a un operatore' }).click();
    const handoff = t.getByRole('dialog', { name: 'Passa a un operatore' });
    await handoff
      .getByLabel('Messaggio per l’operatore')
      .fill('Il contatto resta aperto dopo la verifica.');
    await handoff.getByRole('button', { name: 'Passa all’operatore' }).click();
    await expect(t.getByText(/l’assistente AI è in pausa/)).toBeVisible();
    const stored = await db.case.findFirstOrThrow({
      where: { createdById: tech.id },
      include: { ticket: true },
    });
    const number = stored.ticket?.number ?? '';
    expect(number).toMatch(/^TS-\d{4}-\d{6}$/);

    // 6. Поддръжката: опашката → „Prendi in carico“ → случаят.
    await s.getByRole('button', { name: 'Coda ticket' }).click();
    await s.getByRole('button', { name: `Prendi in carico il ticket ${number}` }).click();
    await expect
      .poll(async () => (await db.ticket.findUniqueOrThrow({ where: { number } })).ownerId)
      .toBe(staff.id);
    await s.getByRole('button', { name: 'I miei', exact: true }).click();
    await s.getByRole('button', { name: new RegExp(`^${number}`) }).click();
    await expect(s.locator('#ticket-panel')).toContainText('Lei');

    // 7. „Chiedi altri dati“ → техникът вижда списъка и отговаря в чата.
    await s.getByRole('button', { name: 'Chiedi altri dati' }).click();
    const ask = s.getByRole('dialog', { name: 'Chiedi altri dati al tecnico' });
    await ask.getByLabel('Cosa serve (uno per riga)').fill('Foto della targhetta\nRegistro eventi');
    await ask.getByRole('button', { name: 'Invia la richiesta' }).click();
    await expect(t.locator('#ticket-panel')).toContainText('Foto della targhetta');
    await expect(t.locator('#ticket-panel')).toContainText('Dati richiesti da Supporto');
    await t.getByLabel('Descriva cosa vede sul quadro').fill('Ecco la targhetta: LTX-500 rev. B');
    await t.getByRole('button', { name: 'Invia' }).click();
    await expect(t.getByRole('log').filter({ hasText: 'Ecco la targhetta' })).toBeVisible();
    await expect
      .poll(async () => (await db.ticket.findUniqueOrThrow({ where: { number } })).status)
      .toBe('IN_PROGRESS');

    // 8. Затваряне с резолюция и свързан източник; техникът я вижда.
    await expect(s.locator('#ticket-panel')).not.toContainText('Foto della targhetta');
    await s.getByRole('button', { name: 'Chiudi con risoluzione' }).click();
    const close = s.getByRole('dialog', { name: 'Chiudi il ticket' });
    await close.getByLabel('Causa individuata').fill('Contatto porta ossidato');
    await close.getByLabel('Soluzione applicata').fill('Contatto sostituito e verificato');
    await close.getByLabel(/PROC-DOOR-001/).check();
    await close.getByRole('button', { name: 'Chiudi il ticket' }).click();
    await expect(s.locator('#actions-feedback')).toHaveText('Ticket chiuso e caso risolto.');
    await expect(t.locator('#ticket-panel')).toContainText('Contatto porta ossidato');

    // Сървърът: тикетът затворен с резолюция, разрешението — от поддръжката, хронологията — цяла.
    const ticket = await db.ticket.findUniqueOrThrow({ where: { number } });
    expect(ticket.status).toBe('CLOSED');
    const approval = await db.stepApproval.findFirstOrThrow({ where: { caseId: stored.id } });
    expect([approval.status, approval.decidedById, approval.decidedRole]).toEqual([
      'GRANTED',
      staff.id,
      'SUPPORT',
    ]);
    const events = (
      await db.ticketEvent.findMany({ where: { ticketId: ticket.id }, orderBy: { at: 'asc' } })
    ).map((e) => e.type);
    expect(events).toEqual([
      'ticket.created',
      'handoff.to_operator',
      'ticket.claimed',
      'ticket.info_requested',
      'ticket.info_provided',
      'ticket.closed',
    ]);
  } finally {
    await techCtx.close();
    await staffCtx.close();
  }
});

for (const scheme of ['light', 'dark'] as const) {
  test(`a11y на потока (${scheme}): стъпки, разрешение, предаване, опашка, политика`, async ({
    browser,
  }) => {
    test.setTimeout(120_000);
    const tech = await newPortalUser(`Paolo A11y ${scheme}`);
    const staff = await newStaff('SUPPORT', `Sara A11y ${scheme}`);
    const admin = await newStaff('TENANT_ADMIN', `Ada Politica ${scheme}`);
    const ctx = await Promise.all(
      [1, 2, 3].map(() => browser.newContext({ locale: 'it-IT', colorScheme: scheme })),
    );
    const [techCtx, staffCtx, adminCtx] = ctx as [
      (typeof ctx)[0],
      (typeof ctx)[0],
      (typeof ctx)[0],
    ];
    try {
      await cookieLogin(techCtx, tech);
      await cookieLogin(staffCtx, staff);
      await cookieLogin(adminCtx, admin);
      const t = await techCtx.newPage();
      await t.goto('/');
      const answer = await newCaseWithSteps(t);
      await expectNoViolations(t, 'отговор със стъпки');
      await answer.getByRole('button', { name: /autorizzazione \(Supporto\)/ }).click();
      await expect(answer.getByText(/In attesa di autorizzazione/)).toBeVisible();
      await answer.getByText('Aggiungi una nota').first().click();
      await expectNoViolations(t, 'чакащо разрешение + бележка');
      await t.getByRole('button', { name: 'Passa a un operatore' }).click();
      await expect(t.getByRole('dialog', { name: 'Passa a un operatore' })).toBeVisible();
      await expectNoViolations(t, 'диалог „Passa a un operatore“');
      await t.keyboard.press('Escape');

      const s = await staffCtx.newPage();
      await s.goto('/');
      await s.getByRole('button', { name: 'Coda ticket' }).click();
      await expect(s.getByRole('heading', { name: /Autorizzazioni in attesa/ })).toBeVisible();
      await expectNoViolations(s, 'опашка');
      await s
        .getByRole('button', { name: /· Passo 2/ })
        .first()
        .click();
      await expect(s.getByRole('button', { name: 'Autorizza' })).toBeVisible();
      await expectNoViolations(s, 'решение по разрешение');

      const a = await adminCtx.newPage();
      await a.goto('/admin.html#steppolicy');
      await expect(a.getByRole('button', { name: 'Salva la politica' })).toBeVisible();
      await expectNoViolations(a, 'админ: политика за разрешенията');
    } finally {
      for (const c of ctx) await c.close();
    }
  });
}

test('мобилен (Pixel 5): стъпките се отбелязват с големи бутони, без хоризонтално превъртане', async ({
  browser,
}) => {
  const tech = await newPortalUser('Paolo Mobile Passi');
  const ctx = await browser.newContext({ ...devices['Pixel 5'], locale: 'it-IT' });
  try {
    await cookieLogin(ctx, tech);
    const page = await ctx.newPage();
    await page.goto('/');
    const answer = await newCaseWithSteps(page);
    const ok = answer.getByRole('group', { name: 'Esito del passo 1' }).getByRole('button', {
      name: 'Eseguito: OK',
    });
    const box = await ok.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await ok.click();
    await expect(answer.getByText(/Ultimo esito: Eseguito: OK/)).toBeVisible();
    await answer.getByRole('button', { name: /autorizzazione \(Supporto\)/ }).click();
    await expect(answer.getByText(/In attesa di autorizzazione/)).toBeVisible();
    await expectNoViolations(page, 'мобилен: стъпки и разрешение');
    const overflow = await page.evaluate<number>(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    );
    expect(overflow).toBeLessThanOrEqual(1);
  } finally {
    await ctx.close();
  }
});
