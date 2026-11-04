// The machine calculation of a scheda against the real app (the owner, 31 October 2026 — from the RT-E MOD
// workbook, its own page and PDF): filled the first time from the machine survey sheet of the scheda,
// saved on the open version, audited; read by whoever sees the scheda, written only by who writes schede
// in its company, never in the trash, never another company's.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;

async function makeScheda(aziendaId: string, extra: Record<string, unknown> = {}) {
  const matricola = `55${Date.now().toString().slice(-6)}${++counter}`;
  return prisma.scheda.create({
    data: {
      aziendaId,
      data: new Date('2026-10-20'),
      matricola,
      numeroImpianto: `4${counter}`,
      indirizzo: 'Via Roma 1, 20121 Milano (MI)',
      tipoImpianto: ['ELETTRICO'],
      searchText: matricola,
      ...extra,
    },
  });
}

// The first case of tests/argano-rt.json, as the form sends it.
const FORM: Record<string, string> = {
  portata: '480',
  massaCabina: '600',
  massaContrappeso: '840',
  velocita: '1',
  corsa: '20',
  sospensione: '1:1',
  macchina: 'alto',
  azionamento: '2V',
  giriMotore: '1400',
  motoreVvvf: '1500',
  rapportoA: '1',
  rapportoB: '50',
  diametroPuleggia: '500',
  gola: 'cuneo',
  angoloGola: '40',
  angoloAvvolgimento: '180',
  funiSostituzione: 'si',
  funiNumero: '4',
  fune: 'telcal-10-114',
  compensazione: 'nessuna',
};

const pagina = (id: string) => `/schede/${id}/calcolo-argano`;

describe('the machine calculation of a scheda', () => {
  it('comes filled from the machine survey sheet, is saved, audited and drawn as a PDF', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id, {
      portataKg: 480,
      preventivoArgano: {
        modulo: 'rilievo-dati-argani',
        valori: {
          pesoCabina: '600 kg',
          pesoContrappeso: '840',
          velocita: '1,0 m/s',
          taglia12: true,
          macchina: 'Alto',
          rapportoRiduzione: '2:53',
          diametroPuleggia: '500',
          cuneo: '40°',
          funiN: '4',
          funiDiametro: '10',
          trefoli: '6',
          motoreInverter: true,
          poli: '4',
        },
      },
    });
    const { user, browser } = await signedIn('TECNICO', azienda.id);
    assert.match(
      (await browser.get(`/schede/${scheda.id}`)).body,
      new RegExp(`href="${pagina(scheda.id)}"`),
    );

    const form = (await browser.get(pagina(scheda.id))).body;
    assert.match(form, /Dati proposti dal modulo rilievi dati argani/);
    assert.match(form, /id="f-portata"[^>]*value="480"/);
    assert.match(form, /id="f-massaCabina"[^>]*value="600"/);
    assert.match(form, /<option value="1:2" selected>/);
    assert.match(form, /<option value="VVVF" selected>/);
    assert.match(form, /<option value="2" selected>2<\/option>/);
    assert.match(form, /id="f-rapportoB"[^>]*value="53"/);
    assert.match(form, /<option value="telcal-10-114" selected>/);
    assert.match(form, /Il calcolo non è ancora stato salvato/);
    assert.equal(
      (await browser.get(`${pagina(scheda.id)}.pdf`)).status,
      404,
      'no PDF before saving',
    );

    const saved = await browser.submit(pagina(scheda.id), pagina(scheda.id), { ...FORM, base: '' });
    assert.equal(saved.status, 303);
    assert.equal(saved.location, `${pagina(scheda.id)}#risultati`);
    const row = await prisma.calcoloArgano.findUniqueOrThrow({ where: { schedaId: scheda.id } });
    assert.equal(row.updatedById, user.id);
    assert.equal(row.aziendaId, azienda.id, 'the calculation lives in the company of its scheda');
    assert.equal((row.dati as { rapportoB: number }).rapportoB, 50);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ARGANO_CALCOLO', targetId: scheda.id },
    });
    assert.equal(audit?.aziendaId, azienda.id);

    const results = (await browser.get(pagina(scheda.id))).body;
    assert.match(results, /0,733 m\/s/);
    assert.match(results, /−26,7 %/);
    assert.match(results, /2,223/);
    assert.match(results, /Aderenza verificata nei due casi/);
    assert.ok(!/[А-яЁё]/.test(results), 'no Cyrillic in the page');

    const pdf = await browser.get(`${pagina(scheda.id)}.pdf`);
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
    assert.equal(pdf.bytes.subarray(0, 5).toString('latin1'), '%PDF-');
  });

  it('saves only on the open version and keeps what the person wrote on a conflict', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    assert.equal(
      (await browser.submit(pagina(scheda.id), pagina(scheda.id), { ...FORM, base: '' })).status,
      303,
    );
    // A second "first" save, made on the empty page, is a conflict: someone saved in between.
    const stale = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base: '',
      portata: '630',
    });
    assert.equal(stale.status, 409);
    assert.match(stale.body, /Nel frattempo qualcuno ha salvato/);
    assert.match(stale.body, /id="f-portata"[^>]*value="630"/);
    const row = await prisma.calcoloArgano.findUniqueOrThrow({ where: { schedaId: scheda.id } });
    assert.equal((row.dati as { portata: number }).portata, 480);
    const base = /name="base" value="([^"]+)"/.exec(stale.body)![1]!;
    assert.equal(
      (
        await browser.submit(pagina(scheda.id), pagina(scheda.id), {
          ...FORM,
          base,
          portata: '630',
        })
      ).status,
      303,
    );
  });

  it('shows every mistake of the form and saves nothing', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const { browser } = await signedIn('TECNICO', azienda.id);
    const reply = await browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base: '',
      velocita: '12',
      giriMotore: '',
      fune: 'telcal-99-114',
    });
    assert.equal(reply.status, 422);
    assert.match(reply.body, /Correggi 3 campi/);
    assert.match(reply.body, /Inserisci un valore tra 0,05 e 10/);
    assert.equal(await prisma.calcoloArgano.count({ where: { schedaId: scheda.id } }), 0);
  });

  it('is read-only for CLIENTE, 404 for another company, closed in the trash', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id);
    const tecnico = await signedIn('TECNICO', azienda.id);
    await tecnico.browser.submit(pagina(scheda.id), pagina(scheda.id), { ...FORM, base: '' });

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
    assert.match(
      (await admin.browser.get(pagina(scheda.id))).body,
      /Puoi vedere il calcolo ma non modificarlo/,
    );
    const inTrash = await admin.browser.submit(pagina(scheda.id), pagina(scheda.id), {
      ...FORM,
      base: '',
    });
    assert.equal(inTrash.status, 404);
  });

  it('is not offered for a hydraulic lift (no machine)', async () => {
    const azienda = await makeAzienda();
    const scheda = await makeScheda(azienda.id, { tipoImpianto: ['IDRAULICO'] });
    const { browser } = await signedIn('TECNICO', azienda.id);
    assert.ok(!(await browser.get(`/schede/${scheda.id}`)).body.includes(pagina(scheda.id)));
  });
});
