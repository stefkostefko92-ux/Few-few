// The version of the RT engine (RT plan §4.7, pattern of ambito-version.test.ts): an issued relazione tecnica di modifica
// keeps RT_ENGINE_VERSION and its hash covers it, so a change of what the RT derives — its registries (KR, VOCI_RT,
// OBBLIGHI_RT, the sections and their triggers, the documents, the regimes, the RT's own points on site and the names of
// the missing fields) or the results of its golden fixtures, which move with any change of the RT's checks or of a shared
// function it reads — must come with a new version. The key below is the SHA-256 of all of it, pinned with the version
// it was taken at: the test fails when it changes while the version is still the pinned one. After an intended change:
// bump RT_ENGINE_VERSION (semver), regenerate the golden (scripts/rt-golden-export.ts), pin the new key and version
// here. The document builder (S6) adds the docSha of the four fixtures to the key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canon } from '@/calc/snapshot';
import { CAMPI, SITO_RT } from '../rt/componenti/punti';
import { DOCUMENTI } from '../rt/documenti';
import { KR, OBBLIGHI_RT } from '../rt/norme';
import { VOCI_RT } from '../rt/norme-voci';
import { REGIMI } from '../rt/regimi';
import { CASI_TESTO, SEZIONI, SEZIONI_PER_CASO } from '../rt/sezioni';
import { RT_ENGINE_VERSION } from '../rt/version';

/** The key and the version it was pinned at (round 49, S3: the first RT engine; re-pinned at 1.0.0 in the fix step after
 *  the norm review and after the text of guide.sospensione — never released, no RT issued in production). */
const PINNED = { sha256: '41b0a4368398962ae958532f977bebcf38a154187522023f9aae8fd00767a37c', version: '1.0.0' };

const golden = JSON.parse(readFileSync(new URL('./fixtures/rt/golden.json', import.meta.url), 'utf8')) as { engine: string; cases: { nome: string; resultsSha: string }[] };

/** The RT's points on site, the ones by part of UNI 10411 under both. */
const sito = (): unknown => Object.fromEntries(Object.entries(SITO_RT).map(([k, v]) => [k, typeof v === 'function' ? [v('10411-1'), v('10411-11')] : v]));

const rtKey = (): string => createHash('sha256').update(JSON.stringify(canon({
  KR, VOCI_RT, OBBLIGHI_RT, SEZIONI, SEZIONI_PER_CASO, CASI_TESTO, DOCUMENTI, REGIMI, SITO_RT: sito(), CAMPI,
  golden: golden.cases.map((c) => [c.nome, c.resultsSha]),
}))).digest('hex');

test('rt-version: il motore della relazione tecnica di modifica non cambia senza la sua versione', () => {
  const sha = rtKey();
  if (process.env.RT_VERSION_PRINT) process.stdout.write(`${sha}\n`);
  if (sha === PINNED.sha256) return;
  assert.notEqual(RT_ENGINE_VERSION, PINNED.version, `motore RT cambiato (${sha}) con la versione ancora ${PINNED.version}: alzare RT_ENGINE_VERSION, poi fissare la nuova chiave`);
});

test('rt-version: la chiave e il golden sono della versione in vigore', () => {
  assert.equal(RT_ENGINE_VERSION, PINNED.version);
  assert.equal(golden.engine, RT_ENGINE_VERSION, 'golden rigenerato con un’altra versione');
});
