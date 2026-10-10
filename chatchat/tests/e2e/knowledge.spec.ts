import { expect, test } from '@playwright/test';
import { makePdf } from '../file-fixtures.js';
import { db } from '../integration/helpers.js';
import { ask, newCase } from '../integration/world.js';
import { apiAs, cookieLogin, newPortalUser, newStaff } from './support/world.js';

/**
 * Поток (е): знание — документ (PDF) → „Invia in esame“ → публикуване от ДРУГ човек (четири очи,
 * документът е по безопасност) → техникът го намира и го вижда като източник. Преди публикуване
 * техникът не го вижда.
 */
test('знание: документ → преглед → публикуване от друг → техникът го намира', async ({
  page,
  browser,
}) => {
  const code = `PROC-E2E-${Date.now().toString(36).toUpperCase()}`;
  const marker = 'ZEFIRO7';
  const sentence = `Procedura ${marker}: scollegare l'alimentazione prima di toccare la morsettiera X9.`;
  const pdf = makePdf([[sentence]]);

  const author = await newStaff('KNOWLEDGE_OWNER', 'Olga Autrice');
  const approver = await newStaff('KNOWLEDGE_OWNER', 'Omar Approvatore');
  const technician = await newPortalUser('Paolo Ricerca');
  const techApi = await apiAs(technician);
  const caseId = await newCase(techApi, { context: { errorCode: null } });

  // Преди публикуване: техникът не намира нищо за уникалната дума.
  const before = await ask(techApi, caseId, `Come eseguo la procedura ${marker}?`);
  expect(JSON.stringify(before.body)).not.toContain(code);

  // 1) Авторът качва документа като чернова.
  await cookieLogin(page.context(), author);
  await page.goto('/admin.html#documents');
  await page.getByRole('button', { name: 'Carica documento' }).click();
  const upload = page.getByRole('dialog', { name: 'Carica documento' });
  await upload.getByLabel('File', { exact: true }).setInputFiles({
    name: `${code}.pdf`,
    mimeType: 'application/pdf',
    buffer: pdf,
  });
  await upload.getByLabel('Codice documento', { exact: true }).fill(code);
  await upload.getByLabel('Revisione', { exact: true }).fill('A');
  await upload.getByLabel('Titolo', { exact: true }).fill('Procedura di prova E2E (FITTIZIA)');
  await upload.getByLabel('Lingua (2 lettere)').fill('it');
  await upload.getByRole('checkbox', { name: 'Rilevante per la sicurezza' }).check();
  await upload.getByRole('button', { name: 'Aggiungi modello' }).click();
  await upload.getByRole('combobox', { name: 'Modello' }).last().selectOption('LTX-500');
  await upload.getByRole('button', { name: 'Carica come bozza' }).click();
  await expect(page.getByText(/Documento salvato come bozza/).first()).toBeVisible();

  // 2) Авторът го праща за преглед; сам не може да го публикува (четири очи).
  await page.getByRole('searchbox').fill(code);
  await page
    .getByRole('row', { name: new RegExp(code) })
    .getByRole('button')
    .first()
    .click();
  const detail = page.getByRole('dialog').last();
  await detail.getByRole('button', { name: 'Invia in esame' }).click();
  await expect
    .poll(() => db.document.findFirst({ where: { code } }).then((d) => d?.status))
    .toBe('REVIEW');
  const stored = await db.document.findFirstOrThrow({ where: { code } });
  const own = await (await apiAs(author)).post(`/api/v1/admin/documents/${stored.id}/publish`);
  expect(own.status).toBe(409);
  expect(own.body.code).toBe('four_eyes_required');

  // 3) Другият човек го публикува през интерфейса.
  const ctx2 = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx2, approver);
    const p2 = await ctx2.newPage();
    await p2.goto('/admin.html#documents');
    await p2.getByRole('searchbox').fill(code);
    await p2
      .getByRole('row', { name: new RegExp(code) })
      .getByRole('button')
      .first()
      .click();
    await p2.getByRole('dialog').last().getByRole('button', { name: 'Pubblica' }).click();
    await p2.getByRole('dialog').last().getByRole('button', { name: 'Pubblica' }).click();
    await expect
      .poll(() => db.document.findFirst({ where: { code } }).then((d) => d?.status))
      .toBe('PUBLISHED');
  } finally {
    await ctx2.close();
  }

  // 4) Техникът в браузъра го намира и го вижда като източник.
  const ctx3 = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx3, technician);
    const tp = await ctx3.newPage();
    await tp.goto('/');
    await tp.getByRole('button', { name: /CASE-/ }).first().click();
    await tp
      .getByLabel('Descriva cosa vede sul quadro')
      .fill(`Come eseguo la procedura ${marker}?`);
    await tp.getByRole('button', { name: 'Invia' }).click();
    const answer = tp.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
    await expect(answer.getByRole('blockquote').filter({ hasText: marker })).toBeVisible();
    await expect(answer.getByText(code).first()).toBeVisible();
  } finally {
    await ctx3.close();
  }
});
