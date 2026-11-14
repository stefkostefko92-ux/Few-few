// The texts of the terms of service and of the rules of use (the owner, 10 November 2026: "Fai tutto in
// modo tale da essere legalmente coperti e minimamente esposti"). A text once published never changes:
// the hash of every version is pinned here, so new words mean a new file with a new version that everyone
// accepts again. The texts say what the code does (terms, company data, the calculation notice).
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { GIORNI_PRIMA_DELL_ELIMINAZIONE } from '../src/aziende/eliminazione.js';
import { COMPANY } from '../src/company.js';
import { translatorFor } from '../src/i18n.js';
import { canonico, sigilloDi } from '../src/legale/sigillo.js';
import {
  clausoleSpecifiche,
  hashTesto,
  leggiTesto,
  testoPiano,
  type TestoLegaleDoc,
} from '../src/legale/testi.js';
import { ANNI_CONSERVAZIONE, VERSIONE } from '../src/legale/versioni.js';

// The seal key comes from the server config, read only when first used.
process.env.PUBLIC_BASE_URL ??= 'https://rilievi.carbonstealth.eu';
process.env.DATABASE_URL ??= 'postgresql://x:y@db:5432/rilievi';
process.env.JWT_SECRET ??= 'a'.repeat(64);
process.env.INTERVENTI_SEAL_KEY ??= 'b'.repeat(64);

const ROOT = join(import.meta.dirname, '..');
const t = translatorFor('it');

/** Every published version and the hash of its exact text. Never edit a line: add one. */
const PUBBLICATI: Record<string, string> = {
  'condizioni-2026-11-10': '01ebcd73a5da55b524c5b51dc622209124fa2adbe89553192aaa8234374622cc',
  'regole-2026-11-10': '8c3ab4b662c2cc9f1d4adbb0514ad433a09b8e1b4d95c362519887ba0d9475e3',
  // Allegato B (Data Act) — never in force: its whole text is inside 2026-11-12 (versioni.ts).
  'condizioni-2027-01-12': '94fdec9fafbe730a38703ec96e49f0750d296b31e2ea9e12a572f4708a772903',
  // Allegato B + the free month, the Plans and read-only at the end (art. 12) — in force on its own day.
  'condizioni-2026-11-12': '1a9bffd58417673ae23a7464fce36bdc940ddcc499bd5eac7b8d02f3a4174dd7',
  // The refund on the same means of payment (12.9), the VAT number in VIES (12.10), 15.2 and art. 25 (reports and
  // moderation, Regulation (EU) 2022/2065) — in force on its own day; the specific approval (art. 24) is untouched.
  'condizioni-2026-11-13': 'e731f2f74680652e4d8ce278b40c948fa6789084a0fea9569d077e8c796b1a0e',
  // Bulgarian VAT when the VAT number is not valid in VIES (12.1, 12.10), the credit note (12.9), 17.4 and the
  // statement of reasons when an account is suspended because of its content (25.6) — in force on its own day.
  'condizioni-2026-11-14': '0cb9938a6035f8443c1546134dae975a72cd0f12abcea917d2ee25a0fc2a3788',
  // The customers registry and the contact person (A.2–A.4, B.7), quotes turned off — read and delete only
  // (2.5, A.9), the notice at the end of the quote (15.3, 15.4), the export as it is (A.11, B.7–B.9), Brevo
  // (S.1). Article 24 untouched. In force only announced (art. 18.1).
  'condizioni-2026-11-15': 'dc43326c4e1953c80b96695ad174e65444f887ec0cf391ada4cad0a0a31fe7ae',
};

const tutto = (doc: TestoLegaleDoc): string => testoPiano(doc);

describe('the published texts', () => {
  it('never change: every file has its pinned hash, and the current versions exist', () => {
    const files = readdirSync(join(ROOT, 'legale')).filter((f) => f.endsWith('.json'));
    assert.deepEqual(
      files.map((f) => f.replace(/\.json$/, '')).sort(),
      Object.keys(PUBBLICATI).sort(),
    );
    for (const file of files) {
      const [tipo, ...data] = file.replace(/\.json$/, '').split('-');
      const doc = leggiTesto(tipo!.toUpperCase() as 'CONDIZIONI' | 'REGOLE', data.join('-'));
      assert.equal(hashTesto(doc), PUBBLICATI[file.replace(/\.json$/, '')], file);
    }
    assert.ok(leggiTesto('CONDIZIONI', VERSIONE.CONDIZIONI));
    assert.ok(leggiTesto('REGOLE', VERSIONE.REGOLE));
  });

  it('formatting the file does not change the hash, a word does', () => {
    const doc = leggiTesto('CONDIZIONI');
    const copia = JSON.parse(JSON.stringify(doc)) as TestoLegaleDoc;
    assert.equal(hashTesto(copia), hashTesto(doc));
    copia.articoli[8]!.paragrafi[2] += ' ';
    assert.notEqual(hashTesto(copia), hashTesto(doc));
  });
});

