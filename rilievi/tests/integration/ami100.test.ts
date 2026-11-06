// AMI 100 against the real app (owner, 3 November 2026): a reduced headroom or pit asks for its
// solutions; "AMI 100 Mono RTBS" ticked in either list saves its order sheet with the card and serves it
// as its own PDF. No "Installare AMI 100?" any more, no Mono UCM.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

const SURVEY = {
  data: '2026-11-03',
  numeroImpianto: '880077',
  indirizzo: 'Via Novara 5, Milano',
  portataKg: '630',
  fermate: '6',
  tipoImpianto: ['ELETTRICO'],
};

/** The RTBS order as the browser sends it, with the tick in the list of the reduced pit. */
const RTBS = {
  fossaRidotta: 'si',
  fossaInterventi: ['SEMAFORO', 'AMI100_RTBS'],
  'ar-_': '1',
  'ar-numeroOrdine': 'A-17',
  'ar-codiceAmi': 'RTBS-24',
  'ar-tensione24': 'si',
};

async function create(browser: Browser, form: Record<string, string | string[]>): Promise<string> {
  const reply = await browser.submit('/schede/nuova', '/schede', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('AMI 100 Mono RTBS', () => {
  it('saves the sheet ticked in the list of the reduced pit and serves its PDF', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, { ...SURVEY, ...RTBS, testataRidotta: 'no' });
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    // Kept in the order of the sheet, whatever order the form sent.
    assert.deepEqual(row.fossaInterventi, ['AMI100_RTBS', 'SEMAFORO']);
    assert.deepEqual(row.testataInterventi, []);
    assert.equal(row.ami100, null, 'the old question is not written any more');
    assert.deepEqual(row.ordineAmi, {
      modulo: 'ami100-mono-rtbs',
      valori: { numeroOrdine: 'A-17', codiceAmi: 'RTBS-24', tensione24: true },
    });
    const pdf = await browser.get(`/schede/${id}/ami100-mono-rtbs`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal((await browser.get(`/schede/${id}/ami100-mono-ucm`)).status, 404);
    const page = await browser.get(`/schede/${id}`);
    assert.match(page.body, new RegExp(`href="/schede/${id}/ami100-mono-rtbs"`));
    assert.match(page.body, /Semaforo fondo fossa/);
  });

  it('opens it from the reduced headroom too, and closes it when the tick goes', async () => {
    const { browser } = await signedIn('TECNICO');
    const id = await create(browser, {
      ...SURVEY,
      testataRidotta: 'si',
      testataInterventi: ['AMI100_RTBS'],
      'ar-_': '1',
      'ar-codiceAmi': 'RTBS-24',
    });
    const page = await browser.get(`/schede/${id}/modifica`);
    const base = /name="base" value="([^"]+)"/.exec(page.body)![1]!;
    assert.equal((await browser.get(`/schede/${id}/ami100-mono-rtbs`)).status, 200);
    const saved = await browser.submit(`/schede/${id}/modifica`, `/schede/${id}`, {
      ...SURVEY,
      testataRidotta: 'si',
      testataInterventi: ['PUNTONI_WW'],
      'ar-_': '1',
      'ar-codiceAmi': 'RTBS-24',
      base,
    });
    assert.equal(saved.status, 303);
    const row = await prisma.scheda.findUniqueOrThrow({ where: { id } });
    assert.deepEqual(row.testataInterventi, ['PUNTONI_WW']);
    assert.equal(row.ordineAmi, null);
    assert.equal((await browser.get(`/schede/${id}/ami100-mono-rtbs`)).status, 404);
  });

  it('puts the lists in the order of the sheet and the RTBS sheet after them', async () => {
    const { browser } = await signedIn('TECNICO');
    const form = await browser.get('/schede/nuova');
    const at = (text: string) => form.body.indexOf(text);
    assert.ok(at('name="testataRidotta"') < at('name="testataInterventi"'));
    assert.ok(at('name="testataInterventi"') < at('name="fossaRidotta"'));
    assert.ok(at('name="fossaInterventi"') < at('id="f-ar"'));
    assert.match(
      form.body,
      /<div class="modulo" id="f-ar" data-when="fossaInterventi" data-when-also="testataInterventi" data-when-values="AMI100_RTBS" data-off/,
    );
    assert.doesNotMatch(form.body, /name="ami100"|id="f-au"/);
    // The card fills the head of the sheet when it first opens.
    assert.match(form.body, /name="ar-data"[^>]*value="\d{2}\/\d{2}\/\d{4}"/);
  });
});
