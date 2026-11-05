// The overspeed governor calculation as an A4 PDF: every case recalculated in the owner's workbook fits on
// one page with the company head, the four sections of the sheet "Limitatore" and its words for the
// results ("Entro i limiti", "Non ammesso: Vn>0,63", "Dato mancante"), and the two warnings at the end.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { calcolaLimitatore, type DatiLimitatore } from '../src/limitatore/calcolo.js';
import { renderCalcoloLimitatore } from '../src/limitatore/pdf.js';
import { righeLimitatore } from '../src/limitatore/righe.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

const EXCEL = JSON.parse(
  readFileSync(join(import.meta.dirname, 'limitatore-excel.json'), 'utf8'),
) as {
  casi: Record<string, { dati: DatiLimitatore }>;
};
const t = translatorFor('it');

describe(
  'the governor calculation PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('is one A4 page for every case of the workbook, with the words of the sheet', async () => {
      for (const [nome, { dati }] of Object.entries(EXCEL.casi)) {
        const pdf = await renderCalcoloLimitatore({
          sezioni: righeLimitatore(dati, calcolaLimitatore(dati), t),
          t,
          impianto: { indirizzo: 'Via Roma 1, Milano', matricola: '0012345', numeroImpianto: '7' },
          salvato: { quando: '05/11/2026, 10:00', autore: 'Giulia Bianchi' },
          testata: {
            intestazione: {
              nome: 'Ascensori Esempio S.r.l.',
              righe: ['Via Roma 12, 20121 Milano (MI)', 'P. IVA 01234567890', 'info@esempio.it'],
            },
            logo: null,
          },
          fontDir,
        });
        const doc = await PDFDocument.load(pdf);
        assert.equal(doc.getPageCount(), 1, nome);
        const { width, height } = doc.getPage(0).getSize();
        assert.deepEqual([Math.round(width), Math.round(height)], [595, 842], nome);
        const text = spawnSync('pdftotext', ['-layout', '-', '-'], { input: pdf });
        if (text.error === undefined) {
          const words = text.stdout.toString('utf8');
          assert.match(words, /Ascensori Esempio S\.r\.l\./, nome);
          assert.match(words, /Fune del limitatore/, nome);
          assert.match(words, /Importante: il calcolo esegue confronti numerici/, nome);
          if (nome === 'esempio del foglio') {
            assert.match(words, /Soglia massima \(esclusa\)\s+2,15625 m\/s/);
            assert.match(words, /Esito V1\s+Entro i limiti\s+OK/);
            assert.match(words, /Massimo a 2 decimali\s+2,15 m\/s/);
          }
          if (nome === 'istantaneo 0,64') assert.match(words, /Non ammesso: Vn>0,63/);
          if (nome === 'tutto vuoto') assert.match(words, /Esito Dp\/d\s+Dato mancante/);
        }
      }
    });
  },
);
