import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
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
  buonoLavoro: 'BL 2026/512',
  portataKg: 630,
  capienzaPersone: 8,
  fermate: 6,
  ubicazioneMacchina: ['ALTO'],
  ubicazioneCassettina: -1,
  parcheggio: null,
  tipoImpianto: ['ELETTRICO'],
  tipoPorte: ['AUTOMATICHE', 'MANUALI'],
  operatoreMarca: 'Selcom',
  lucePorte: '800 x 2000',
  operatoreTensione: '24 V DC',
  doppioAccesso: false,
  bloccaPortine: true,
  autolivellamento: null,
  pattinoRetrattile: true,
  pattinoRetrattileNumero: 1,
  serrature: true,
  serratureNumero: 6,
  serratureTipo: 'Elettromeccaniche',
  luceVanoSostituire: true,
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
  telesoccorso: true,
  telesoccorsoStato: 'MANCA_PERIFERICA',
  allarmePortineria: false,
  displayPortineria: null,
  noteQuadretto: null,
  noteImpianto: 'Бележка на български, città, perché.',
  noteBottoniere: null,
  bottoniereMisure: false,
  misureBottoniere: [],
  lavoriExtra: 'x '.repeat(1500),
  searchText: '',
  createdById: null,
  updatedById: null,
  deletedAt: null,
  deletedById: null,
  createdAt: new Date('2026-10-12T09:00:00.000Z'),
  updatedAt: new Date('2026-10-12T09:30:00.000Z'),
  aziendaId: 'cm0000000000000000000a01',
  createdBy: { name: 'Tecnico Uno' },
  updatedBy: { name: 'Tecnico Due' },
  deletedBy: null,
  azienda: {
    id: 'cm0000000000000000000a01',
    name: 'Ascensori Rossi Srl',
    logoType: null,
    logoWidth: null,
    logoHeight: null,
    logoUpdatedAt: null,
  },
} as unknown as SchedaFull;

describe('the sheet PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  it('renders a valid A4 PDF, Cyrillic notes included', async () => {
    const pdf = await renderSchedaPdf(scheda, {
      t: translatorFor('it'),
      fmt: viewHelpers('it'),
      generatedBy: 'Prova',
      fontDir,
      logo: null,
    });
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.subarray(-6).toString().includes('%%EOF'));
    assert.ok(pdf.length > 5_000);
    // The long work order spills onto a second page with its own footer.
    assert.ok((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length >= 2);
  });
});

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;

describe(
  'the old push-button panels on the PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('draws a row for every stop and carries on over the next pages', async () => {
      const options = {
        t: translatorFor('it'),
        fmt: viewHelpers('it'),
        generatedBy: 'Prova',
        fontDir,
        logo: null,
      };
      const without = await renderSchedaPdf({ ...scheda, fermate: 60 }, options);
      const withTable = await renderSchedaPdf(
        {
          ...scheda,
          fermate: 60,
          bottoniereMisure: true,
          misureBottoniere: Array.from({ length: 60 }, (_, i) => ({
            id: `m${i}`,
            schedaId: scheda.id,
            fermata: i + 1,
            piano: i === 0 ? 'S1' : null,
            lunghezzaMm: new Prisma.Decimal('320.5'),
            larghezzaMm: new Prisma.Decimal('105'),
            interasseSuperiore: 'Interasse 60 mm, due fori svasati',
            interasseInferiore: null,
            display: i % 2 === 0,
          })),
        },
        options,
      );
      assert.ok(pages(withTable) >= pages(without) + 1, '60 rows need at least one more page');
    });
  },
);

describe(
  'the company logo on the PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    for (const kind of ['png', 'jpeg'] as const) {
      it(`embeds a ${kind} logo at the top of the sheet`, async () => {
        // The logo as stored after an upload: re-encoded by sharp (PNG with transparency, or JPEG).
        const base = sharp({
          create: {
            width: 600,
            height: 180,
            channels: 4,
            background: { r: 0, g: 60, b: 140, alpha: 0.7 },
          },
        });
        const logo = await (
          kind === 'png' ? base.png() : base.flatten({ background: '#ffffff' }).jpeg()
        ).toBuffer();
        const pdf = await renderSchedaPdf(
          {
            ...scheda,
            azienda: {
              ...scheda.azienda,
              logoType: `image/${kind}`,
              logoWidth: 600,
              logoHeight: 180,
              logoUpdatedAt: new Date(),
            },
          },
          { t: translatorFor('it'), fmt: viewHelpers('it'), generatedBy: 'Prova', fontDir, logo },
        );
        const text = pdf.toString('latin1');
        assert.match(text, /\/Subtype \/Image/);
        assert.match(text, kind === 'png' ? /\/SMask/ : /\/DCTDecode/);
      });
    }
  },
);

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
