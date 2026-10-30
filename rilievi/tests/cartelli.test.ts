// The stop sign "Avviso di fermo impianto" (the owner, 30 October 2026): the five templates pinned to their
// images, the sample data wiped by filling each column between the background above and below it, the
// sign form and the company data read with distrust, and the A4 PDF with the logo and the data on top.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import {
  ATTIVITA_PREDEFINITA,
  datiSalvati,
  intestazioneDi,
  parseDatiSocietari,
} from '../src/aziende/dati.js';
import { parseCartello } from '../src/cartelli/form.js';
import {
  assertModelliCartello,
  immagineModello,
  isModelloId,
  MODELLI,
  MODELLI_ID,
  modelloDi,
  originale,
  pulisci,
} from '../src/cartelli/modelli.js';
import { adatta, renderCartello } from '../src/cartelli/pdf.js';
import { fontDir, fontsHere } from './scheda-pdf.js';

describe('the sign templates', () => {
  it('are the five images of the owner, pinned by SHA-256, the red one first', () => {
    assert.doesNotThrow(assertModelliCartello);
    assert.deepEqual([...MODELLI.keys()], [...MODELLI_ID]);
    assert.equal(MODELLI_ID.length, 5);
    assert.equal(modelloDi(null).id, 'rosso');
    assert.equal(modelloDi('viola').id, 'rosso', 'a template no longer there');
    assert.equal(modelloDi(['blu']).id, 'rosso', 'a forged value');
    assert.equal(modelloDi('blu').id, 'blu');
    assert.equal(isModelloId('__proto__'), false);
  });

  it('wipe a field by filling each column from the row above to the row below', () => {
    // 1 × 9 pixels: 10 on top, 250 at the bottom, "text" (0) in rows 3–5.
    const rgb = new Uint8Array([10, 10, 10, 0, 0, 0, 250, 250, 250].flatMap((v) => [v, v, v]));
    const width = 1;
    const height = 9;
    pulisci(rgb, width, height, [[0, 3, 1, 6]]);
    const column = [...rgb].filter((_, i) => i % 3 === 0);
    assert.deepEqual(column.slice(0, 3), [10, 10, 10], 'above untouched');
    assert.deepEqual(column.slice(6), [250, 250, 250], 'below untouched');
    assert.deepEqual(column.slice(3, 6), [70, 130, 190], 'a straight line in between');
  });

  it('leave no sample text where the company data goes: the field turns smooth', async () => {
    for (const modello of MODELLI.values()) {
      const [original, cleaned] = await Promise.all(
        [originale(modello), await immagineModello(modello)].map((bytes) =>
          sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
        ),
      );
      assert.equal(cleaned!.info.width, modello.larghezza);
      assert.equal(cleaned!.info.height, modello.altezza);
      // The largest field — the sample message to the people — had text; now it is a gradient.
      const [x0, y0, x1, y1] = modello.copri.reduce((a, b) =>
        (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]) >
        (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1])
          ? b
          : a,
      ).rect;
      const roughness = ({ data, info }: { data: Buffer; info: { width: number } }) => {
        let sum = 0;
        for (let y = y0; y < y1 - 1; y++)
          for (let x = x0; x < x1; x++)
            sum += Math.abs(
              data[(y * info.width + x) * 3]! - data[((y + 1) * info.width + x) * 3]!,
            );
        return sum / ((x1 - x0) * (y1 - y0 - 1));
      };
      assert.ok(roughness(original!) > 8, `${modello.id}: the sample had text`);
      assert.ok(roughness(cleaned!) < 3, `${modello.id}: the text is still there`);
    }
  });
});

describe('the sign form', () => {
  const FORM = {
    data: '2026-11-03',
    indirizzo: '  Via   Monte Santo 8 ',
    citta: 'Milano',
    ubicazione: '',
    testo: 'Fermo per lavori.\r\nRiattivato il 7/11.\u0007',
  };

  it('keeps the lines of the text, trims the rest, leaves the empty fields empty', () => {
    const parsed = parseCartello(FORM);
    assert.ok(parsed.ok);
    assert.equal(parsed.data.indirizzo, 'Via Monte Santo 8');
    assert.equal(parsed.data.ubicazione, null);
    assert.equal(parsed.data.testo, 'Fermo per lavori.\nRiattivato il 7/11.');
    assert.equal(parsed.data.data.toISOString(), '2026-11-03T00:00:00.000Z');
  });

  it('wants the date and the text, within the lengths of the columns', () => {
    const missing = parseCartello({ ...FORM, data: '', testo: ' \n ' });
    assert.ok(!missing.ok);
    assert.deepEqual(missing.errors, { data: 'required', testo: 'required' });
    const long = parseCartello({ ...FORM, citta: 'x'.repeat(81), testo: 'x'.repeat(601) });
    assert.ok(!long.ok);
    assert.deepEqual(long.errors, { citta: 'tooLong', testo: 'tooLong' });
    const forged = parseCartello({ ...FORM, indirizzo: ['a', 'b'], data: '2026-02-30' });
    assert.ok(!forged.ok);
    assert.deepEqual(forged.errors, { indirizzo: 'invalid', data: 'invalidDate' });
  });
});

