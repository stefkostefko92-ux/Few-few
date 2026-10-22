import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Prisma } from '@prisma/client';
import sharp from 'sharp';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { pdfFileName, renderSchedaPdf } from '../src/schede/pdf.js';
import type { SchedaFull } from '../src/schede/service.js';
import { fontDir, fontsHere, pages, scheda } from './scheda-pdf.js';

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

  it('adds what the orders hold at the end only when the sheet asks for it', async () => {
    const options = {
      t: translatorFor('it'),
      fmt: viewHelpers('it'),
      generatedBy: 'Prova',
      fontDir,
      logo: null,
    };
    const ordine: SchedaFull = {
      ...scheda,
      quadroMarca: 'PELAZZA',
      quadroOrdine: true,
      ordineQuadro: {
        modulo: 'pelazza-ordine-quadri-032026',
        valori: { ordine: true, velocita: '1,0', note: 'Consegna in cantiere' },
      },
    };
    const without = await renderSchedaPdf({ ...ordine, riepilogoOrdini: false }, options);
    const withOrders = await renderSchedaPdf(
      { ...ordine, riepilogoOrdini: true, moduliStampati: ['ordineQuadro'] },
      options,
    );
    assert.equal(withOrders.subarray(0, 5).toString(), '%PDF-');
    assert.ok(withOrders.length > without.length, 'the order adds its own section');
    // Only the argano sheet ticked: the panel order stays out (it is its own PDF).
    const otherOnly = await renderSchedaPdf(
      { ...ordine, riepilogoOrdini: true, moduliStampati: ['preventivoArgano'] },
      options,
    );
    assert.ok(otherOnly.length < withOrders.length, 'the unticked panel order is not printed');
  });

  it('leaves out the sections the sheet takes off the print', async () => {
    const options = {
      t: translatorFor('it'),
      fmt: viewHelpers('it'),
      generatedBy: 'Prova',
      fontDir,
      logo: null,
    };
    const short = { ...scheda, lavoriExtra: null };
    const all = await renderSchedaPdf(short, options);
    const fewer = await renderSchedaPdf(
      { ...short, sezioniEscluse: ['funi', 'cavi', 'serrature', 'tipologia'] },
      options,
    );
    assert.ok(fewer.length < all.length, 'four sections fewer, a shorter document');
  });

  it('puts the photos of the sections at the end, from a new page, only when there are some', async () => {
    const options = {
      t: translatorFor('it'),
      fmt: viewHelpers('it'),
      generatedBy: 'Prova',
      fontDir,
      logo: null,
    };
    const short = { ...scheda, lavoriExtra: null };
    const landscape = await sharp({
      create: { width: 960, height: 720, channels: 3, background: '#406080' },
    })
      .jpeg()
      .toBuffer();
    const portrait = await sharp({
      create: { width: 720, height: 960, channels: 3, background: '#804060' },
    })
      .jpeg()
      .toBuffer();
    const plain = await renderSchedaPdf(short, options);
    const none = await renderSchedaPdf(short, { ...options, foto: [] });
    assert.equal(pages(none), pages(plain));
    const withPhotos = await renderSchedaPdf(short, {
      ...options,
      foto: [
        {
          titolo: 'Impianto',
          foto: [{ immagine: landscape, larghezza: 960, altezza: 720, didascalia: 'Ingresso' }],
        },
        {
          titolo: 'Quadro',
          foto: [1, 2, 3, 4, 5].map(() => ({
            immagine: portrait,
            larghezza: 720,
            altezza: 960,
            didascalia: 'Targa del quadro',
          })),
        },
      ],
    });
    // A new page for the photos; upright ones go two rows of two to a page: one landscape row and one
    // upright row on the first, the other two upright rows on the second.
    assert.equal(pages(withPhotos) - pages(plain), 2);
    assert.ok((withPhotos.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length >= 2);
  });
});

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
