import { expect, test } from '@playwright/test';
import { makePdf } from '../file-fixtures.js';
import { db } from '../integration/helpers.js';
import { ask, newCase } from '../integration/world.js';
import { apiAs, cookieLogin, newPortalUser, newStaff } from './support/world.js';

/**
 * Поток (ж): уникалната схема на ТАБЛО (решение на собственика). Отговорникът качва схема само за
 * таблото SN-ALFA-1 → преглежда страницата (парчета + компоненти) преди публикуване → друг
 * отговорник я публикува (четири очи — схемата е по безопасност) → техник със случай на SN-ALFA-1
 * я вижда като източник; техник на SN-ALFA-2 (същият модел, друго табло) — не.
 */
test('схема за табло A: качване → преглед → друг публикува → табло A я вижда, табло B — не', async ({
  page,
  browser,
}) => {
  const code = `SCH-E2E-${Date.now().toString(36).toUpperCase()}`;
  const marker = 'GIUNCO4';
  const sentence = `Schema ${marker}: il relè K9 alimenta la bobina del contattore tramite il morsetto X21.`;
  const pdf = makePdf([[sentence]]);

  const author = await newStaff('KNOWLEDGE_OWNER', 'Olga Schemi');
  const approver = await newStaff('KNOWLEDGE_OWNER', 'Omar Verifica');
  const techA = await newPortalUser('Paolo Quadro A');
  const techB = await newPortalUser('Pia Quadro B');

  // 1) Качване през интерфейса: правилото е САМО за таблото SN-ALFA-1, фърмуерът — „всички версии“.
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
  await upload.getByLabel('Titolo', { exact: true }).fill('Schema del quadro SN-ALFA-1 (FITTIZIO)');
  await upload.getByLabel('Tipo', { exact: true }).selectOption('SCHEMATIC');
  await upload.getByLabel('Lingua (2 lettere)').fill('it');
  await upload.getByRole('checkbox', { name: 'Rilevante per la sicurezza' }).check();
  await upload.getByRole('combobox', { name: 'Modello' }).selectOption('LTX-500');
  await expect(
    upload.getByRole('checkbox', { name: 'Tutte le versioni del firmware' }),
  ).toBeChecked();
  await upload.getByLabel('Solo per il quadro (numero di serie)').fill('SN-ALFA-1');
  await upload.getByRole('button', { name: 'Carica come bozza' }).click();
  await expect(page.getByText(/Documento salvato come bozza/).first()).toBeVisible();
  const stored = await db.document.findFirstOrThrow({
    where: { code },
    include: { applicability: { include: { device: true } } },
  });
  expect(stored.applicability.map((a) => [a.allFirmware, a.device?.serial])).toEqual([
    [true, 'SN-ALFA-1'],
  ]);

  // 2) Преглед преди публикуване: страницата с парчето и компонентите (K9, X21), после „Invia in esame“.
  await page.getByRole('searchbox').fill(code);
  await page
    .getByRole('row', { name: new RegExp(code) })
    .getByRole('button')
    .first()
    .click();
  const detail = page.getByRole('dialog', { name: `${code} · A` });
  await expect(detail.getByText('per un quadro').first()).toBeVisible();
  await expect(detail.getByText(/solo quadro SN-ALFA-1/)).toBeVisible();
  await expect(detail.locator('.kb-chunk').filter({ hasText: marker })).toBeVisible();
  await expect(detail.locator('.kb-chunk .tag', { hasText: 'K9' })).toBeVisible();
  await expect(detail.locator('.kb-chunk .tag', { hasText: 'X21' })).toBeVisible();
  // Публичният визуализатор крие черновата; админският преглед — не.
  const authorApi = await apiAs(author);
  expect((await authorApi.get(`/api/v1/documents/${stored.id}/pages/1`)).status).toBe(404);
  await detail.getByRole('button', { name: 'Invia in esame' }).click();
  await expect
    .poll(() => db.document.findFirst({ where: { code } }).then((d) => d?.status))
    .toBe('REVIEW');
  const own = await authorApi.post(`/api/v1/admin/documents/${stored.id}/publish`);
  expect([own.status, own.body.code]).toEqual([409, 'four_eyes_required']);

  // 3) Другият отговорник публикува през интерфейса.
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

  // 4) Табло B (същият модел, друго табло): схемата на A не стига до него.
  const apiB = await apiAs(techB);
  const caseB = await newCase(apiB, { deviceSerial: 'SN-ALFA-2', context: { errorCode: null } });
  const answerB = await ask(apiB, caseB, `Come è collegato il relè K9 ${marker}?`);
  expect(answerB.status).toBe(201);
  expect(JSON.stringify(answerB.body)).not.toContain(code);
  expect(JSON.stringify(answerB.body)).not.toContain('X21');

  // 5) Табло A: техникът в браузъра я вижда като източник.
  const apiA = await apiAs(techA);
  await newCase(apiA, { deviceSerial: 'SN-ALFA-1', context: { errorCode: null } });
  const ctx3 = await browser.newContext({ locale: 'it-IT' });
  try {
    await cookieLogin(ctx3, techA);
    const tp = await ctx3.newPage();
    await tp.goto('/');
    await tp.getByRole('button', { name: /CASE-/ }).first().click();
    await tp
      .getByLabel('Descriva cosa vede sul quadro')
      .fill(`Come è collegato il relè K9 ${marker}?`);
    await tp.getByRole('button', { name: 'Invia' }).click();
    const answer = tp.getByRole('log', { name: 'Conversazione' }).getByRole('article').last();
    await expect(answer.getByRole('blockquote').filter({ hasText: marker })).toBeVisible();
    await expect(answer.getByText(code).first()).toBeVisible();
  } finally {
    await ctx3.close();
  }
});
