// A new version of the terms comes into force only once announced to the administrators, and never
// earlier than 30 days after the announcement (conditions art. 18.1) nor before its own date: without
// an announcement the current version stays. The switch is at midnight in Rome; nothing to deploy that day.
// The one exception is 2026-11-12 (the owner, 12 November 2026: only his test companies, nothing to announce):
// in force from its own day. The announcement rules are tested on a future version made up for the test.
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  condizioniValide,
  impostaAnnunci,
  inVigoreDal,
  modifiche,
  versioneProssima,
  versioneVigente,
  versioniValide,
} from '../src/legale/versioni.js';
import { leggiTesto } from '../src/legale/testi.js';

afterEach(() => impostaAnnunci([]));

/** A history with a version still to be announced (the real one has none after 2026-11-14). */
const FUTURA = ['2026-11-10', '2027-01-12'] as const;

describe('the versions of the legal texts', () => {
  it('put 2026-11-12 in force on its own day, without an announcement', () => {
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-11T22:59:59Z')), '2026-11-10');
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-11T23:00:00Z')), '2026-11-12');
  });

  it('put 2026-11-13 in force at midnight (Rome) of its own day, without an announcement', () => {
    // The owner, 12 November 2026: "at once" — still only his test companies in the portal.
    const sera = new Date('2026-11-12T22:59:59Z');
    assert.equal(versioneVigente('CONDIZIONI', sera), '2026-11-12');
    assert.deepEqual(versioneProssima('CONDIZIONI', sera), {
      versione: '2026-11-13',
      dal: new Date('2026-11-12T23:00:00Z'),
      annunciataAt: null,
    });
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-12T23:00:00Z')), '2026-11-13');
  });

  it('put 2026-11-14 in force at midnight (Rome) of its own day, without an announcement', () => {
    // The owner, 12 November 2026: the sale without VIES and the credit notes — still only his test companies.
    const giorno = new Date('2026-11-13T10:00:00Z');
    assert.equal(versioneVigente('CONDIZIONI', giorno), '2026-11-13');
    assert.deepEqual(versioneProssima('CONDIZIONI', giorno), {
      versione: '2026-11-14',
      dal: new Date('2026-11-13T23:00:00Z'),
      annunciataAt: null,
    });
    assert.equal(versioneVigente('CONDIZIONI', new Date('2026-11-13T23:00:00Z')), '2026-11-14');
    assert.equal(versioneProssima('CONDIZIONI', new Date('2026-11-14T10:00:00Z')), null);
    // 2027-01-12 never comes in: its text is inside 2026-11-12.
    assert.equal(versioneVigente('CONDIZIONI', new Date('2027-06-01T10:00:00Z')), '2026-11-14');
  });

  it('count a company as having accepted with the version in force or a later one', () => {
    // The existing companies were marked with 2026-11-14 the day before it came into force (the owner: active
    // without a signature while the mail is down): they are not asked on the 13th, nor again on the 14th.
    const prima = new Date('2026-11-13T10:00:00Z');
    assert.deepEqual(versioniValide(prima), ['2026-11-13', '2026-11-14']);
    assert.equal(condizioniValide('2026-11-14', prima), true);
    assert.equal(condizioniValide('2026-11-13', prima), true);
    assert.equal(condizioniValide('2026-11-12', prima), false);
    assert.equal(condizioniValide(null, prima), false);
    const dopo = new Date('2026-11-13T23:00:00Z');
    assert.deepEqual(versioniValide(dopo), ['2026-11-14']);
    assert.equal(condizioniValide('2026-11-13', dopo), false);
    assert.equal(condizioniValide('2026-11-14', dopo), true);
    assert.equal(
      condizioniValide('2099-01-01', dopo),
      false,
      'an unknown version is not an acceptance',
    );
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

  it('list exactly the changes of 2026-11-14: VAT without VIES, the credit note, what survives, the reasons', () => {
    const prima = leggiTesto('CONDIZIONI', '2026-11-13');
    const dopo = leggiTesto('CONDIZIONI', '2026-11-14');
    assert.deepEqual(
      modifiche(prima, dopo).map((m) => `${m.numero}:${m.tipo}`),
      [
        '12.1:modificato',
        '12.9:modificato',
        '12.10:modificato',
        '17.4:modificato',
        '25.6:modificato',
      ],
    );
    // No clause of arts. 1341–1342 c.c. is touched: nobody signs the specific approval again because of it.
    assert.deepEqual(dopo.clausoleSpecifiche, prima.clausoleSpecifiche);
    assert.deepEqual(
      dopo.articoli.find((a) => a.numero === '24'),
      prima.articoli.find((a) => a.numero === '24'),
    );
    const dodici = dopo.articoli.find((a) => a.numero === '12')!.paragrafi.join(' ');
    assert.match(dodici, /si aggiunge l'IVA bulgara del 20 %/);
    assert.match(dodici, /soglia di 10\.000 euro dell'art\. 59 quater/);
    assert.match(dodici, /emette una nota di credito sulla fattura del Piano/);
    // The liability cap and its wording stay as they were.
    assert.deepEqual(
      dopo.articoli.find((a) => a.numero === '9'),
      prima.articoli.find((a) => a.numero === '9'),
    );
  });

  it('list exactly the changes of 2026-11-13: the refund, VIES, the roles of the provider, moderation', () => {
    const chiavi = modifiche(
      leggiTesto('CONDIZIONI', '2026-11-12'),
      leggiTesto('CONDIZIONI', '2026-11-13'),
    ).map((m) => `${m.numero}:${m.tipo}`);
    assert.deepEqual(chiavi, [
      '12.9:modificato',
      '12.10:nuovo',
      '15.2:modificato',
      ...Array.from({ length: 11 }, (_, i) => `25.${i + 1}:nuovo`),
    ]);
    // Nothing that needs the specific approval of arts. 1341–1342 c.c. again: art. 24 and its list are the same.
    const prima = leggiTesto('CONDIZIONI', '2026-11-12');
    const dopo = leggiTesto('CONDIZIONI', '2026-11-13');
    assert.deepEqual(dopo.clausoleSpecifiche, prima.clausoleSpecifiche);
    assert.deepEqual(
      dopo.articoli.find((a) => a.numero === '24'),
      prima.articoli.find((a) => a.numero === '24'),
    );
    const moderazione = dopo.articoli.find((a) => a.numero === '25')!;
    assert.match(
      moderazione.paragrafi.join(' '),
      /il responsabile della moderazione di Carbon Stealth VCC/,
    );
    assert.match(moderazione.paragrafi.join(' '), /rilievi\.carbonstealth\.eu\/segnalazioni/);
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
