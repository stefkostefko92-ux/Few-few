import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { viewHelpers } from '../src/http/view.js';
import { translatorFor } from '../src/i18n.js';
import { renderSchedaPdf } from '../src/schede/pdf.js';
import {
  foglioDa,
  GRIGLIA,
  MAX_ELEMENTI,
  MAX_FOGLI,
  MAX_JSON_FOGLIO,
  MAX_SEGMENTI,
  schizziDi,
  schizziFromBody,
  schizziStampatiDi,
} from '../src/schizzi/model.js';
import { fontDir, fontsHere, pages, scheda } from './scheda-pdf.js';

const tratto = (d: string, c = 'k', s = 1) => ({ t: 'p', c, s, d });
const testo = (v: string, x = 100, y = 200) => ({ t: 'x', c: 'r', s: 2, x, y, v });

describe('a sketch sheet', () => {
  it('takes pen strokes, lines, rectangles and texts in sheet units', () => {
    const foglio = {
      e: [
        tratto('M10 20l5 -3l0 0'),
        tratto('M100 100l200 0l0 150l-200 0z', 'b', 2),
        testo('Vano 1600 × 1400'),
      ],
    };
    assert.deepEqual(foglioDa(JSON.stringify(foglio)), foglio);
    // From the database: already an object.
    assert.deepEqual(foglioDa(foglio), foglio);
  });

  it('refuses anything that is not a sheet', () => {
    const cases: unknown[] = [
      { e: [tratto('M10 20L5 3')] },
      { e: [tratto('M10 20c1 2 3 4 5 6')] },
      { e: [tratto('M10 20l1e3 2')] },
      { e: [tratto('M10 20l1 1"/><script>')] },
      { e: [tratto('M10 20')] },
      { e: [tratto('M1500 20l1 1')] },
      { e: [tratto('M10 20l1 1', 'g')] },
      { e: [tratto('M10 20l1 1', 'k', 3)] },
      { e: [{ ...tratto('M10 20l1 1'), extra: 1 }] },
      { e: [testo('x', 10.5)] },
      { e: [testo('x', 10, 1001)] },
      { e: [testo('   ')] },
      { e: [testo('a'.repeat(121))] },
      { e: [tratto(`M0 0${'l1 1'.repeat(MAX_SEGMENTI + 1)}`)] },
      { e: Array.from({ length: MAX_ELEMENTI + 1 }, () => tratto('M1 1l1 1')) },
      { e: [], extra: 1 },
      [],
    ];
    for (const bad of cases) {
      assert.equal(foglioDa(JSON.stringify(bad)), null, JSON.stringify(bad).slice(0, 60));
    }
    assert.equal(foglioDa('not json'), null);
    assert.equal(foglioDa(' '.repeat(MAX_JSON_FOGLIO + 1)), null);
  });

  it('keeps the texts clean: no control or invisible characters, single spaces', () => {
    const foglio = foglioDa(JSON.stringify({ e: [testo('  Vano\u0007 1600​\n× 1400  ')] }));
    const el = foglio?.e[0];
    assert.equal(el?.t === 'x' ? el.v : null, 'Vano 1600 × 1400');
  });

  it('drops half an emoji (the database refuses it) and keeps a whole one', () => {
    const v = (text: string) => {
      const el = foglioDa(JSON.stringify({ e: [testo(text)] }))?.e[0];
      return el?.t === 'x' ? el.v : null;
    };
    assert.equal(v('Vano \ud83d'), 'Vano');
    assert.equal(v('\ude00Vano'), 'Vano');
    assert.equal(v('Vano 😀'), 'Vano 😀');
  });

  it('is drawn on squared paper, a line every 50 units', () => {
    assert.equal((GRIGLIA.match(/M/g) ?? []).length, 27 + 19);
  });
});

