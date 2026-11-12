// The export file is described on the public page /esportazione (Data Act art. 26; Allegato B, B.9): the
// page lists the same sections and fields the exporter reads, from one source (src/aziende/formato.ts), so
// the two cannot drift. No key of a secret ever leaves: password hashes, 2FA secrets, invite tokens.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  campiEsportati,
  campiSchedaFigli,
  FORMATO_ESPORTAZIONE,
  SEZIONI_DATI,
} from '../src/aziende/formato.js';
import { componiDati } from '../src/aziende/esportazione.js';
import { hasKey } from '../src/i18n.js';

const vuoto = {
  azienda: {},
  persone: [],
  inviti: [],
  schede: [],
  interventi: [],
  cartelli: [],
  calcoliArgano: [],
  calcoliLimitatore: [],
  verbali: [],
  fornitori: [],
  ordini: [],
  registro: [],
};

describe('the export format', () => {
  it('writes dati.json with exactly the sections the page documents, in their order', () => {
    const dati = componiDati(vuoto, new Date('2026-11-12T10:00:00Z'));
    assert.deepEqual(Object.keys(dati), [...SEZIONI_DATI]);
    assert.equal(dati.formato, FORMATO_ESPORTAZIONE);
    assert.equal(dati.esportatoIl, '2026-11-12T10:00:00.000Z');
  });

  it('describes every section and every list inside a sheet on the page', () => {
    for (const s of SEZIONI_DATI) {
      assert.ok(hasKey('it', `esportazione.pagina.struttura.sezioni.${s}`), s);
    }
    for (const f of Object.keys(campiSchedaFigli())) {
      assert.ok(hasKey('it', `esportazione.pagina.struttura.figliNomi.${f}`), f);
    }
  });

  it('lists the fields from the code, and never a secret', () => {
    const campi = campiEsportati();
    assert.ok(campi.schede.length > 150, 'every column of a sheet');
    assert.ok(campi.schede.includes('matricola'));
    assert.ok(campi.persone.includes('email') && campi.persone.includes('ruolo'));
    assert.ok(campi.inviti.includes('email') && !campi.inviti.includes('tokenHash'));
    assert.ok(campiSchedaFigli().allegati.includes('ordineStampa'));
    const tutti = [...Object.values(campi), ...Object.values(campiSchedaFigli())].flat();
    for (const segreto of [
      'passwordHash',
      'totpSecretEnc',
      'totpLastStep',
      'tokenHash',
      'logoType',
    ]) {
      assert.ok(!tutti.includes(segreto), segreto);
    }
  });
});
