// The overspeed governor calculation against the real app (the owner, 5 November 2026 — "tab calcolo
// limitatore" from the workbook Limitatore_velocita_EN81-20-2020.xlsx, following the machine calculation):
// on a scheda (Vn and d proposed from the scheda), saved on the open version, audited, results row by row
// with the sheet's words, a PDF; read-only for CLIENTE; never another company's. The menu page and the
// calculation without a scheda — calcolo-limitatore-libero.test.ts.
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
const FORM: Record<string, string> = {
  vn: '1,6',
  tipo: 'progressivo',
  v1: '2,1',
  vc: '1,9',
  forzaParacadute: '200',
  forzaLimitatore: '500',
  mbl: '25000',
  d: '8',
  dp: '240',
};

const pagina = (id: string) => `/schede/${id}/calcolo-limitatore`;

describe('the governor calculation of a scheda', () => {
  it('proposes Vn and d from the scheda, is saved, audited, shown row by row and drawn', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id, {
      funicellaDiametroMm: 6.5,
      preventivoArgano: { modulo: 'rilievo-dati-argani', valori: { velocita: '1,0 m/s' } },
    });
    const { user, browser } = await signedIn('TECNICO', azienda.id);
    assert.match(
      (await browser.get(`/schede/${scheda.id}`)).body,
      new RegExp(`href="${pagina(scheda.id)}"`),
    );
    const form = (await browser.get(pagina(scheda.id))).body;
    assert.match(form, /Dati proposti dalla scheda/);
    assert.match(form, /id="f-vn"[^>]*value="1"/);
    assert.match(form, /id="f-d"[^>]*value="6,5"/);
    assert.match(form, /id="f-v1"[^>]*value=""/);
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
    assert.deepEqual(row.dati, {
      vn: 1.6,
      tipo: 'progressivo',
      v1: 2.1,
      vc: 1.9,
      forzaParacadute: 200,
      forzaLimitatore: 500,
      mbl: 25000,
      d: 8,
      dp: 240,
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'LIMITATORE_CALCOLO', targetId: scheda.id },
    });
    assert.equal(audit?.aziendaId, azienda.id);

    const page = (await browser.get(pagina(scheda.id))).body;
    const riga = (key: string) =>
      new RegExp(`data-riga="${key}">[\\s\\S]*?</tr>`).exec(page)?.[0] ?? '';
    assert.match(riga('sogliaMin'), /1,84&nbsp;m\/s/);
    assert.match(riga('sogliaMax'), /2,15625&nbsp;m\/s/);
    assert.match(riga('esitoV1'), /Entro i limiti[\s\S]*esito--ok/);
    assert.match(riga('max2'), /2,15&nbsp;m\/s/);
    assert.match(riga('momento'), /Prima di V1/);
    assert.match(riga('esitoContatto'), /Coerente con V1/);
    assert.match(riga('forzaMinima'), /400&nbsp;N/);
    assert.match(riga('mblMinimo'), /4000&nbsp;N/);
    assert.match(riga('mbl'), /25\.000&nbsp;N/);
    assert.match(riga('rapporto'), />30</);
    assert.match(riga('esitoRapporto'), /Sufficiente/);
    assert.match(page, /5\.6\.2\.2\.1\.3 c\): Dp ≥ 30 × d\./, 'the note of the sheet');
    assert.match(page, /Riferimenti/);
    assert.ok(!/[А-яЁё]/.test(page), 'no Cyrillic in the page');

    const pdf = await browser.get(`${pagina(scheda.id)}.pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('says "Dato mancante" only where a value is missing, refuses an empty form', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const vuoto = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      base: '',
      tipo: '',
    });
    assert.equal(vuoto.status, 422);
    assert.match(vuoto.body, /Inserisci almeno un dato/);
    const errato = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      base: '',
      vn: '25',
      d: 'otto',
      tipo: 'a molla',
    });
    assert.equal(errato.status, 422);
    assert.match(errato.body, /Correggi 3 campi/);
    assert.match(errato.body, /Inserisci un valore tra 0 e 20/);
    assert.equal(await prisma.calcoloLimitatore.count({ where: { schedaId: scheda.id } }), 0);

    const parziale = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      base: '',
      forzaLimitatore: '450',
      mbl: '3600',
    });
    assert.equal(parziale.status, 303);
    const page = (await browser.get(pagina(scheda.id))).body;
    assert.match(page, /data-riga="sogliaMax">[\s\S]*?Vn non valida/);
    assert.match(page, /data-riga="esitoForza">[\s\S]*?Dato mancante/);
    assert.match(page, /data-riga="esitoMbl">[\s\S]*?Sufficiente/);
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
      v1: '2,2',
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Nel frattempo qualcuno ha salvato/);
    assert.match(stale.body, /id="f-v1"[^>]*value="2,2"/);

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
