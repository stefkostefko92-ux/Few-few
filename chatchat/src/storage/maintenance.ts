import { createHash } from 'node:crypto';
import { readdir, rm, stat } from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { join } from 'node:path';
import {
  FileCryptoError,
  HEADER_BYTES,
  isSealed,
  MAGIC,
  openSealed,
  parseHeader,
  rewrapHeader,
  seal,
  type Keyring,
} from './envelope.js';
import {
  commit,
  fileSource,
  isNotFound,
  openOrNull,
  writeTemp,
  type FileAttachmentStore,
  type StoreCrypto,
} from './file-store.js';

/**
 * Поддръжката на шифрованото хранилище (CLI `files:*`): обхождане, преход от открит текст,
 * ротация на KEK и пълна проверка. Всяка смяна е „нов обект → проверка → смяна“: временен файл
 * до стария, разшифрован докрай и сверен, после rename върху стария (атомарно — старото съдържание
 * изчезва от папката в същия миг). Ако старият е изтрит/сменен междувременно (ретенцията) — не се
 * пипа и не се „възкресява“. Остатъчен прозорец: микросекундите между последния stat и rename.
 */

const READ_CHUNK = 1024 * 1024;

async function names(dir: string, pattern: RegExp, wantDir: boolean): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => (wantDir ? e.isDirectory() : e.isFile()) && pattern.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

/** Всички обекти `<tenant>/<yyyy>/<mm>/<id>`; временни (`*.tmp`) и чужди файлове се прескачат. */
export async function* objectKeys(root: string): AsyncGenerator<string> {
  for (const tenant of await names(root, /^[a-z0-9]{1,40}$/, true)) {
    for (const yyyy of await names(join(root, tenant), /^\d{4}$/, true)) {
      for (const mm of await names(join(root, tenant, yyyy), /^\d{2}$/, true)) {
        const dir = join(root, tenant, yyyy, mm);
        for (const id of await names(dir, /^[a-f0-9]{32}$/, false))
          yield `${tenant}/${yyyy}/${mm}/${id}`;
      }
    }
  }
}

export type ObjectInfo = { state: 'sealed'; kekId: string } | { state: 'plain' };

/** Само заглавката: шифрован ли е и с кой KEK. Повредена заглавка → FileCryptoError('corrupt'). */
export async function inspectObject(path: string): Promise<ObjectInfo | null> {
  const handle = await openOrNull(path);
  if (!handle) return null;
  try {
    const { size } = await handle.stat();
    const head = await fileSource(handle, size).read(0, Math.min(size, HEADER_BYTES));
    if (!isSealed(head)) return { state: 'plain' };
    return { state: 'sealed', kekId: parseHeader(head).kekId };
  } finally {
    await handle.close();
  }
}

export interface ObjectDigest {
  state: 'sealed' | 'plain';
  /** sha256 на ОТКРИТИЯ текст — същото като `Attachment.sha256` / `Document.checksum`. */
  sha256: string;
  kekId: string | null;
}

/** Разшифрова докрай (всеки tag) и хешира открития текст — без целия файл в паметта. */
export async function digestObject(
  key: string,
  path: string,
  crypto: StoreCrypto,
): Promise<ObjectDigest | null> {
  const handle = await openOrNull(path);
  if (!handle) return null;
  try {
    const { size } = await handle.stat();
    const source = fileSource(handle, size);
    const hash = createHash('sha256');
    if (isSealed(await source.read(0, MAGIC.length))) {
      if (!crypto.keyring) throw new FileCryptoError('no_keyring');
      const h = await openSealed(key, source, crypto.keyring, { part: (p) => hash.update(p) });
      return { state: 'sealed', sha256: hash.digest('hex'), kekId: h.kekId };
    }
    for (let pos = 0; pos < size; pos += READ_CHUNK) {
      hash.update(await source.read(pos, Math.min(READ_CHUNK, size - pos)));
    }
    return { state: 'plain', sha256: hash.digest('hex'), kekId: null };
  } finally {
    await handle.close();
  }
}

function sameFile(a: Stats, b: Stats | null): boolean {
  return b !== null && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs;
}

/**
 * Проверява временния обект (разшифрова се докрай и дава очаквания sha256) и го слага на мястото
 * на стария, само ако старият е същият файл (inode, размер, mtime). Изнесена за тестовете.
 */
export async function swapIfUnchanged(
  key: string,
  temp: string,
  path: string,
  before: Stats,
  crypto: StoreCrypto,
  expectedSha256: string,
): Promise<'done' | 'changed'> {
  try {
    const check = await digestObject(key, temp, crypto);
    if (!check || check.state !== 'sealed' || check.sha256 !== expectedSha256) {
      throw new FileCryptoError('corrupt');
    }
    if (!sameFile(before, await stat(path).catch(() => null))) {
      await rm(temp, { force: true });
      return 'changed';
    }
    await commit(temp, path);
    return 'done';
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

function writerOf(store: FileAttachmentStore): Keyring {
  if (!store.crypto.keyring) throw new Error('Шифроването е изключено (FILES_ENCRYPTION=off).');
  return store.crypto.keyring;
}

export type SealOutcome = 'sealed' | 'already' | 'changed' | 'missing';

/** Стар открит обект → шифрован (идемпотентно: шифрованият се прескача). */
export async function sealLegacyObject(
  store: FileAttachmentStore,
  key: string,
): Promise<SealOutcome> {
  const keyring = writerOf(store);
  const path = store.pathOf(key);
  const handle = await openOrNull(path);
  if (!handle) return 'missing';
  let plain: Buffer;
  let before: Stats;
  try {
    before = await handle.stat();
    plain = await fileSource(handle, before.size).read(0, before.size);
  } finally {
    await handle.close();
  }
  if (isSealed(plain)) return 'already';
  const sha256 = createHash('sha256').update(plain).digest('hex');
  const temp = await writeTemp(path, seal(key, plain, keyring));
  const result = await swapIfUnchanged(key, temp, path, before, store.crypto, sha256);
  return result === 'done' ? 'sealed' : 'changed';
}

export type RekeyOutcome = 'rekeyed' | 'current' | 'plain' | 'changed' | 'missing';

/** Ротация: DEK се преопакова с текущия KEK; тялото (шифротекстът) се копира непроменено. */
export async function rekeyObject(store: FileAttachmentStore, key: string): Promise<RekeyOutcome> {
  const keyring = writerOf(store);
  const path = store.pathOf(key);
  const original = await digestObject(key, path, store.crypto);
  if (!original) return 'missing';
  if (original.state === 'plain') return 'plain';
  if (original.kekId === keyring.currentId) return 'current';
  const handle = await openOrNull(path);
  if (!handle) return 'missing';
  let temp: string;
  let before: Stats;
  try {
    before = await handle.stat();
    const source = fileSource(handle, before.size);
    const header = rewrapHeader(parseHeader(await source.read(0, HEADER_BYTES)), keyring, key);
    async function* body(): AsyncGenerator<Buffer> {
      yield header;
      for (let pos = HEADER_BYTES; pos < before.size; pos += READ_CHUNK) {
        yield await source.read(pos, Math.min(READ_CHUNK, before.size - pos));
      }
    }
    temp = await writeTemp(path, body());
  } finally {
    await handle.close();
  }
  const result = await swapIfUnchanged(key, temp, path, before, store.crypto, original.sha256);
  return result === 'done' ? 'rekeyed' : 'changed';
}
