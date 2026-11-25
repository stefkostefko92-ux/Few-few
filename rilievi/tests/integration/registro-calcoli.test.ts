// The register links a calculation to its own page (the visual check, 16 November 2026): every "calcolo" entry
// led to /calcolo-argano/<id> — a governor calculation and a deleted one were 404. Now: a machine calculation
// without a scheda → /calcolo-argano/<id>, a governor one → /calcolo-limitatore/<id>, one on a scheda → the page
// of the scheda; a calculation that is gone has no link.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Browser, makeAzienda, prisma, signedIn, startApp, stopApp } from './harness.js';

before(startApp);
after(stopApp);

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
const IMPIANTO = {
  indirizzo: 'Via Dante 2, 20121 Milano (MI)',
  matricola: '0771',
  numeroImpianto: '7',
};

const id = (location: string, path: string) =>
  new RegExp(`^/${path}/([a-z0-9]+)#risultati$`).exec(location)?.[1] ?? '';

/** The "Apri calcolo" links of the register page. */
const collegamenti = async (browser: Browser) =>
  [...(await browser.get('/registro')).body.matchAll(/<a href="([^"]+)">Apri calcolo<\/a>/g)].map(
    (m) => m[1]!,
  );

describe('the register and the calculations', () => {
  it('links each calculation to its page, and a deleted one to nothing', async () => {
    const azienda = await makeAzienda();
    const { browser } = await signedIn('ADMIN', azienda.id);
    const argano = await browser.submit('/calcolo-argano/nuovo', '/calcolo-argano', {
      base: '',
      ...ARGANO,
      ...IMPIANTO,
    });
    const arganoId = id(argano.location, 'calcolo-argano');
    const limitatore = await browser.submit('/calcolo-limitatore/nuovo', '/calcolo-limitatore', {
      base: '',
      ...LIMITATORE,
      ...IMPIANTO,
    });
    const limitatoreId = id(limitatore.location, 'calcolo-limitatore');
    assert.ok(arganoId && limitatoreId, 'both saved');

    const prima = await collegamenti(browser);
    assert.ok(prima.includes(`/calcolo-argano/${arganoId}`), 'machine calculation');
    assert.ok(prima.includes(`/calcolo-limitatore/${limitatoreId}`), 'governor calculation');
    assert.ok(
      !prima.includes(`/calcolo-argano/${limitatoreId}`),
      'never the machine page for a governor',
    );
    for (const href of prima) assert.equal((await browser.get(href)).status, 200, href);

    // Deleted: the entries stay in the register, without a link.
    const via = await browser.submit(
      `/calcolo-argano/${arganoId}`,
      `/calcolo-argano/${arganoId}/elimina`,
      {},
    );
    assert.equal(via.status, 303);
    const dopo = await collegamenti(browser);
    assert.ok(!dopo.some((h) => h.includes(arganoId)), 'no link to a deleted calculation');
    assert.ok(
      await prisma.auditLog.count({ where: { action: 'ARGANO_CALCOLO', targetId: arganoId } }),
      'the entry stays',
    );
  });
});
