import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-13',
  numeroImpianto: '880033',
  indirizzo: 'Via Dante 7, Torino',
  fermate: '5',
  portataKg: '480',
  tipoPorte: ['AUTOMATICHE'],
  doppioAccesso: 'si',
  ubicazioneMacchina: ['BASSO'],
};

/** A MoviLift order as the browser sends it: the Pelazza form is on the page too, hidden. */
const MOVILIFT = {
  quadroMarca: 'MOVILIFT',
  quadroOrdine: 'si',
  'oq-_': '1',
  'oq-nFermate': '9',
  'om-_': '1',
  'om-fermate': '5',
  'om-controllo': 'plc',
  'om-portata': '480',
  'om-ingressi': 'doppio',
  'om-marcaOpA': 'SELCOM',
  'om-voltA': '24Vcc',
  'om-pianoA1': 'T',
  'om-locMacc': 'basso',
  'om-note': 'Consegna in cantiere',
};

const SAVED = {
  modulo: 'movilift-modulo-ordine-scelta-v2-6',
  valori: {
    fermate: '5',
    controllo: 'plc',
    portata: '480',
    ingressi: 'doppio',
    marcaOpA: 'SELCOM',
    voltA: '24Vcc',
    pianoA1: 'T',
    locMacc: 'basso',
    note: 'Consegna in cantiere',
  },
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('the MoviLift panel order', () => {
  it('is on the form, hidden until the panel is a MoviLift, with the answers of the blank form', async () => {
    const { browser } = await signedIn('TECNICO');
    const page = await browser.get('/schede/nuova');
    assert.match(page.body, /data-when="quadroMarca" data-when-values="MOVILIFT" data-off>/);
    // Linked to the sheet: follows it while nobody changes it.
    assert.match(
      page.body,
      /name="om-locMacc" value="alto" data-clearable checked data-auto="si" data-predefinito>/,
    );
    assert.match(
      page.body,
      /name="om-controllo" value="scheda" data-clearable checked data-predefinito>/,
    );
    assert.match(
      page.body,
      /<select class="select" id="f-om-voltA" name="om-voltA" data-prefill="operatoreTensione">/,
    );
    assert.match(page.body, /<script src="\/static\/js\/moduli\.js\?v=[^"]+" defer><\/script>/);
  });

  it('is saved with the sheet and comes out as its own PDF, never as a Pelazza order', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...MOVILIFT });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(row.ordineQuadro, SAVED);
    const show = await browser.get(`/schede/${id}`);
    assert.match(show.body, /Modulo ordine quadro \(Scelta v2\.6\) · MoviLift/);
    assert.match(show.body, new RegExp(`href="/schede/${id}/ordine-quadro-movilift\\?inline=1"`));
    const pdf = await browser.get(`/schede/${id}/ordine-quadro-movilift`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.match(
      pdf.headers.get('content-disposition') ?? '',
      /^attachment; filename="ordine-quadro-movilift-880033-2026-10-13\.pdf"$/,
    );
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro`)).status, 404);
  });

  it('asks to confirm what disagrees with the sheet, as the panel order', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...MOVILIFT,
      'om-fermate': '6',
      'om-ingressi': 'unico',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /<strong>Fermate<\/strong> — Scheda: 5 · Ordine quadro: 6/);
    assert.match(
      reply.body,
      /<strong>Doppio accesso<\/strong> — Scheda: Sì · Ordine quadro: Operatore Unico/,
    );
    assert.doesNotMatch(
      reply.body,
      /Ordine quadro: 9/,
      'what is left of the Pelazza form is not read',
    );
  });

  it('gives way to a Pelazza order opened from the sheet when the panel changes make', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...MOVILIFT });
    const edit = await browser.get(`/schede/${id}/modifica`);
    assert.match(edit.body, /name="om-controllo" value="plc" data-clearable checked>/);
    assert.match(edit.body, /<option value="SELCOM" selected>/);
    assert.match(edit.body, /name="oq-nFermate"[^>]*value="5" data-auto="5"/);
    const base = /name="base" value="([^"]+)"/.exec(edit.body)![1]!;
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      ...SURVEY,
      ...MOVILIFT,
      quadroMarca: 'PELAZZA',
      'oq-nFermate': '5',
      base,
    });
    assert.equal(saved.status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(row.ordineQuadro, {
      modulo: 'pelazza-ordine-quadri-032026',
      valori: { nFermate: '5' },
    });
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro-movilift`)).status, 404);
    assert.equal((await browser.get(`/schede/${id}/ordine-quadro`)).status, 200);
  });

  it('comes into the sheet print when asked, its choices worded as on the paper', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...MOVILIFT, riepilogoOrdini: '1' });
    const print = await browser.get(`/schede/${id}/stampa`);
    assert.match(print.body, /Modulo ordine quadro \(Scelta v2\.6\) · MoviLift/);
    assert.match(print.body, /Controllo: <strong>PLC<\/strong>/);
    assert.match(print.body, /Marca Op \(lato A\): <strong>SELCOM<\/strong>/);
    assert.match(print.body, /<\/span>Doppio Ingresso<span class="visually-hidden"> ✓<\/span>/);
    assert.match(
      print.body,
      /<\/span>Loc\. Macc\. in BASSO<span class="visually-hidden"> ✓<\/span>/,
    );
    const pdf = await browser.get(`/schede/${id}/pdf`);
    assert.equal(pdf.status, 200);
  });

  it('refuses a forged option of a radio group or a list, with the field named', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...MOVILIFT,
      'om-voltA': '380V',
      'om-controllo': 'constructor',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /href="#f-om-controllo">Controllo \(MoviLift\): Scelta non valida\./);
    assert.match(
      reply.body,
      /href="#f-om-voltA">VOLT \(lato A\) \(MoviLift\): Scelta non valida\./,
    );
    assert.match(
      reply.body,
      /<fieldset class="modulo__radio" id="f-om-controllo" aria-describedby/,
    );
  });
});
