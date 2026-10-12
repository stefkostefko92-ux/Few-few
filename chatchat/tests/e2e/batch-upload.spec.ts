import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { makePdf } from '../file-fixtures.js';
import { buildZip, makeDocx, makeXlsx } from '../ingest-fixtures.js';
import { db } from '../integration/helpers.js';
import { cookieLogin, newStaff } from './support/world.js';

/**
 * Пакетното качване (§4.1): много файлове с общи метаданни → напредък по файл → ЧЕРНОВИ;
 * провален файл (бомба) и отказан (неподдържан формат) не спират останалите; „Riprova“ е само за
 * провалените. Плюс единичното качване на DOCX през опашката. Достъпност (axe, WCAG 2.1 AA) на
 * диалога с резултатите в светла и тъмна тема.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const scheme of ['light', 'dark'] as const) {
  test(`пакетно качване (${scheme}): PDF, сканиран PDF, DOCX, XLSX → черновите; лошите — по файл`, async ({
    browser,
  }) => {
    const owner = await newStaff('KNOWLEDGE_OWNER', 'Olga Pacchetto');
    const tag = `${scheme}-${Date.now().toString(36)}`;
    const context = await browser.newContext({ locale: 'it-IT', colorScheme: scheme });
    try {
      await cookieLogin(context, owner);
      const page = await context.newPage();
      await page.goto('/admin.html#documents');
      await page.getByRole('button', { name: 'Caricamento multiplo' }).click();
      const dlg = page.getByRole('dialog', { name: 'Caricamento multiplo' });
      const bomb = buildZip([
        { name: '[Content_Types].xml', data: '<Types/>' },
        { name: 'word/document.xml', data: Buffer.alloc(2_000_000), declaredSize: 64 },
      ]);
      await dlg.getByLabel('File', { exact: true }).setInputFiles([
        {
          name: `manuale-${tag}.pdf`,
          mimeType: 'application/pdf',
          buffer: makePdf([['Manuale del quadro LTX-500.']]),
        },
        {
          name: `scansione-${tag}.pdf`,
          mimeType: 'application/pdf',
          buffer: makePdf([[], ['Seconda pagina.']]),
        },
        {
          name: `guida-${tag}.docx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          buffer: makeDocx([{ style: 'Titolo1', text: 'Messa in servizio' }, { text: 'Relè K1.' }]),
        },
        {
          name: `tabella-${tag}.xlsx`,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: makeXlsx([
            {
              name: 'Morsetti',
              rows: [
                ['Morsetto', 'Funzione'],
                ['X3', 'Sicurezze'],
              ],
            },
          ]),
        },
        { name: `bomba-${tag}.docx`, mimeType: 'application/octet-stream', buffer: bomb },
        {
          name: `binario-${tag}.bin`,
          mimeType: 'application/octet-stream',
          buffer: Buffer.from([0, 1, 2, 3, 4]),
        },
      ]);
      await expect(dlg.getByRole('row', { name: new RegExp(`manuale-${tag}`) })).toContainText(
        'In attesa di caricamento',
      );
      await dlg.getByLabel('Revisione', { exact: true }).fill('E2E');
      await dlg.getByRole('combobox', { name: 'Modello' }).selectOption('LTX-500');
      await dlg.getByRole('button', { name: 'Carica ed elabora' }).click();

      await expect(dlg.getByRole('status')).toContainText(
        'Pronti: 4 · non riusciti: 2 · in corso: 0',
        { timeout: 30_000 },
      );
      for (const name of ['manuale', 'scansione', 'guida', 'tabella']) {
        await expect(dlg.getByRole('row', { name: new RegExp(`${name}-${tag}`) })).toContainText(
          'Pronto — bozza',
        );
      }
      await expect(dlg.getByRole('row', { name: new RegExp(`scansione-${tag}`) })).toContainText(
        'con OCR: 1',
      );
      const bombRow = dlg.getByRole('row', { name: new RegExp(`bomba-${tag}`) });
      await expect(bombRow).toContainText('Non riuscito');
      await expect(bombRow).toContainText('zip bomb');
      await expect(bombRow.getByRole('button', { name: /Riprova/ })).toBeVisible();
      const binRow = dlg.getByRole('row', { name: new RegExp(`binario-${tag}`) });
      await expect(binRow).toContainText('Rifiutato');
      await expect(binRow.getByRole('button')).toHaveCount(0);

      const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const report = violations.flatMap((v) =>
        v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')} — ${v.help}`),
      );
      expect(report, report.join('\n')).toEqual([]);

      const drafts = await db.document.findMany({
        where: { revision: 'E2E', sourceFilename: { contains: tag } },
        select: { status: true, sourceFilename: true },
      });
      expect(drafts.map((d) => d.status).sort()).toEqual(['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT']);

      // Затворено → черновите са в списъка (кодът по подразбиране е от името на файла).
      await dlg.getByRole('button', { name: 'Annulla' }).click();
      await page.getByRole('searchbox').fill(`guida-${tag}`);
      await expect(page.getByRole('row', { name: new RegExp(`guida-${tag}`) })).toContainText(
        'Bozza',
      );
    } finally {
      await context.close();
    }
  });
}

test('единично качване: DOCX през опашката → черновата и тостът с парчетата', async ({ page }) => {
  const owner = await newStaff('KNOWLEDGE_OWNER', 'Olga Singola');
  const code = `DOCX-E2E-${Date.now().toString(36).toUpperCase()}`;
  await cookieLogin(page.context(), owner);
  await page.goto('/admin.html#documents');
  await page.getByRole('button', { name: 'Carica documento' }).click();
  const upload = page.getByRole('dialog', { name: 'Carica documento' });
  await upload.getByLabel('File', { exact: true }).setInputFiles({
    name: 'istruzioni.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: makeDocx([
      { style: 'Titolo1', text: 'Istruzioni' },
      { text: 'Collegare il morsetto X3.' },
    ]),
  });
  await upload.getByLabel('Codice documento', { exact: true }).fill(code);
  await upload.getByLabel('Revisione', { exact: true }).fill('A');
  await upload.getByLabel('Titolo', { exact: true }).fill('Istruzioni DOCX (FITTIZIE)');
  await upload.getByRole('combobox', { name: 'Modello' }).last().selectOption('LTX-500');
  await upload.getByRole('button', { name: 'Carica come bozza' }).click();
  await expect(page.getByText(/Documento salvato come bozza/).first()).toBeVisible();
  const doc = await db.document.findFirstOrThrow({ where: { code } });
  expect([doc.status, doc.sourceFilename]).toEqual(['DRAFT', 'istruzioni.docx']);
});
