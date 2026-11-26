// The suppliers' forms are in the public repository only sealed (owner, 26 November 2026 — „Направи всичко
// възможно да няма бъдещи спорове“): AES-256-GCM, the key (MODULI_KEY) only on the server and with the owner.
// A plain copy is read only without the key, for local work, and it is never in git.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it } from 'node:test';
import { apriModulo, sigillaModulo } from '../src/ordini/moduli-sigillo.js';
import { bytesModulo, chiaveModuli, MODULI_TUTTI } from '../src/ordini/moduli.js';

const RILIEVI = join(import.meta.dirname, '..');
const SIGILLATI = join(RILIEVI, 'assets', 'moduli', 'sigillati');
const KEY = 'ab'.repeat(32);
const OTHER = 'cd'.repeat(32);
const PDF = Buffer.from('%PDF-1.7\n% a supplier form\n%%EOF\n');

describe('a sealed supplier form', () => {
  it('opens with its key and its name, byte for byte', () => {
    const sealed = sigillaModulo(PDF, KEY, 'fornitore.pdf');
    assert.deepEqual(apriModulo(sealed, KEY, 'fornitore.pdf'), PDF);
    assert.ok(!sealed.includes(Buffer.from('a supplier form')), 'the text is not readable');
  });

  it('is different every time it is sealed (a fresh nonce)', () => {
    assert.notDeepEqual(sigillaModulo(PDF, KEY, 'a.pdf'), sigillaModulo(PDF, KEY, 'a.pdf'));
  });

  it('does not open with another key, another name, a changed byte or a foreign file', () => {
    const sealed = sigillaModulo(PDF, KEY, 'a.pdf');
    assert.throws(() => apriModulo(sealed, OTHER, 'a.pdf'), /MODULI_KEY/);
    assert.throws(() => apriModulo(sealed, KEY, 'b.pdf'), /MODULI_KEY/);
    const changed = Buffer.from(sealed);
    changed[changed.length - 1]! ^= 1;
    assert.throws(() => apriModulo(changed, KEY, 'a.pdf'), /MODULI_KEY/);
    assert.throws(() => apriModulo(PDF, KEY, 'a.pdf'), /формат/);
    assert.throws(() => apriModulo(Buffer.alloc(0), KEY, 'a.pdf'), /формат/);
  });

  it('refuses a key that is not 32 bytes in hex', () => {
    assert.throws(() => sigillaModulo(PDF, 'abc', 'a.pdf'), /64/);
    assert.throws(
      () => apriModulo(sigillaModulo(PDF, KEY, 'a.pdf'), 'zz'.repeat(32), 'a.pdf'),
      /64/,
    );
  });
});

describe('the forms of the portal', () => {
  it('each one has its sealed file, and there is nothing else in the folder', () => {
    const attesi = MODULI_TUTTI.map((m) => `${m.file}.enc`).sort();
    assert.deepEqual(readdirSync(SIGILLATI).sort(), attesi);
  });

  it('no plain PDF of a form is in git', () => {
    assert.match(readFileSync(join(RILIEVI, '.gitignore'), 'utf8'), /^assets\/moduli\/\*\.pdf$/m);
    assert.match(
      readFileSync(join(RILIEVI, '.dockerignore'), 'utf8'),
      /^assets\/moduli\/\*\.pdf$/m,
    );
    const git = spawnSync('git', ['ls-files', '--', 'assets/moduli'], {
      cwd: RILIEVI,
      encoding: 'utf8',
    });
    // The deploy archive has no .git: there the two ignore files above are the guarantee.
    if (git.status === 0) {
      const pdf = git.stdout.split('\n').filter((f) => f.endsWith('.pdf'));
      assert.deepEqual(pdf, [], 'plain forms tracked in git');
    }
  });

  it('with the key, the sealed file decides — a plain copy left next to it is not read', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rilievi-moduli-'));
    mkdirSync(join(dir, 'sigillati'));
    writeFileSync(join(dir, 'a.pdf'), Buffer.from('%PDF plain, stale'));
    writeFileSync(join(dir, 'sigillati', 'a.pdf.enc'), sigillaModulo(PDF, KEY, 'a.pdf'));
    const base = pathToFileURL(`${dir}/`);
    assert.deepEqual(bytesModulo('a.pdf', KEY, base), PDF);
    assert.deepEqual(bytesModulo('a.pdf', null, base), Buffer.from('%PDF plain, stale'));
  });

  it('without the key and without a plain copy says what is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rilievi-moduli-'));
    mkdirSync(join(dir, 'sigillati'));
    writeFileSync(join(dir, 'sigillati', 'a.pdf.enc'), sigillaModulo(PDF, KEY, 'a.pdf'));
    assert.throws(() => bytesModulo('a.pdf', null, pathToFileURL(`${dir}/`)), /MODULI_KEY/);
  });

  it('reads the key from the environment and refuses a malformed one', () => {
    const prima = process.env.MODULI_KEY;
    try {
      process.env.MODULI_KEY = '';
      assert.equal(chiaveModuli(), null);
      process.env.MODULI_KEY = ` ${KEY} `;
      assert.equal(chiaveModuli(), KEY);
      process.env.MODULI_KEY = 'not-a-key';
      assert.throws(() => chiaveModuli(), /MODULI_KEY/);
    } finally {
      if (prima === undefined) delete process.env.MODULI_KEY;
      else process.env.MODULI_KEY = prima;
    }
  });
});

describe('the containers', () => {
  const compose = readFileSync(join(RILIEVI, 'docker-compose.yml'), 'utf8');
  const servizio = (nome: string) =>
    compose.split(/\n {2}(?=[a-z]+:\n)/).find((s) => s.startsWith(`${nome}:`)) ?? '';

  it('give the key to the portal and not to the photo worker', () => {
    assert.match(servizio('app'), /MODULI_KEY: \$\{MODULI_KEY:-\}/);
    assert.doesNotMatch(servizio('worker'), /MODULI_KEY/);
  });
});
