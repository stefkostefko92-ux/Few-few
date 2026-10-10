import { randomBytes } from 'node:crypto';
import { mkdir, open, rename, rm, type FileHandle } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { AttachmentStore } from './attachments.js';
import {
  FileCryptoError,
  isSealed,
  MAGIC,
  seal,
  unseal,
  type Keyring,
  type SealedSource,
} from './envelope.js';
import { assertKey } from './keys.js';

/**
 * Файловете на диска (§15 „storage privato“): папки 700, файлове 600, атомарен запис (временен
 * файл → fsync → rename), за да не се вижда наполовина записан файл. С ключодържател всеки нов
 * обект е шифрован (envelope.ts); четенето разпознава и старите нешифровани обекти (преходът —
 * `npm run files:encrypt`), освен ако FILES_PLAINTEXT=deny.
 */

export interface StoreCrypto {
  /** null → без шифроване (само FILES_ENCRYPTION=off: тестове/dev) — пише се открит текст. */
  keyring: Keyring | null;
  /** Стар нешифрован обект при включено шифроване: allow — чете се (преход); deny — отказ. */
  plaintext: 'allow' | 'deny';
}

export const PLAINTEXT_ONLY: StoreCrypto = { keyring: null, plaintext: 'allow' };

/** Колко шифротекст се събира преди едно писане (сегментите са по 64 KiB). */
const WRITE_BATCH = 1024 * 1024;

export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}

export async function openOrNull(path: string): Promise<FileHandle | null> {
  try {
    return await open(path, 'r');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** Четене с отместване от отворен файл — само поисканото парче, никога целият файл. */
export function fileSource(handle: FileHandle, size: number): SealedSource {
  return {
    size,
    read: async (position, length) => {
      const buf = Buffer.alloc(Math.max(0, Math.min(length, size - position)));
      let done = 0;
      while (done < buf.length) {
        const { bytesRead } = await handle.read(buf, done, buf.length - done, position + done);
        if (bytesRead === 0) break;
        done += bytesRead;
      }
      return done === buf.length ? buf : buf.subarray(0, done);
    },
  };
}

async function writeAll(handle: FileHandle, batch: Uint8Array[]): Promise<void> {
  const chunk = batch.length === 1 && batch[0] ? batch[0] : Buffer.concat(batch);
  let off = 0;
  while (off < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk, off, chunk.byteLength - off, null);
    off += bytesWritten;
  }
}

/**
 * Частите → временен файл до `target` (wx, 600) → fsync. Връща пътя му; смяната е `commit`.
 * Отказ по средата (пълен диск) — без недописан временен файл.
 */
export async function writeTemp(
  target: string,
  parts: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<string> {
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temp = `${target}.${randomBytes(6).toString('hex')}.tmp`;
  const handle = await open(temp, 'wx', 0o600);
  try {
    try {
      let batch: Uint8Array[] = [];
      let bytes = 0;
      for await (const part of parts) {
        batch.push(part);
        bytes += part.byteLength;
        if (bytes >= WRITE_BATCH) {
          await writeAll(handle, batch);
          batch = [];
          bytes = 0;
        }
      }
      if (batch.length > 0) await writeAll(handle, batch);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return temp;
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

/** Атомарната смяна: rename върху целта (старото съдържание изчезва от папката в същия миг). */
export async function commit(temp: string, target: string): Promise<void> {
  try {
    await rename(temp, target);
  } catch (err) {
    await rm(temp, { force: true });
    throw err;
  }
}

/** Новият обект: шифрован със сегменти (с ключодържател) или открит (FILES_ENCRYPTION=off). */
export function encodeObject(
  key: string,
  bytes: Uint8Array,
  crypto: StoreCrypto,
): Iterable<Uint8Array> {
  return crypto.keyring ? seal(key, bytes, crypto.keyring) : [bytes];
}

/** Общото четене (файл или памет): шифрован → разшифрован; открит → по политиката. */
export async function decodeObject(
  key: string,
  source: SealedSource,
  crypto: StoreCrypto,
): Promise<Buffer> {
  const head = await source.read(0, MAGIC.length);
  if (isSealed(head)) {
    if (!crypto.keyring) throw new FileCryptoError('no_keyring');
    return unseal(key, source, crypto.keyring);
  }
  if (crypto.keyring && crypto.plaintext === 'deny') throw new FileCryptoError('plaintext_refused');
  return source.read(0, source.size);
}

export class FileAttachmentStore implements AttachmentStore {
  readonly root: string;

  /** `crypto` е задължителен: всяко място, което прави хранилище, решава изрично за шифроването. */
  constructor(
    root: string,
    readonly crypto: StoreCrypto,
  ) {
    this.root = resolve(root);
  }

  /** Пътят на обекта; ключът се проверява и след сглобяването (не излиза от хранилището). */
  pathOf(key: string): string {
    assertKey(key);
    const full = resolve(join(this.root, key));
    if (!full.startsWith(this.root + sep)) throw new Error('Ключът излиза от хранилището.');
    return full;
  }

  async put(key: string, bytes: Uint8Array): Promise<void> {
    const target = this.pathOf(key);
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await commit(await writeTemp(target, encodeObject(key, bytes, this.crypto)), target);
  }

  async get(key: string): Promise<Buffer | null> {
    const handle = await openOrNull(this.pathOf(key));
    if (!handle) return null;
    try {
      const { size } = await handle.stat();
      return await decodeObject(key, fileSource(handle, size), this.crypto);
    } finally {
      await handle.close();
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
