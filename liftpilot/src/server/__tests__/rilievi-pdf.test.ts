// Rilievi — the sheet's PDF (pdfkit with DejaVu Sans), ported from rilievi's tests/pdf.test.ts (commit 174a1e3aa):
// a valid A4 document with Cyrillic and accents, a long work order onto a second page, the measurements' table over
// the next pages, the company's logo top left (PNG with its transparency, JPEG), never the suppliers' modules.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { PDFDocument } from 'pdf-lib';
import { rilieviTranslator } from '@/lib/rilievi/i18n';
import { pdfFontPaths, renderSchedaPdf } from '../rilievi/pdf';
import { JPEG_LOGO, PNG_LOGO, SCHEDA } from './rilievi-fixture';

const fontDir = process.env.REPORT_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);
const options = { t: rilieviTranslator(), generatedBy: 'Prova', fontDir, logo: null };
const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe('the sheet PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('renders a valid A4 PDF, Cyrillic notes included, a long work order on a second page', async () => {
    const pdf = await renderSchedaPdf({ ...SCHEDA, lavoriExtra: 'x '.repeat(1500) }, options);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.subarray(-6).toString().includes('%%EOF'));
    assert.ok(pdf.length > 5_000);
    assert.ok(pages(pdf) >= 2);
    assert.match(pdf.toString('latin1'), /\/MediaBox \[0 0 595\.28 841\.89\]/);
  });

  it('draws a row for every stop and carries on over the next pages', async () => {
    const without = await renderSchedaPdf({ ...SCHEDA, fermate: 60, bottoniereMisure: false }, options);
    const withTable = await renderSchedaPdf({
      ...SCHEDA,
      fermate: 60,
      misureBottoniere: Array.from({ length: 60 }, (_, i) => ({
        fermata: i + 1, piano: i === 0 ? 'S1' : null, lunghezzaMm: new Prisma.Decimal('320.5'), larghezzaMm: new Prisma.Decimal('105'),
        interasseSuperiore: 'Interasse 60 mm, due fori svasati', interasseInferiore: null, display: i % 2 === 0,
      })),
    }, options);
    assert.ok(pages(withTable) >= pages(without) + 1, '60 rows need at least one more page');
  });

  for (const [kind, logo] of [['png', PNG_LOGO], ['jpeg', JPEG_LOGO]] as const) {
    it(`embeds a ${kind} logo at the top of the sheet`, async () => {
      const pdf = await renderSchedaPdf(SCHEDA, { ...options, logo: { data: logo, width: 60, height: 18 } });
      const text = pdf.toString('latin1');
      assert.match(text, /\/Subtype \/Image/);
      assert.match(text, kind === 'png' ? /\/SMask/ : /\/DCTDecode/);
    });
  }

  it('says who made it and refuses to draw without the fonts', async () => {
    const pdf = await renderSchedaPdf(SCHEDA, options);
    const doc = await PDFDocument.load(pdf);
    assert.equal(doc.getCreator(), 'LiftPilot Rilievi — Carbon Stealth VCC');
    assert.equal(doc.getTitle(), 'Scheda rilievo impianto 104552');
    await assert.rejects(async () => renderSchedaPdf(SCHEDA, { ...options, fontDir: '/nonexistent' }), /REPORT_FONT_DIR/);
  });
});
