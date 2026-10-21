// The texts of the earlier versions are what companies accepted: their SHA-256 is kept with every acceptance
// (TERMS_ACCEPTED), so not one byte of them may change. Pinned here, file by file, with the languages the page of each
// version links as records (src/lib/legal-archive.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TERMS_VERSION } from '../legal';
import { archivedLanguages } from '../legal-archive';

const ARCHIVE = join(process.cwd(), 'legal', 'terms');

/** Every file of every earlier version, as accepted (sha256sum of the files at commit 60e01b91b, 2026-10-14; version 5 —
 *  Italian only — when version 6 came into force, round 49, 2026-10-21). */
const PINNED: Record<string, string> = {
  '2026-10-02/it.txt': '652877268b2041f584805ed3962d8e345a04da81cffa4709edddd7485869b912',
  '2026-10-02/en.txt': 'c1a46b29e920f24cfdd48c8d93124555a92998afbd7e4fcaaee2f48453186817',
  '2026-10-02/bg.txt': 'f0ff1888b80a22eb52795152778afef6e6f304e675b6914a5a502ce361403c91',
  '2/it.txt': 'c3c0f3efd713346f4c43bc42bafac3efdfd5bd0656849000e791cc747f7b7652',
  '2/en.txt': '317639e14fa8b674cdcbccbfe7263bc25379239c9a3c2cf1fc5003a2bb9a7f4f',
  '2/bg.txt': 'f77784fb77df4c9c7dbc5ca1a4423e7b30cafc22c07e2b8ec5f09b57d2ff4956',
  '3/it.txt': '6a9d2efbe575949b0c443dc4fef60b8dde82524d44e7872eb6b90632143102d2',
  '3/en.txt': '55c116fa40b183e17b09014083c529ba80f220349dda0f175065d74dffe6b878',
  '3/bg.txt': 'b16e8f039667dfda0dd3361cc2d7eda83da4bd7ba9b28fb3df5600394f7c52a5',
  '4/it.txt': 'bd05f71572c41c16307a9ab9e54d5e572c74f3989e8e15ad77c2105981651696',
  '4/en.txt': '865c71e36f8d08c80f0b2efecf57f0d1b20ffd4989f6dfb6bac6be8cdda12a45',
  '4/bg.txt': 'b6ab31300f4f11a7287148a6d44d77531bb908e99f304f61ebfa7cb56f739f3a',
  '5/it.txt': 'd057d88b094d26ac76810d884382318bf6a2034968ccb7cd266f1d988c18047e',
};

test('le versioni precedenti restano parola per parola: ogni file con la sua impronta, nessuno in più', () => {
  const files = readdirSync(ARCHIVE).filter((v) => v !== TERMS_VERSION).flatMap((v) => readdirSync(join(ARCHIVE, v)).map((f) => `${v}/${f}`));
  assert.deepEqual(files.sort(), Object.keys(PINNED).sort(), 'a version in force becomes earlier only with its hashes pinned here');
  for (const [f, sha] of Object.entries(PINNED)) {
    assert.equal(createHash('sha256').update(readFileSync(join(ARCHIVE, f))).digest('hex'), sha, `${f} changed: a kept text never changes`);
  }
});

test('i testi in inglese e in bulgaro: solo delle versioni che li avevano, mai di quella in vigore, mai fuori dall’archivio', () => {
  for (const v of ['2026-10-02', '2', '3', '4']) assert.deepEqual(archivedLanguages(v).map((a) => a.lang), ['en', 'bg'], v);
  // version 5 was published in Italian only: no other language to link
  for (const v of [TERMS_VERSION, '5', '1', '7', '../4', '4/..', '', 'constructor']) assert.deepEqual(archivedLanguages(v), [], `«${v}»`);
  for (const a of archivedLanguages('4')) assert.ok(a.file.startsWith(join(ARCHIVE, '4')) && a.file.endsWith(`${a.lang}.txt`), a.file);
});
