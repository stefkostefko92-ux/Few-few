// AMI 100 against the real app (30 October 2026): asked with a reduced pit or headroom, the order sheet
// of the type chosen saved with the card and served as its own PDF; the 2SG sheet drawn anew.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-10-30',
  numeroImpianto: '880077',
  indirizzo: 'Via Novara 5, Milano',
  portataKg: '630',
  fermate: '6',
  tipoImpianto: ['ELETTRICO'],
};

/** AMI 100 Mono UCM as the browser sends it: the RTBS form is on the page too, hidden. */
const UCM = {
  fossaRidotta: 'si',
  ami100: 'si',
  ami100Tipo: 'MONO_UCM',
  'au-_': '1',
  'au-numeroOrdine': 'A-17',
  'au-portata': '630',
  'au-fermate': '6',
  'au-spessore9': 'si',
  'au-tensione24': 'si',
  'ar-_': '1',
  'ar-numeroOrdine': '',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('AMI 100', () => {
  it('saves the sheet of the type chosen and serves its PDF only', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...UCM });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.equal(row.ami100, true);
    assert.equal(row.ami100Tipo, 'MONO_UCM');
    assert.deepEqual(row.ordineAmi, {
      modulo: 'ami100-mono-ucm',
      valori: {
        numeroOrdine: 'A-17',
        portata: '630',
        fermate: '6',
        spessore9: true,
        tensione24: true,
      },
    });
    const pdf = await browser.get(`/schede/${id}/ami100-mono-ucm`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await browser.get(`/schede/${id}/ami100-mono-rtbs`)).status, 404);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/ami100-mono-ucm"`));
  });

  it('asks for the type when AMI 100 is wanted without it, and keeps what was typed', async () => {
    const { browser } = await signedIn('TECNICO');
    const reply = await browser.submit('/schede/nuova', '/schede', {
      ...SURVEY,
      ...UCM,
      ami100Tipo: '',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Scegli AMI 100 Mono UCM o Mono RTBS/);
    assert.match(reply.body, /id="err-ami100Tipo"/);
    assert.match(reply.body, /name="au-numeroOrdine"[^>]*value="A-17"/);
  });

  it('puts the question under the reduced pit or headroom and both sheets under the type', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    assert.match(
      form.body,
      /data-when="fossaRidotta" data-when-also="testataRidotta" data-when-values="si" data-off/,
    );
    for (const [prefix, type] of [
      ['au', 'MONO_UCM'],
      ['ar', 'MONO_RTBS'],
    ] as const) {
      assert.match(
        form.body,
        new RegExp(
          `<div data-when="ami100Tipo" data-when-values="${type}" data-off>\\s*<div class="modulo" id="f-${prefix}"`,
        ),
        prefix,
      );
    }
    // The card fills the head of the sheets when they first open.
    assert.match(form.body, /name="au-data"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
  });
});
