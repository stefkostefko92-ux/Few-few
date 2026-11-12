// A new version of the terms comes into force only once announced to the administrators, and never
// earlier than 30 days after the announcement (conditions art. 18.1) nor before its own date: without
// an announcement the current version stays. The switch is at midnight in Rome; nothing to deploy that day.
// The one exception is 2026-11-12 (the owner, 12 November 2026: only his test companies, nothing to announce):
// in force from its own day. The announcement rules are tested on a future version made up for the test.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  impostaAnnunci,
  inVigoreDal,
  modifiche,
  versioneProssima,
  versioneVigente,
} from '../src/legale/versioni.js';
import { leggiTesto } from '../src/legale/testi.js';

afterEach(() => impostaAnnunci([]));

/** A history with a version still to be announced (the real one has none after 2026-11-12). */
const FUTURA = ['2026-11-10', '2027-01-12'] as const;

describe('the versions of the legal texts', () => {
  it('put 2026-11-12 in force on its own day, without an announcement', () => {
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-11T22:59:59Z')), '2026-11-10');
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-11T23:00:00Z')), '2026-11-12');
    assert.equal(versioneProssima('CONDIZIONI', new Date('2026-11-12T10:00:00Z')), null);
    // 2027-01-12 never comes in: its text is inside 2026-11-12.
    assert.equal(versioneVigente('CONDIZIONI', new Date('2027-06-01T10:00:00Z')), '2026-11-12');
  });

  it('keep the current version while the next one is not announced', () => {
    const dopo = new Date('2027-03-01T10:00:00Z');
    assert.equal(versioneVigente('CONDIZIONI', dopo, FUTURA), '2026-11-10');
    assert.equal(inVigoreDal('CONDIZIONI', '2027-01-12', FUTURA), null);
    assert.deepEqual(versioneProssima('CONDIZIONI', dopo, FUTURA), {
      versione: '2027-01-12',
      dal: null,
      annunciataAt: null,
    });
    assert.equal(versioneVigente('REGOLE', dopo), '2026-11-10');
    assert.equal(versioneProssima('REGOLE', dopo), null);
  });

  it('switch at Rome midnight on their date when announced in time', () => {
    impostaAnnunci([
      {
        tipo: 'CONDIZIONI',
        versione: '2027-01-12',
        annunciatoAt: new Date('2026-11-20T10:00:00Z'),
      },
    ]);
    assert.equal(
      inVigoreDal('CONDIZIONI', '2027-01-12', FUTURA)?.toISOString(),
      '2027-01-11T23:00:00.000Z',
    );
    assert.equal(
      versioneVigente('CONDIZIONI', new Date('2027-01-11T22:59:59Z'), FUTURA),
      '2026-11-10',
    );
    assert.equal(
      versioneVigente('CONDIZIONI', new Date('2027-01-11T23:00:00Z'), FUTURA),
      '2027-01-12',
    );
    assert.equal(versioneProssima('CONDIZIONI', new Date('2027-01-12T10:00:00Z'), FUTURA), null);
  });

  it('wait 30 days after a late announcement', () => {
    impostaAnnunci([
      {
        tipo: 'CONDIZIONI',
        versione: '2027-01-12',
        annunciatoAt: new Date('2026-12-20T10:00:00Z'),
      },
    ]);
    // 20 December + 30 days = 19 January 2027, midnight in Rome.
    assert.equal(
      inVigoreDal('CONDIZIONI', '2027-01-12', FUTURA)?.toISOString(),
      '2027-01-18T23:00:00.000Z',
    );
    assert.equal(
      versioneVigente('CONDIZIONI', new Date('2027-01-15T10:00:00Z'), FUTURA),
      '2026-11-10',
    );
  });

  it('list what changes, article by article, for the notice', () => {
    const elenco = modifiche(
      leggiTesto('CONDIZIONI', '2026-11-10'),
      leggiTesto('CONDIZIONI', '2027-01-12'),
    );
    const chiavi = elenco.map((m) => `${m.numero}:${m.tipo}`);
    for (const atteso of [
      '1.10:nuovo',
      '2.1:modificato',
      '2.4:nuovo',
      '17.3:modificato',
      'A.11:modificato',
      'B.1:nuovo',
      'S.1:modificato',
    ])
      assert.ok(chiavi.includes(atteso), atteso);
    assert.ok(!chiavi.some((k) => k.startsWith('9.')), 'the liability cap is untouched');
    assert.ok(!chiavi.some((k) => k.startsWith('24')), 'the specific approval list is untouched');
  });

  it('list the subscription changes of 2026-11-12 on top of the Data Act text', () => {
    const chiavi = modifiche(
      leggiTesto('CONDIZIONI', '2026-11-10'),
      leggiTesto('CONDIZIONI', '2026-11-12'),
    ).map((m) => `${m.numero}:${m.tipo}`);
    for (const atteso of [
      '1.11:nuovo',
      '12.1:modificato',
      '12.2:modificato',
      '12.5:nuovo',
      '12.9:nuovo',
      '16.1:modificato',
      '19.1:modificato',
      'A.9:modificato',
      'B.1:nuovo',
    ])
      assert.ok(chiavi.includes(atteso), atteso);
    assert.ok(!chiavi.some((k) => k.startsWith('9.')), 'the liability cap is untouched');
  });
});
