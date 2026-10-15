// The October 2026 brief against the real app: the Mastech orders (NG120, QI Touch), the power unit of
// a hydraulic lift, and the sections the print keeps.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-14',
  numeroImpianto: '880044',
  indirizzo: 'Via Novara 3, Milano',
  fermate: '6',
  tipoPorte: ['AUTOMATICHE'],
};

/** The NG120 order, as the browser sends it: the QI Touch form is on the page too, hidden. */
const NG120 = {
  quadroMarca: 'MASTECH',
  quadroModello: 'NG120',
  quadroOrdine: 'si',
  'mn-_': '1',
  'mn-en811': 'si',
  'mn-nFermate': '6',
  'mn-pianoA0': 'si',
  'mn-pianoAAltro1': '9',
  'mn-note': 'Quadro nel locale macchina',
  'mq-_': '1',
  'mq-numeroFermate': '6',
};

const PATHS = {
  ng120: 'ordine-quadro-mastech-ng120',
  qi: 'ordine-quadro-mastech-qi-touch',
  pelazza: 'ordine-quadro',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('the Mastech orders', () => {
  it('saves the order of the type chosen and serves its PDF only', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...NG120 });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.quadroModello, 'NG120');
    assert.deepEqual(row.ordineQuadro, {
      modulo: 'mastech-ng120',
      valori: {
        en811: true,
        nFermate: '6',
        pianoA0: true,
        pianoAAltro1: '9',
        note: 'Quadro nel locale macchina',
      },
    });
    const pdf = await browser.get(`/schede/${id}/${PATHS.ng120}`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await browser.get(`/schede/${id}/${PATHS.qi}`)).status, 404);
    assert.equal((await browser.get(`/schede/${id}/${PATHS.pelazza}`)).status, 404);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/${PATHS.ng120}"`));

    // The type changes to QI Touch: the order is the QI Touch form, the NG120 PDF is gone.
    const edit = await browser.get(`/schede/${id}/modifica`);
    const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
    const qi = { ...SURVEY, ...NG120, quadroModello: 'QI_TOUCH', base };
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, qi);
    assert.equal(saved.status, 303);
    const after = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(after.ordineQuadro, {
      modulo: 'mastech-qi-touch',
      valori: { numeroFermate: '6' },
    });
    assert.equal((await browser.get(`/schede/${id}/${PATHS.qi}`)).status, 200);
    assert.equal((await browser.get(`/schede/${id}/${PATHS.ng120}`)).status, 404);
  });

  it('asks for the type when the order is wanted without it, and keeps what was typed', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...NG120,
      quadroModello: '',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Scegli la tipologia del quadro \(NG120 o QI Touch\)/);
    assert.match(reply.body, /id="err-quadroModello"/);
    assert.match(reply.body, /name="mn-nFermate"[^>]*value="6"/);
  });

  it('puts both forms on the page under the make and the type, rows named as on the sheet', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    for (const [prefix, type] of [
      ['mn', 'NG120'],
      ['mq', 'QI_TOUCH'],
    ] as const) {
      assert.match(
        form.body,
        new RegExp(
          `data-when="quadroMarca" data-when-values="MASTECH" data-off>\\s*<div data-when="quadroModello" data-when-values="${type}" data-off>\\s*<div class="modulo" id="f-${prefix}"`,
        ),
        prefix,
      );
    }
    assert.match(
      form.body,
      /<div class="modulo__row" role="group" aria-labelledby="(r-mn-\d+-\d+)">\s*<span class="modulo__rowtitle" id="\1">Norme di riferimento<\/span>/,
    );
    // The survey fills the header of the forms when they first open.
    assert.match(form.body, /name="mq-dataOrdine"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
  });
});

describe('a hydraulic lift', () => {
  it('saves the power unit and drops the argano, and the print shows the power unit only', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, {
      ...SURVEY,
      tipoImpianto: 'IDRAULICO',
      centralinaDaFare: 'no',
      centralinaAzionamento: 'DIRETTO_LATERALE',
      centralinaMarca: 'GMV',
      emendamentoA3: 'si',
      arganoPreventivo: 'si',
      'pa-_': '1',
      'pa-pesoCabina': '650',
    });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.centralinaDaFare, false);
    assert.equal(row.centralinaMarca, 'GMV');
    assert.equal(row.emendamentoA3, true);
    assert.equal(row.arganoPreventivo, null);
    assert.equal(row.preventivoArgano, null);
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /<h2>Centralina<\/h2>/);
    assert.match(print.body, /<dt>Emendamento A3 da fare<\/dt>/);
    assert.doesNotMatch(print.body, /<h2>Argano<\/h2>|<h2>Limitatore<\/h2>/);
    assert.equal((await browser.get(`/schede/${id}/dati-argano`)).status, 404);
  });
});

describe('the sections of the print', () => {
  it('prints only the ticked sections, on paper and in the PDF, and shows the choice again', async () => {
    const { browser } = await signedIn('TECNICO');
    const keep = ['ubicazione', 'tipologia', 'quadro', 'allarme', 'telesoccorso'];
    const id = await create(browser, {
      ...SURVEY,
      noteImpianto: 'Nota da non stampare',
      allarmePortineria: 'si',
      'stampa-_': '1',
      stampa: keep,
    });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.ok(row.sezioniEscluse.includes('note') && !row.sezioniEscluse.includes('allarme'));
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /<h2>Allarme<\/h2>/);
    assert.doesNotMatch(print.body, /Nota da non stampare/);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, /Nota da non stampare/, 'the page keeps every section');
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, /name="stampa" value="allarme" checked/);
    assert.match(edit.body, /name="stampa" value="note"(?! checked)/);

    const forged = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      'stampa-_': '1',
      stampa: ['note', 'impianto'],
    });
    assert.equal(forged.status, 422);
  });
});
