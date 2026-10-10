import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { loadConfig, loadFilesConfig } from '../src/config.js';
import { MemoryAttachmentStore, newObjectKey } from '../src/storage/attachments.js';
import { FileCryptoError, isSealed, Keyring, seal } from '../src/storage/envelope.js';
import { storeCryptoFrom } from '../src/storage/factory.js';
import { FileAttachmentStore, PLAINTEXT_ONLY, writeTemp } from '../src/storage/file-store.js';
import {
  inspectObject,
  objectKeys,
  rekeyObject,
  sealLegacyObject,
  swapIfUnchanged,
} from '../src/storage/maintenance.js';
import { sweep, sweepProblems } from '../src/storage/sweep.js';

/**
 * Шифрованото хранилище (NFR-03): нов файл — шифрован на диска; стар нешифрован — чете се по
 * политиката; CLI прогоните `files:*` (преход, ротация, проверка) са идемпотентни и не губят файл.
 */

const kek = (fill: number) => Buffer.alloc(32, fill);
const crypto = (r: Keyring, plaintext: 'allow' | 'deny' = 'allow') => ({ keyring: r, plaintext });
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

let root = '';
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'chatchat-files-'));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

async function fresh(name: string): Promise<string> {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Стар нешифрован файл, записан „отпреди шифроването“. */
async function legacy(dir: string, key: string, bytes: Buffer): Promise<void> {
  await mkdir(dirname(join(dir, key)), { recursive: true });
  await writeFile(join(dir, key), bytes, { mode: 0o600 });
}

describe('файлово хранилище с ключодържател', () => {
  test('нов файл: на диска е шифротекст (600), без открития текст; get връща оригинала', async () => {
    const dir = await fresh('put');
    const store = new FileAttachmentStore(dir, crypto(new Keyring(kek(1))));
    const key = newObjectKey('ckt1');
    const plain = Buffer.from('10:01 E37 encoder — tecnico mario.rossi');
    await store.put(key, plain);
    const raw = await readFile(join(dir, key));
    assert.ok(isSealed(raw));
    assert.equal(raw.includes(Buffer.from('E37 encoder')), false);
    assert.equal((await stat(join(dir, key))).mode & 0o777, 0o600);
    assert.deepEqual(await store.get(key), plain);
    const siblings = await readdir(dirname(join(dir, key)));
    assert.deepEqual(
      siblings.filter((f) => f.endsWith('.tmp')),
      [],
    );
  });

  test('стар нешифрован файл: allow → чете се; deny → отказ; без ключ шифрован → отказ', async () => {
    const dir = await fresh('legacy');
    const key = newObjectKey('ckt1');
    await legacy(dir, key, Buffer.from('vecchio log'));
    const r = new Keyring(kek(1));
    assert.equal(
      (await new FileAttachmentStore(dir, crypto(r)).get(key))?.toString(),
      'vecchio log',
    );
    await assert.rejects(
      new FileAttachmentStore(dir, crypto(r, 'deny')).get(key),
      (e: unknown) => e instanceof FileCryptoError && e.reason === 'plaintext_refused',
    );
    const sealedKey = newObjectKey('ckt1');
    await new FileAttachmentStore(dir, crypto(r)).put(sealedKey, Buffer.from('x'));
    await assert.rejects(
      new FileAttachmentStore(dir, PLAINTEXT_ONLY).get(sealedKey),
      (e: unknown) => e instanceof FileCryptoError && e.reason === 'no_keyring',
    );
  });

  test('в паметта — същият формат (тестовете на потока минават през шифроване)', async () => {
    const store = new MemoryAttachmentStore(crypto(new Keyring(kek(3)), 'deny'));
    const key = newObjectKey('ckt1');
    await store.put(key, Buffer.from('ciao'));
    assert.ok(isSealed(store.files.get(key) ?? Buffer.alloc(0)));
    assert.equal((await store.get(key))?.toString(), 'ciao');
  });
});

describe('поддръжка: обхождане, преход, ротация', () => {
  test('обхождането дава само ключове на обекти — временни и чужди файлове не', async () => {
    const dir = await fresh('walk');
    const key = newObjectKey('ckt1');
    await legacy(dir, key, Buffer.from('a'));
    await writeFile(join(dir, `${key}.abcdef.tmp`), 'tmp');
    await writeFile(join(dir, 'README'), 'x');
    await mkdir(join(dir, 'BAD', '2026', '01'), { recursive: true });
    const keys: string[] = [];
    for await (const k of objectKeys(dir)) keys.push(k);
    assert.deepEqual(keys, [key]);
    assert.deepEqual(
      await (async () => {
        const none: string[] = [];
        for await (const k of objectKeys(join(dir, 'липсва'))) none.push(k);
        return none;
      })(),
      [],
    );
  });

  test('files:encrypt — старите се шифроват, съдържанието е същото; втори прогон не пипа нищо', async () => {
    const dir = await fresh('encrypt');
    const store = new FileAttachmentStore(dir, crypto(new Keyring(kek(1))));
    const plain = [randomBytes(200_000), Buffer.from('log E37')];
    const keys = [newObjectKey('ckt1'), newObjectKey('ckt2')];
    for (const [i, k] of keys.entries()) await legacy(dir, k, plain[i] ?? Buffer.alloc(0));
    const fresh1 = newObjectKey('ckt1');
    await store.put(fresh1, Buffer.from('nuovo'));

    const first = await sweep(store, 'encrypt');
    assert.deepEqual(
      [first.objects, first.converted, first.current, first.plain, first.failed],
      [3, 2, 3, 0, 0],
    );
    for (const [i, k] of keys.entries()) {
      assert.ok(isSealed(await readFile(join(dir, k))));
      assert.equal((await stat(join(dir, k))).mode & 0o777, 0o600);
      assert.deepEqual(await store.get(k), plain[i]);
    }
    const again = await sweep(store, 'encrypt');
    assert.equal(again.converted, 0);
    assert.equal(again.current, 3);
    assert.deepEqual(sweepProblems(again, 'encrypt', 'allow'), []);
    assert.equal(await sealLegacyObject(store, newObjectKey('ckt9')), 'missing');
  });

  test('смяната е само ако старият е непокътнат: изтрит междувременно → не се възкресява', async () => {
    const dir = await fresh('race');
    const store = new FileAttachmentStore(dir, crypto(new Keyring(kek(1))));
    const key = newObjectKey('ckt1');
    await legacy(dir, key, Buffer.from('da cancellare'));
    const before = await stat(join(dir, key));
    const temp = await writeTemp(join(dir, key), [Buffer.from('ignored')]);
    await rm(join(dir, key));
    // Временният не е шифрован → проверката отказва, преди да стигне до смяната.
    await assert.rejects(swapIfUnchanged(key, temp, join(dir, key), before, store.crypto, 'x'));
    const ring = store.crypto.keyring;
    assert.ok(ring);
    const sealedTemp = await writeTemp(
      join(dir, key),
      seal(key, Buffer.from('da cancellare'), ring),
    );
    const out = await swapIfUnchanged(
      key,
      sealedTemp,
      join(dir, key),
      before,
      store.crypto,
      sha(Buffer.from('da cancellare')),
    );
    assert.equal(out, 'changed');
    assert.equal(await inspectObject(join(dir, key)), null, 'изтритият остава изтрит');
    assert.deepEqual(await readdir(dirname(join(dir, key))), [], 'без временни файлове');
  });

  test('files:rekey — DEK се преопакова с новия KEK; после старият не трябва', async () => {
    const dir = await fresh('rekey');
    const oldStore = new FileAttachmentStore(dir, crypto(new Keyring(kek(1))));
    const keys = [newObjectKey('ckt1'), newObjectKey('ckt1')];
    const plain = [randomBytes(70_000), Buffer.from('breve')];
    for (const [i, k] of keys.entries()) await oldStore.put(k, plain[i] ?? Buffer.alloc(0));
    const plainKey = newObjectKey('ckt1');
    await legacy(dir, plainKey, Buffer.from('ancora in chiaro'));

    const rotating = new FileAttachmentStore(dir, crypto(new Keyring(kek(2), [kek(1)])));
    const status = await sweep(rotating, 'status');
    assert.deepEqual([status.current, status.previous, status.plain], [0, 2, 1]);
    const r = await sweep(rotating, 'rekey');
    assert.deepEqual([r.converted, r.current, r.previous, r.plain, r.failed], [2, 2, 0, 1, 0]);
    assert.equal(await rekeyObject(rotating, keys[0] ?? ''), 'current', 'идемпотентно');

    const onlyNew = new FileAttachmentStore(dir, crypto(new Keyring(kek(2))));
    for (const [i, k] of keys.entries()) assert.deepEqual(await onlyNew.get(k), plain[i]);
    const verify = await sweep(onlyNew, 'verify');
    assert.deepEqual([verify.current, verify.plain, verify.failed], [2, 1, 0]);
  });

  test('files:verify — разшифрова всичко; срещу базата хваща разлика, липсващ и непознат', async () => {
    const dir = await fresh('verify');
    const store = new FileAttachmentStore(dir, crypto(new Keyring(kek(1))));
    const [a, b, c] = [newObjectKey('ckt1'), newObjectKey('ckt1'), newObjectKey('ckt1')];
    await store.put(a, Buffer.from('uno'));
    await store.put(b, Buffer.from('due'));
    const rows = [
      { objectKey: a, sha256: sha(Buffer.from('uno')), scanStatus: 'CLEAN' },
      { objectKey: b, sha256: sha(Buffer.from('altro')), scanStatus: 'CLEAN' },
      { objectKey: c, sha256: sha(Buffer.from('tre')), scanStatus: 'CLEAN' },
      { objectKey: newObjectKey('ckt1'), sha256: 'x', scanStatus: 'INFECTED' },
    ];
    const r = await sweep(store, 'verify', rows);
    assert.deepEqual([r.current, r.mismatched, r.missing, r.orphans, r.failed], [2, 1, 1, 0, 0]);
    assert.equal(sweepProblems(r, 'verify', 'allow').length, 2);

    // Чужд KEK (напр. загубен и сменен) → нищо не се разшифрова — пробата за възстановяване пада.
    const wrong = await sweep(new FileAttachmentStore(dir, crypto(new Keyring(kek(9)))), 'verify');
    assert.equal(wrong.failed, 2);
    assert.match(wrong.samples.join(' '), /unknown_key/);
    // Повреден шифротекст → corrupt.
    const raw = await readFile(join(dir, a));
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 1;
    await writeFile(join(dir, a), raw);
    const broken = await sweep(store, 'verify');
    assert.equal(broken.failed, 1);
    assert.match(broken.samples.join(' '), /corrupt/);
  });
});

describe('конфигурация на шифроването (fail-closed)', () => {
  const base = {
    PUBLIC_BASE_URL: 'https://chatchat.test',
    DATABASE_URL: 'postgresql://x@127.0.0.1/x',
    SESSION_PEPPER: 'p'.repeat(40),
    MFA_ENC_KEY: kek(7).toString('base64'),
    ATTACHMENTS_DIR: '/srv/chatchat/files',
    ATTACHMENT_URL_KEY: 'k'.repeat(32),
  };

  test('хранилище без FILES_KEK, с невалиден или с ключа на MFA → процесът не тръгва', () => {
    assert.throws(() => loadConfig(base), /FILES_KEK/);
    assert.throws(() => loadConfig({ ...base, FILES_KEK: 'corto' }), /FILES_KEK/);
    assert.throws(() => loadConfig({ ...base, FILES_KEK: base.MFA_ENC_KEY }), /MFA_ENC_KEY/);
    assert.throws(
      () =>
        loadConfig({ ...base, FILES_KEK: kek(1).toString('base64'), FILES_KEK_PREVIOUS: 'x,y' }),
      /FILES_KEK_PREVIOUS/,
    );
    const ok = loadConfig({
      ...base,
      FILES_KEK: kek(1).toString('base64'),
      FILES_KEK_PREVIOUS: ` ${kek(2).toString('base64')} , `,
    });
    const c = storeCryptoFrom(ok);
    assert.equal(c.keyring?.size, 2);
    assert.equal(c.plaintext, 'allow');
  });

  test('FILES_ENCRYPTION=off — само извън продукция; празен низ = „не е зададено“', () => {
    assert.throws(() => loadConfig({ ...base, FILES_ENCRYPTION: 'off' }), /FILES_ENCRYPTION/);
    const dev = loadConfig({ ...base, FILES_ENCRYPTION: 'off', NODE_ENV: 'development' });
    assert.equal(storeCryptoFrom(dev).keyring, null);
    assert.throws(() => loadConfig({ ...base, FILES_ENCRYPTION: '' }), /FILES_KEK/);
  });

  test('без хранилище ключ не трябва; CLI-тата четат само своите настройки', () => {
    const { ATTACHMENTS_DIR: _dir, ...noDir } = base;
    assert.doesNotThrow(() => loadConfig(noDir));
    const files = loadFilesConfig({
      ATTACHMENTS_DIR: '/restore',
      FILES_KEK: kek(1).toString('base64'),
      FILES_PLAINTEXT: 'deny',
    });
    assert.equal(storeCryptoFrom(files).plaintext, 'deny');
    assert.throws(() => loadFilesConfig({ ATTACHMENTS_DIR: '/restore' }), /FILES_KEK/);
  });
});
