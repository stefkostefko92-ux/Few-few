// Every calculation PDF that leaves the portal is recorded (the owner, 10 November 2026: "Fai tutto in
// modo tale da essere legalmente coperti e minimamente esposti"): what the person entered, what the
// software printed, the build and the reference "Rif." on the sheet, who and when. The record has no link
// to the calculation, the company or the person: it outlives them until its own term (src/legale/), so
// a dispute years later can still show what was entered and what came out.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { runMaintenance } from '../../src/maintenance.js';
import { CAMPI_EMISSIONE, sigilloValido } from '../../src/legale/sigillo.js';
import { ANNI_CONSERVAZIONE } from '../../src/legale/versioni.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

let counter = 0;
const unico = () => `${Date.now().toString().slice(-6)}${++counter}`;

// The first case of tests/argano-rt.json, as the form sends it.
const ARGANO: Record<string, string> = {
  portata: '480',
  massaCabina: '600',
  massaContrappeso: '840',
  velocita: '1',
  corsa: '20',
  sospensione: '1:1',
  macchina: 'alto',
  azionamento: '2V',
  giriMotore: '1400',
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
const LIMITATORE: Record<string, string> = {
  vn: '1,6',
  tipo: 'progressivo',
  norma: 'en81-20-2020',
  intervento: 'limitatore',
};

async function nuovo(browser: Browser, calcolo: 'argano' | 'limitatore'): Promise<string> {
  const saved = await browser.submit(`/calcolo-${calcolo}/nuovo`, `/calcolo-${calcolo}`, {
    base: '',
    ...(calcolo === 'argano' ? ARGANO : LIMITATORE),
    indirizzo: 'Via Dante 2, 20121 Milano (MI)',
    matricola: `0${unico()}`,
    numeroImpianto: '9',
  });
  assert.equal(saved.status, 303);
  const id = new RegExp(`^/calcolo-${calcolo}/([a-z0-9]+)#risultati$`).exec(
    saved.location ?? '',
  )?.[1];
  assert.ok(id, saved.location ?? '');
  return id;
}

/** The reference printed on the sheet, or null without poppler. */
function rifDelFoglio(pdf: Buffer): string | null {
  const words = spawnSync('pdftotext', ['-layout', '-', '-'], { input: pdf });
  if (words.error !== undefined) return null;
  return (
    /Rif\. ([0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4})/.exec(words.stdout.toString('utf8'))?.[1] ?? ''
  );
}

describe('the record of the calculation PDFs', () => {
  for (const calcolo of ['argano', 'limitatore'] as const) {
    it(`keeps what was entered and printed for every ${calcolo} PDF, with the reference of the sheet`, async () => {
      const azienda = await makeAzienda();
      const { browser, user } = await signedIn('TECNICO', azienda.id);
      const id = await nuovo(browser, calcolo);
      const prima = Date.now();
      const pdf = await browser.get(`/calcolo-${calcolo}/${id}/pdf`);
      assert.equal(pdf.status, 200);
      const stampa = await browser.get(`/calcolo-${calcolo}/${id}/pdf?inline=1`);
      assert.equal(stampa.status, 200);

      const righe = await prisma.emissioneCalcolo.findMany({
        where: { calcoloId: id },
        orderBy: { at: 'asc' },
      });
      assert.equal(righe.length, 2, 'the download and the print, each');
      const riga = righe[0]!;
      assert.equal(riga.calcolo, calcolo);
      assert.equal(riga.schedaId, null);
      assert.equal(riga.aziendaId, azienda.id);
      assert.equal(riga.aziendaNome, azienda.name);
      assert.equal(riga.userId, user.id);
      assert.equal(riga.userNome, user.name);
      assert.equal(riga.userEmail, user.email);
      assert.match(riga.build, /^[0-9a-f]{10}$/);
      assert.match(riga.impronta, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
      assert.equal(riga.pdfHash, createHash('sha256').update(pdf.bytes).digest('hex'));
      assert.ok(sigilloValido(riga, CAMPI_EMISSIONE), 'sealed, also as read back');
      assert.equal(sigilloValido({ ...riga, dati: {} }, CAMPI_EMISSIONE), false);
      const rif = rifDelFoglio(pdf.bytes);
      if (rif !== null) assert.equal(riga.impronta, rif, 'the same reference as on the sheet');
      const salvato = await (calcolo === 'argano'
        ? prisma.calcoloArgano.findUniqueOrThrow({ where: { id } })
        : prisma.calcoloLimitatore.findUniqueOrThrow({ where: { id } }));
      assert.deepEqual(riga.dati, salvato.dati, 'the input as saved');
      assert.ok(JSON.stringify(riga.risultato).length > 50, 'the printed results');
      const anni = (riga.conservaFino.getTime() - riga.at.getTime()) / (365.25 * 86_400_000);
      assert.ok(Math.abs(anni - ANNI_CONSERVAZIONE) < 0.01, `kept ${anni} years`);
      assert.ok(riga.at.getTime() >= prima - 1000);
    });
  }

  it('records the PDF of a calculation on a scheda with the scheda', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const matricola = `77${unico()}`;
    const scheda = await prisma.scheda.create({
      data: {
        aziendaId: azienda.id,
        data: new Date('2026-11-05'),
        matricola,
        numeroImpianto: '8',
        indirizzo: 'Via Roma 1, 20121 Milano (MI)',
        tipoImpianto: ['ELETTRICO'],
        searchText: `${matricola} via roma 1 20121 milano mi`,
      },
    });
    const p = `/schede/${scheda.id}/calcolo-limitatore`;
    const saved = await browser.submit(p, p, { base: '', ...LIMITATORE });
    assert.equal(saved.status, 303);
    assert.equal((await browser.get(`${p}.pdf`)).status, 200);
    const riga = await prisma.emissioneCalcolo.findFirstOrThrow({ where: { schedaId: scheda.id } });
    assert.equal(riga.calcolo, 'limitatore');
    assert.equal(riga.aziendaId, azienda.id);
  });

  it('outlives the calculation and the company, and goes only after its own term', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('TECNICO', azienda.id);
    const id = await nuovo(browser, 'limitatore');
    assert.equal((await browser.get(`/calcolo-limitatore/${id}/pdf`)).status, 200);
    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    assert.equal(await prisma.calcoloLimitatore.count({ where: { id } }), 0);
    const riga = await prisma.emissioneCalcolo.findFirstOrThrow({ where: { calcoloId: id } });
    assert.equal(riga.aziendaNome, azienda.name, 'the name stays with the record');

    await runMaintenance();
    assert.equal(await prisma.emissioneCalcolo.count({ where: { id: riga.id } }), 1);
    await prisma.emissioneCalcolo.update({
      where: { id: riga.id },
      data: { conservaFino: new Date(Date.now() - 1000) },
    });
    await runMaintenance();
    assert.equal(await prisma.emissioneCalcolo.count({ where: { id: riga.id } }), 0);
  });
});
