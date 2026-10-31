// The Elettroquadri orders against the real app (the owner, 30 October 2026): the make opens the form
// of the kind of lift — electric → geared, MRL → gearless, hydraulic → oleodinamico — with no second
// question; the PDF of a saved sheet is the form of its kind only.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-30',
  numeroImpianto: '880077',
  indirizzo: 'Via Bisuschio 1, Varese',
  fermate: '5',
  tipoPorte: ['AUTOMATICHE'],
};

/** The order as the browser sends it: the three forms are on the page, two of them hidden. */
const ORDER = {
  quadroMarca: 'ELETTROQUADRI',
  quadroOrdine: 'si',
  'eg-_': '1',
  'eg-quadroDiManovra': 'si',
  'eg-nFermate': '5',
  'eg-note': 'Quadro nel locale macchina',
  'el-_': '1',
  'el-nFermate': '5',
  'eo-_': '1',
  'eo-nFermate': '5',
  'eo-softStarter': 'si',
};

const PATHS = {
  geared: 'ordine-quadro-elettroquadri-geared',
  gearless: 'ordine-quadro-elettroquadri-gearless',
  oleo: 'ordine-quadro-elettroquadri-oleodinamico',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('the Elettroquadri orders', () => {
  it('saves the form of the kind of lift and serves its PDF only, and follows a change of kind', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...ORDER, tipoImpianto: 'ELETTRICO' });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroMarca, 'ELETTROQUADRI');
    assert.deepEqual(row.ordineQuadro, {
      modulo: 'elettroquadri-geared',
      valori: { quadroDiManovra: true, nFermate: '5', note: 'Quadro nel locale macchina' },
    });
    const pdf = await browser.get(`/schede/${id}/${PATHS.geared}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    for (const path of [PATHS.gearless, PATHS.oleo, 'ordine-quadro']) {
      assert.equal((await browser.get(`/schede/${id}/${path}`)).status, 404, path);
    }
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/${PATHS.geared}"`));

    // The lift is hydraulic after all: the order is the oleodinamico form, the geared PDF is gone.
    const edit = await browser.get(`/schede/${id}/modifica`);
    const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      ...SURVEY,
      ...ORDER,
      tipoImpianto: 'IDRAULICO',
      base,
    });
    assert.equal(saved.status, 303);
    const after = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(after.ordineQuadro, {
      modulo: 'elettroquadri-oleodinamico',
      valori: { nFermate: '5', softStarter: true },
    });
    assert.equal((await browser.get(`/schede/${id}/${PATHS.oleo}`)).status, 200);
    assert.equal((await browser.get(`/schede/${id}/${PATHS.geared}`)).status, 404);
    // The edit page opens the oleodinamico form and keeps the others closed.
    const again = await browser.get(`/schede/${id}/modifica`);
    assert.match(
      again.body,
      /data-when="tipoImpianto" data-when-values="IDRAULICO">\s*<div class="modulo" id="f-eo" data-when="quadroOrdine" data-when-values="si" data-modulo/,
    );
    assert.match(again.body, /data-when="tipoImpianto" data-when-values="ELETTRICO" data-off>/);
  });

  it('asks for the kind of lift when the order is wanted without it, and keeps what was typed', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', { ...SURVEY, ...ORDER });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Scegli il tipo di impianto \(elettrico, idraulico o MRL\)/);
    assert.match(reply.body, /id="err-tipoImpianto"/);
    assert.match(reply.body, /name="eg-nFermate"[^>]*value="5"/);
  });

  it('puts the three forms on the page under the make and the kind, the header filled', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    assert.match(
      form.body,
      /<input type="radio" name="quadroMarca" value="ELETTROQUADRI" data-clearable><span class="tick__box" aria-hidden="true"><\/span><span>Elettroquadri<\/span>/,
    );
    for (const [prefix, kind] of [
      ['eg', 'ELETTRICO'],
      ['el', 'GEARLESS'],
      ['eo', 'IDRAULICO'],
    ] as const) {
      assert.match(
        form.body,
        new RegExp(
          `data-when="quadroMarca" data-when-values="ELETTROQUADRI" data-off>\\s*<div data-when="tipoImpianto" data-when-values="${kind}" data-off>\\s*<div class="modulo" id="f-${prefix}"`,
        ),
        prefix,
      );
    }
    // The survey fills the date of the order when the forms first open.
    assert.match(form.body, /name="eg-data"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
    assert.match(form.body, /name="el-ordineDel"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
  });
});