describe('the company data', () => {
  const DATI = {
    ragioneSociale: 'Ascensori Prova S.r.l.',
    attivita: 'Manutenzione ascensori',
    indirizzo: 'Via Roma 12',
    cap: '20121',
    citta: 'Milano',
    provincia: 'mi',
    telefono: '02 1234567',
    email: 'info@prova.example',
    partitaIva: '01234567890',
    sito: 'www.prova.example',
  };

  it('are checked field by field, with a code for each mistake', () => {
    assert.ok(parseDatiSocietari(DATI).ok);
    assert.ok(parseDatiSocietari({}).ok, 'every field may stay empty');
    const wrong = parseDatiSocietari({
      ...DATI,
      email: 'no',
      telefono: '02 ABC',
      provincia: 'MIL',
      sito: 'www.prova .example',
      citta: ['Milano'],
    });
    assert.ok(!wrong.ok);
    assert.deepEqual(wrong.errors, {
      email: 'email',
      telefono: 'phone',
      provincia: 'tooLong',
      sito: 'invalid',
      citta: 'invalid',
    });
    const control = parseDatiSocietari({
      ...DATI,
      ragioneSociale: 'Ascensori\u0000 Prova\n S.r.l.',
    });
    assert.ok(control.ok);
    assert.equal(control.data.ragioneSociale, 'Ascensori Prova S.r.l.');
  });

  it('are read back with distrust: a wrong or unknown field becomes empty', () => {
    assert.equal(datiSalvati(null), null);
    assert.equal(datiSalvati(['x']), null);
    const salvati = datiSalvati({ ...DATI, email: 42, extra: 'x' });
    assert.ok(salvati);
    assert.equal(salvati.email, '');
    assert.equal('extra' in salvati, false);
  });

  it('make the head of the sign: name, activity and up to three lines', () => {
    assert.deepEqual(intestazioneDi('Azienda Portale', null), {
      nome: 'Azienda Portale',
      attivita: ATTIVITA_PREDEFINITA,
      righe: [],
    });
    assert.deepEqual(intestazioneDi('Azienda Portale', DATI), {
      nome: 'Ascensori Prova S.r.l.',
      attivita: 'Manutenzione ascensori',
      righe: [
        'Via Roma 12, 20121 Milano (MI)',
        'Tel. 02 1234567 – info@prova.example',
        'P. IVA 01234567890 – www.prova.example',
      ],
    });
    // Saved but left empty: the portal name, no activity line, no empty lines.
    assert.deepEqual(intestazioneDi('Azienda Portale', { ...DATI, ...emptied(DATI) }), {
      nome: 'Azienda Portale',
      attivita: '',
      righe: [],
    });
  });
});

const emptied = (value: Record<string, string>) =>
  Object.fromEntries(Object.keys(value).map((key) => [key, '']));

describe('a line of the sign', () => {
  // Like a real face: the width grows with the size, with the float error of a real measure.
  const misura = (testo: string, size: number) => testo.length * size * 0.5300000001;

  it('shrinks to fit before it cuts, and an exact fit is not cut', () => {
    const exact = misura('03/11/2026', 24) * 0.93;
    assert.deepEqual(adatta('03/11/2026', exact, 24, misura).testo, '03/11/2026');
    assert.equal(adatta('Milano', 200, 24, misura).size, 24, 'room enough: the size stays');
  });

  it('cuts with “…” only below 55 % of the size', () => {
    const fit = adatta('Via Giuseppe Garibaldi angolo Corso Venezia 128', 100, 24, misura);
    assert.equal(fit.size, 24 * 0.55);
    assert.match(fit.testo, /…$/);
    assert.ok(misura(fit.testo, fit.size) <= 100.01);
  });
});

describe('the sign PDF', { skip: !fontsHere && 'DejaVu fonts are not installed here' }, () => {
  const DATI_CARTELLO = {
    data: '03/11/2026',
    indirizzo: 'Via Monte Santo 8',
    citta: 'Milano',
    ubicazione: 'Scala B',
    testo: "Dal 3/11 l'impianto è fermo per lavori di ammodernamento. ".repeat(12),
  };

  it('is one A4 page in the direction of its template, with the logo or without', async () => {
    const logo = await sharp({
      create: {
        width: 300,
        height: 100,
        channels: 4,
        background: { r: 0, g: 60, b: 140, alpha: 0.8 },
      },
    })
      .png()
      .toBuffer();
    for (const modello of MODELLI.values()) {
      for (const withLogo of [logo, null]) {
        const pdf = await renderCartello(
          modello,
          DATI_CARTELLO,
          {
            intestazione: intestazioneDi('Ascensori Prova', null),
            logo: withLogo,
          },
          fontDir,
        );
        const doc = await PDFDocument.load(pdf);
        assert.equal(doc.getPageCount(), 1, modello.id);
        const { width, height } = doc.getPage(0).getSize();
        const larga = modello.larghezza >= modello.altezza;
        assert.deepEqual(
          [Math.round(width), Math.round(height)],
          larga ? [842, 595] : [595, 842],
          modello.id,
        );
      }
    }
  });

  it('stays quick with a 600-letter word: the PDF is drawn on the one thread of the portal', async () => {
    const az = { intestazione: intestazioneDi('Ascensori Prova', null), logo: null };
    await renderCartello(modelloDi('blu'), DATI_CARTELLO, az, fontDir);
    const start = performance.now();
    await renderCartello(
      modelloDi('blu'),
      { ...DATI_CARTELLO, testo: 'W'.repeat(600) },
      az,
      fontDir,
    );
    // Cut letter by letter it took 2–3 s; cut by halves, about 0.1 s.
    assert.ok(performance.now() - start < 1500, `${Math.round(performance.now() - start)} ms`);
  });

  it('writes in Fira Sans Condensed, and in DejaVu what that face has no glyph for', async () => {
    const fonts = async (nome: string) => {
      const pdf = await renderCartello(
        modelloDi('rosso'),
        DATI_CARTELLO,
        { intestazione: { nome, attivita: 'Manutenzione', righe: [] }, logo: null },
        fontDir,
      );
      return pdf.toString('latin1');
    };
    const latin = await fonts('Ascensori Prova');
    assert.match(latin, /FiraSansCondensed/);
    assert.match(await fonts('Асансьори Проба'), /DejaVuSans-Bold/);
  });
});
