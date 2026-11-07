// The overspeed governor calculation against the real app (the owner, 5 November 2026 — "tab calcolo
// limitatore" from the workbook Limitatore_velocita_EN81-20-2020.xlsx; 7 November — only the speed of the
// lift and the type of safety gear, and the result without long explanations): on a scheda (the speed
// proposed from the scheda), saved on the open version, audited, the V1 to set, a PDF; read-only for
// CLIENTE; never another company's. The menu page and the calculation without a scheda —
// calcolo-limitatore-libero.test.ts.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;
const unico = () => `${Date.now().toString().slice(-6)}${++counter}`;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `77${unico()}`;
  const indirizzo = (extra.indirizzo as string | undefined) ?? 'Via Roma 1, 20121 Milano (MI)';
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-11-05'),
      matricola,
      numeroImpianto: `8${counter}`,
      indirizzo,
      tipoImpianto: ['ELETTRICO'],
      searchText: `${matricola} ${indirizzo.toLowerCase().replace(/[^a-z0-9]+/g, ' ')}`,
      ...extra,
    },
  });
}

// The example of the sheet "Limitatore", as the form sends it.
const FORM: Record<string, string> = { vn: '1,6', tipo: 'progressivo' };

const pagina = (id: string) => `/schede/${id}/calcolo-limitatore`;

describe('the governor calculation of a scheda', () => {
  it('proposes the speed from the scheda, is saved, audited, gives the V1 to set and a PDF', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id, {
      preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { velocita: '1,0 m/s' } },
    });
    const { user, browser } = await signedIn('TECNICO', azienda.id);
    assert.match(
      (await browser.get(`/schede/${scheda.id}`)).body,
      new RegExp(`href="${pagina(scheda.id)}"`),
    );
    const form = (await browser.get(pagina(scheda.id))).body;
    assert.match(form, /Velocità presa dal modulo rilievi dati argani/);
    assert.match(form, /id="f-vn"[^>]*value="1"/);
    assert.match(
      form,
      /<option value="">—<\/option>\s*<option value="progressivo">/,
      'no type chosen',
    );
    assert.equal((form.match(/class="(?:input|select)"/g) ?? []).length, 2, 'two fields');
    assert.match(form, /Il calcolo non è ancora stato salvato/);
    assert.equal((await browser.get(`${pagina(scheda.id)}.pdf`)).status, 404, 'no PDF yet');

    const saved = await browser.submit(pagina(scheda.id), pagina(scheda.id), { ...FORM, base: '' });
    assert.equal(saved.status, 303);
    assert.equal(saved.location, `${pagina(scheda.id)}#risultati`);
    const row = await prisma.calcoloLimitatore.findUniqueOrThrow({
      where: { schedaId: scheda.id },
    });
    assert.equal(row.updatedById, user.id);
    assert.equal(row.aziendaId, azienda.id);
    assert.deepEqual(row.dati, { vn: 1.6, tipo: 'progressivo' });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'LIMITATORE_CALCOLO', targetId: scheda.id },
    });
    assert.equal(audit?.aziendaId, azienda.id);

    const page = (await browser.get(pagina(scheda.id))).body;
    assert.match(page, /data-esito="v1">da 1,84 a 2,15 m\/s</);
    assert.match(page, /data-esito="limite">da 1,84 m\/s \(incluso\) a 2,15625 m\/s \(escluso\)</);
    assert.match(page, /data-esito="contatto">Prima di V1</);
    assert.ok(!/[А-яЁё]/.test(page), 'no Cyrillic in the page');

    const pdf = await browser.get(`${pagina(scheda.id)}.pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('asks both values, and says only why when the type is not allowed', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const vuoto = await browser.submit(pagina(scheda.id), pagina(scheda.id), { base: '', vn: '' });
    assert.equal(vuoto.status, 422);
    assert.match(vuoto.body, /Correggi 2 campi/);
    const errato = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      base: '',
      vn: '25',
      tipo: 'a molla',
    });
    assert.equal(errato.status, 422);
    assert.match(errato.body, /Inserisci un valore tra 0,01 e 20/);
    assert.equal(await prisma.calcoloLimitatore.count({ where: { schedaId: scheda.id } }), 0);

    const istantaneo = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      base: '',
      vn: '1',
      tipo: 'istantaneo',
    });
    assert.equal(istantaneo.status, 303);
    const page = (await browser.get(pagina(scheda.id))).body;
    assert.match(
      page,
      /data-esito="motivo">Paracadute istantaneo non ammesso con velocità oltre 0,63/,
    );
    assert.ok(!page.includes('data-esito="v1"'));
  });

  it('saves only on the open version; read-only for CLIENTE; 404 elsewhere; closed in the trash', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const tecnico = await signedIn('TECNICO', azienda.id);
    const { browser } = tecnico;
    assert.equal(
      (await browser.submit(pagina(scheda.id), pagina(scheda.id), { ...FORM, base: '' })).status,
      303,
    );
    const stale = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base: '',
      vn: '2,5',
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Nel frattempo qualcuno ha salvato/);
    assert.match(stale.body, /id="f-vn"[^>]*value="2,5"/);

    const cliente = await signedIn('CLIENTE', azienda.id);
    const read = (await cliente.browser.get(pagina(scheda.id))).body;
    assert.match(read, /Puoi vedere il calcolo ma non modificarlo/);
    assert.match(read, /<fieldset class="section" disabled>/);
    assert.ok(!/Calcola e salva/.test(read));
    assert.equal((await cliente.browser.get(`${pagina(scheda.id)}.pdf`)).status, 200);
    const forged = await cliente.browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base: '',
    });
    assert.ok([403, 404].includes(forged.status), String(forged.status));

    const altra = await makeAzienda();
    const estraneo = await signedIn('ADMIN', altra.id);
    assert.equal((await estraneo.browser.get(pagina(scheda.id))).status, 404);
    assert.equal((await estraneo.browser.get(`${pagina(scheda.id)}.pdf`)).status, 404);

    await prisma.scheda.update({ where: { id: scheda.id }, data: { deletedAt: new Date() } });
    const admin = await signedIn('ADMIN', azienda.id);
    const base = /name="base" value="([^"]+)"/.exec(
      (await admin.browser.get(pagina(scheda.id))).body,
    )![1]!;
    const inTrash = await admin.browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base,
    });
    assert.equal(inTrash.status, 404);
  });

  it('is not offered for a hydraulic lift (no governor section on its scheda)', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id, { tipoImpianto: ['IDRAULICO'] });
    const { browser } = await signedIn('TECNICO', azienda.id);
    assert.ok(!(await browser.get(`/schede/${scheda.id}`)).body.includes(pagina(scheda.id)));
  });
});
