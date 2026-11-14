// "Buono di lavoro" and its company: the code of the form and the clause written in the settings (empty by
// default), the sheets with their signatures in the export (dati.json and documenti/buoni/ in PDF/A) and gone
// with the company when it is deleted.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { eliminaAzienda } from '../../src/aziende/eliminazione.js';
import { esportaAzienda } from '../../src/aziende/esportazione.js';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';
import { readTar } from './tar.js';

before(startApp);
after(stopApp);

const FIRMA_C = JSON.stringify({ s: [[50, 100, 150, 180, 300, 30, 560, 110]] });

async function crea(browser: Browser, form: Record<string, string | string[]>) {
  const reply = await browser.submit('/buoni/nuovo', '/buoni', form);
  assert.equal(reply.status, 303, `create failed with ${reply.status}`);
  return reply.location.split('/').pop()!;
}

describe('buono di lavoro and its company', () => {
  it('the company writes its code and clause; export and deletion carry the sheets', async () => {
    const azienda = await makeAzienda('Buoni Impostazioni');
    const { browser: admin, user } = await signedIn('ADMIN', azienda.id);
    const page = `/impostazioni/buoni?azienda=${azienda.id}`;
    assert.equal((await admin.get(page)).status, 200);
    const saved = await admin.submit(page, '/impostazioni/buono', {
      azienda: azienda.id,
      codice: 'Mod. PO-05-3 Ed. 02',
      clausola: 'Clausola per i subappaltatori.',
    });
    assert.equal(saved.status, 303);
    const az = await prisma.azienda.findUniqueOrThrow({ where: { id: azienda.id } });
    assert.equal(az.buonoCodice, 'Mod. PO-05-3 Ed. 02');
    assert.equal(az.buonoClausola, 'Clausola per i subappaltatori.');
    const lungo = await admin.submit(page, '/impostazioni/buono', {
      azienda: azienda.id,
      codice: 'x'.repeat(81),
      clausola: '',
    });
    assert.equal(lungo.status, 422);

    const id = await crea(admin, {
      azienda: azienda.id,
      'seq-0-descrizione': 'Y',
      'seq-0-firma': FIRMA_C.replace('50', '51'),
    });
    const esportazione = await esportaAzienda(azienda.id, { id: user.id, master: false });
    assert.ok(esportazione);
    const chunks: Buffer[] = [];
    for await (const chunk of esportazione.stream) chunks.push(Buffer.from(chunk as Uint8Array));
    const entries = readTar(Buffer.concat(chunks));
    const json = [...entries].find(([name]) => name.endsWith('/dati.json'));
    assert.ok(json);
    const dati = JSON.parse(json[1].toString('utf8')) as {
      azienda: { buonoCodice: string };
      buoni: Array<{ id: string; firme: Array<{ posto: string; sigillo: string }> }>;
    };
    assert.equal(dati.azienda.buonoCodice, 'Mod. PO-05-3 Ed. 02');
    assert.equal(dati.buoni[0]!.id, id);
    assert.equal(dati.buoni[0]!.firme.length, 1);
    assert.ok(
      [...entries.keys()].some(
        (name) => name.includes(`/documenti/buoni/`) && name.endsWith(`${id}.pdf`),
      ),
    );

    await prisma.azienda.update({ where: { id: azienda.id }, data: { deactivatedAt: new Date() } });
    assert.equal(await eliminaAzienda(azienda.id, null), true);
    assert.equal(await prisma.buonoLavoro.count({ where: { id } }), 0);
    assert.equal(await prisma.buonoFirma.count({ where: { buonoId: id } }), 0);
  });
});
