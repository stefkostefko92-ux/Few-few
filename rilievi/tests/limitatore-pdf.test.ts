// The overspeed governor calculation as an A4 PDF: one page with the company head, the speed and the type,
// and the short result — the V1 to set, the limit of the norm, the contact — or why the type is not
// allowed.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { translatorFor } from '../src/i18n.js';
import { calcolaLimitatore, type DatiLimitatore } from '../src/limitatore/calcolo.js';
import { renderCalcoloLimitatore } from '../src/limitatore/pdf.js';
import { sintesiLimitatore } from '../src/limitatore/righe.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

const t = translatorFor('it');

async function pdfDi(d: DatiLimitatore) {
  return renderCalcoloLimitatore({
    sintesi: sintesiLimitatore(d, calcolaLimitatore(d), t),
    t,
    impianto: { indirizzo: 'Via Roma 1, Milano', matricola: '0012345', numeroImpianto: '7' },
    salvato: { quando: '07/11/2026, 10:00', autore: 'Giulia Bianchi' },
    testata: {
      intestazione: {
        nome: 'Ascensori Esempio S.r.l.',
        righe: ['Via Roma 12, 20121 Milano (MI)', 'P. IVA 01234567890'],
      },
      logo: null,
    },
    fontDir,
  });
}

const parole = (pdf: Buffer) => {
  const text = spawnSync('pdftotext', ['-layout', '-', '-'], { input: pdf });
  return text.error === undefined ? text.stdout.toString('utf8') : null;
};

describe(
  'the governor calculation PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('is one A4 page with the V1 to set', async () => {
      const pdf = await pdfDi({ vn: 1.6, tipo: 'progressivo' });
      const doc = await PDFDocument.load(pdf);
      assert.equal(doc.getPageCount(), 1);
      const { width, height } = doc.getPage(0).getSize();
      assert.deepEqual([Math.round(width), Math.round(height)], [595, 842]);
      const words = parole(pdf);
      if (words !== null) {
        assert.match(words, /Ascensori Esempio S\.r\.l\./);
        assert.match(words, /Tarare V1\s+da 1,84 a 2,15 m\/s/);
        assert.match(
          words,
          /Limite di norma\s+da 1,84 m\/s \(incluso\) a 2,15625 m\/s \(escluso\)/,
        );
        assert.match(words, /Contatto elettrico\s+Prima di V1/);
      }
    });

    it('says why when the type is not allowed', async () => {
      const pdf = await pdfDi({ vn: 1, tipo: 'istantaneo' });
      assert.equal((await PDFDocument.load(pdf)).getPageCount(), 1);
      const words = parole(pdf);
      if (words !== null) {
        assert.match(words, /non ammesso con velocità oltre 0,63 m\/s/);
        assert.doesNotMatch(words, /Tarare V1/);
      }
    });
  },
);