describe('the sketch sheets from the form', () => {
  const a = JSON.stringify({ e: [tratto('M10 20l5 5')] });
  const empty = '{"e":[]}';

  it('are left alone without the block; empty ones drop; a tampered one fails them all', () => {
    assert.deepEqual(schizziDi({ schizzo: a }), { success: true, data: undefined });
    assert.deepEqual(schizziDi({ 'schizzi-_': '1' }), { success: true, data: [] });
    assert.deepEqual(schizziDi({ 'schizzi-_': '1', schizzo: [a, empty, a] }), {
      success: true,
      data: [JSON.parse(a), JSON.parse(a)],
    });
    assert.equal(schizziDi({ 'schizzi-_': '1', schizzo: [a, '{"e":[{"t":"p"}]}'] }).success, false);
    assert.equal(
      schizziDi({ 'schizzi-_': '1', schizzo: Array(MAX_FOGLI + 1).fill(a) }).success,
      false,
    );
    assert.equal(schizziDi({ 'schizzi-_': '1', schizzo: { x: 1 } }).success, false);
  });

  it('take the print tick only when it is on the page', () => {
    assert.equal(schizziStampatiDi({ schizziStampati: '1' }), undefined);
    assert.equal(schizziStampatiDi({ 'schizziStampati-_': '1', schizziStampati: '1' }), true);
    assert.equal(schizziStampatiDi({ 'schizziStampati-_': '1' }), false);
  });

  it('come back as sent when the form returns: the valid ones, the empty ones too', () => {
    assert.equal(schizziFromBody({ schizzo: a }), undefined);
    assert.deepEqual(schizziFromBody({ 'schizzi-_': '1', schizzo: [a, 'bad', empty] }), [a, empty]);
  });

  it('come back without the bad elements, up to 20 of them, and only up to the weight', () => {
    const back = (...e: unknown[]) =>
      schizziFromBody({ 'schizzi-_': '1', schizzo: JSON.stringify({ e }) });
    const good = testo('Vano');
    const bad = { t: 'x' };
    assert.deepEqual(back(good, bad, good), [JSON.stringify({ e: [good, good] })]);
    assert.deepEqual(back(good, ...Array.from({ length: 20 }, () => bad)), [
      JSON.stringify({ e: [good] }),
    ]);
    assert.deepEqual(back(good, ...Array.from({ length: 21 }, () => bad)), []);
    // A dimension draws six: 1000 fill the sheet, the one after them stays out.
    const quota = { t: 'q', c: 'k', s: 1, x1: 10, y1: 10, x2: 20, y2: 10, o: 0, v: '?' };
    const full = back(...Array.from({ length: 1001 }, () => quota));
    assert.equal((JSON.parse(full![0]!) as { e: unknown[] }).e.length, 1000);
  });

  it('are refused over the count before any element is checked (no seconds on a tampered form)', () => {
    const many = JSON.stringify({
      e: Array.from({ length: MAX_ELEMENTI + 1 }, () => ({ t: 'x' })),
    });
    const start = performance.now();
    assert.equal(foglioDa(many), null);
    assert.equal(
      schizziDi({ 'schizzi-_': '1', schizzo: Array(MAX_FOGLI).fill(many) }).success,
      false,
    );
    assert.deepEqual(
      schizziFromBody({ 'schizzi-_': '1', schizzo: Array(MAX_FOGLI).fill(many) }),
      [],
    );
    // Bad elements stop the check at the first one.
    const bad = JSON.stringify({ e: Array.from({ length: MAX_ELEMENTI }, () => ({ t: 'x' })) });
    assert.equal(foglioDa(bad), null);
    assert.deepEqual(
      schizziFromBody({ 'schizzi-_': '1', schizzo: Array(MAX_FOGLI).fill(bad) }),
      [],
    );
    assert.ok(performance.now() - start < 500, `${Math.round(performance.now() - start)} ms`);
  });
});

describe(
  'the sketches in the PDF',
  { skip: !fontsHere && 'DejaVu fonts are not installed here' },
  () => {
    it('go after the sheet, two to a page', async () => {
      const options = {
        t: translatorFor('it'),
        fmt: viewHelpers('it'),
        generatedBy: 'Prova',
        fontDir,
        logo: null,
      };
      const short = { ...scheda, lavoriExtra: null };
      const foglio = foglioDa(JSON.stringify({ e: [tratto('M10 20l500 300'), testo('Vano')] }))!;
      const plain = await renderSchedaPdf(short, options);
      assert.equal(pages(await renderSchedaPdf(short, { ...options, schizzi: [] })), pages(plain));
      const two = await renderSchedaPdf(short, { ...options, schizzi: [foglio, foglio] });
      const four = await renderSchedaPdf(short, {
        ...options,
        schizzi: [foglio, foglio, foglio, foglio],
      });
      // Two sheets fill at most one page more; two more sheets — exactly one more page.
      assert.ok(pages(two) - pages(plain) >= 1 && pages(two) - pages(plain) <= 2);
      assert.equal(pages(four) - pages(two), 1);
    });

    it('write every Latin-1 character with the screen font (WOFF2 broke "i" and the accents)', async () => {
      const chars = (from: number, to: number) =>
        Array.from({ length: to - from + 1 }, (_, i) => String.fromCharCode(from + i)).join('');
      const texts = [chars(0x21, 0x7e), chars(0xa1, 0xff), 'Più già così: = 1600 × 1400 — “Ø 600”'];
      const foglio = foglioDa(
        JSON.stringify({ e: texts.map((v, i) => ({ ...testo('x'), y: 100 + i * 100, v })) }),
      )!;
      assert.equal(foglio.e.length, texts.length);
      const pdf = await renderSchedaPdf(
        { ...scheda, lavoriExtra: null },
        {
          t: translatorFor('it'),
          fmt: viewHelpers('it'),
          generatedBy: 'Prova',
          fontDir,
          logo: null,
          schizzi: [foglio],
        },
      );
      assert.ok(pages(pdf) >= 2);
    });
  },
);