describe('the terms of service', () => {
  const doc = leggiTesto('CONDIZIONI');
  const testo = tutto(doc);

  it('name the provider with the data of the company register', () => {
    const premessa = doc.premessa.join(' ');
    for (const value of [COMPANY.name, COMPANY.eik, COMPANY.vat, COMPANY.postalCode])
      assert.ok(premessa.includes(value), value);
    for (const key of ['company.street', 'company.city', 'company.legalForm'])
      assert.ok(premessa.includes(t(key)), key);
  });

  it('list each clause of the specific approval in art. 24, and each one exists', () => {
    const art24 = doc.articoli.find((a) => a.numero === '24')!.paragrafi.join(' ');
    assert.match(art24, /1341 e 1342/);
    for (const c of clausoleSpecifiche(doc)) {
      assert.ok(art24.includes(`art. ${c.numero} (${c.descrizione})`), c.numero);
      assert.ok(c.paragrafi.length > 0);
    }
  });

  it('keep what the law does not let anyone exclude, and limit only within the law', () => {
    const art11 = doc.articoli.find((a) => a.numero === '11')!.paragrafi.join(' ');
    assert.match(art11, /dolo o colpa grave/);
    assert.match(art11, /1229/);
    assert.match(art11, /2024\/2853/);
    assert.doesNotMatch(testo, /nessuna responsabilit/i);
    assert.match(testo, /Nei limiti consentiti dalla legge applicabile/);
  });

  it('say what the portal does: the terms of deletion, of backup and of the registers', () => {
    // Since 2026-11-12 (Allegato B): export only for 90 days after the deactivation, then deletion.
    assert.ok(
      testo.includes(
        `per ${GIORNI_PRIMA_DELL_ELIMINAZIONE} giorni possono accedere alla sola pagina di esportazione`,
      ),
    );
    assert.ok(testo.includes(`Allo scadere dei ${GIORNI_PRIMA_DELL_ELIMINAZIONE} giorni`));
    const keep = /KEEP="\$\{RILIEVI_KEEP_DAILY:-(\d+)\}"/.exec(
      readFileSync(join(ROOT, 'deploy', 'backup.sh'), 'utf8'),
    )?.[1];
    assert.ok(testo.includes(`scadono entro i successivi ${keep} giorni`), `backups ${keep}`);
    assert.equal(ANNI_CONSERVAZIONE, 10);
    assert.match(testo, /dieci anni dalla generazione del Documento/);
    assert.match(testo, /codice monouso/);
  });

  it('have the processing agreement of art. 28 GDPR with all its points (a)-(h)', () => {
    const dpa = doc.allegati.find((a) => a.id === 'dpa')!;
    const titoli = dpa.articoli.map((a) => a.titolo).join(' ');
    for (const lettera of [
      'lett. a',
      'lett. b',
      'lett. c',
      'lett. d',
      'lett. e',
      'lett. f',
      'lett. g',
      'lett. h',
    ])
      assert.ok(titoli.includes(lettera), lettera);
  });
});

describe('the sub-processors', () => {
  it('are the same in the terms (Appendix 2) and in the privacy policy', () => {
    const appendice = leggiTesto('CONDIZIONI')
      .allegati.find((a) => a.id === 'sub')!
      .articoli.flatMap((a) => a.paragrafi)
      .join(' ');
    for (const nome of ['netcup GmbH', 'Brevo']) {
      assert.ok(appendice.includes(nome), `terms: ${nome}`);
      assert.ok(
        [t('privacy.recipients.hosting'), t('privacy.recipients.mail')].join(' ').includes(nome),
        `privacy: ${nome}`,
      );
    }
    assert.doesNotMatch(appendice, /Hetzner/);
  });
});

describe('the rules of use', () => {
  it('carry the calculation notice word for word: a new notice means new rules to accept', () => {
    assert.ok(tutto(leggiTesto('REGOLE')).includes(t('calcoli.avvertenza.testo')));
  });
});

describe('the seal of the evidence', () => {
  it('reads the same whatever the order of the keys, and changes with any field', () => {
    assert.equal(
      canonico({ b: 1, a: { d: [2, { y: 1, x: 0 }], c: null } }),
      canonico({ a: { c: null, d: [2, { x: 0, y: 1 }] }, b: 1 }),
    );
    const campi = { at: new Date('2026-11-10T10:00:00Z'), dati: { vn: 1.6 }, userNome: 'Mario' };
    const elenco = ['at', 'dati', 'userNome', 'ip'];
    const sigillo = sigilloDi(campi, elenco);
    assert.equal(sigilloDi({ ...campi, ip: null }, elenco), sigillo, 'missing is null');
    assert.notEqual(sigilloDi({ ...campi, dati: { vn: 1.7 } }, elenco), sigillo);
  });
});
