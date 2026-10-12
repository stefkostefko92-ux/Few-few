import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { pdfFileName, pdfFontPaths, renderSchedaPdf } from '../src/schede/pdf.js';
import type { SchedaFull } from '../src/schede/service.js';

const fontDir = process.env.PDF_FONT_DIR ?? '/usr/share/fonts/truetype/dejavu';
const fontsHere = existsSync(pdfFontPaths(fontDir).regular);

const scheda = {
  id: 'cm0000000000000000000001',
  data: new Date('2026-10-12T00:00:00.000Z'),
  indirizzo: 'Via Giuseppe Verdi 14, Milano',
  marca: 'Schindler',
  matricola: '0033871',
  numeroImpianto: '104552',
  portataKg: 630,
  capienzaPersone: 8,
  fermate: 6,
  ubicazioneMacchina: ['ALTO'],
  ubicazioneCassettina: -1,
  parcheggio: null,
  tipoImpianto: ['ELETTRICO'],
  tipoPorte: ['AUTOMATICHE', 'MANUALI'],
  serrature: true,
  serratureNumero: 6,
  serratureTipo: 'Elettromeccaniche',
  funiDiametroMm: new Prisma.Decimal('10.50'),
  funiTrefoli: 8,
  funiNumero: 4,
  funiLunghezzaM: new Prisma.Decimal('42.75'),
  limitatoreTipo: null,
  funicellaDiametroMm: null,
  funicellaLunghezzaM: null,
  tenditore: null,
  caviNumero: 2,
  caviConduttori: 24,
  caviLunghezzaM: null,
  noteQuadretto: null,
  noteImpianto: 'Бележка на български, città, perché.',
  noteBottoniere: null,
  lavoriExtra: 'x '.repeat(1500),
  searchText: '',
  createdById: null,
  updatedById: null,
  deletedAt: null,
  deletedById: null,
  createdAt: new Date('2026-10-12T09:00:00.000Z'),
  updatedAt: new Date('2026-10-12T09:30:00.000Z'),
  createdBy: { name: 'Tecnico Uno' },
  updatedBy: { name: 'Tecnico Due' },
  deletedBy: null,
} as unknown as SchedaFull;

describe('the sheet PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  for (const locale of ['it', 'bg', 'en'] as const) {
    it(`renders a valid A4 PDF in ${locale}, Cyrillic notes included`, async () => {
      const pdf = await renderSchedaPdf(scheda, {
        t: translatorFor(locale),
        fmt: viewHelpers(locale),
        generatedBy: 'Prova',
        fontDir,
      });
      assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
      assert.ok(pdf.subarray(-6).toString().includes('%%EOF'));
      assert.ok(pdf.length > 5_000);
      // The long work order spills onto a second page with its own footer.
      assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length >= 2);
    });
  }
});

describe('the PDF file name', () => {
  it('uses the lift number (or the matricola) and the date, safe characters only', () => {
    assert.equal(pdfFileName(scheda), 'scheda-104552-2026-10-12.pdf');
    assert.equal(pdfFileName({ ...scheda, numeroImpianto: null }), 'scheda-0033871-2026-10-12.pdf');
    assert.equal(
      pdfFileName({ ...scheda, numeroImpianto: null, matricola: null }),
      'scheda-00000001-2026-10-12.pdf',
    );
  });
});
