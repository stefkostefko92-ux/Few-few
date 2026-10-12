import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Keyring } from './keyring.js';

/**
 * Шифроване на файловете в покой (NFR-03, §15.1 „cifratura at-rest dei dati e backup“) —
 * envelope encryption: всеки обект има свой случаен ключ (DEK, AES-256-GCM), а той е опакован
 * с главния ключ (KEK, `FILES_KEK`). Ротацията на KEK преопакова само DEK в заглавката — тялото
 * не се пипа. Тялото е на сегменти (по подразбиране 64 KiB, всеки със свой tag), за да не се
 * държат два пъти 50 MB в паметта и за бъдещо стриймване.
 *
 * Формат v1 (всички числа big-endian):
 *   0   8  магия      89 43 43 45 4E 43 0D 0A („\x89CCENC\r\n“ — 0x89 не е начало на UTF-8 текст,
 *                     различава се от PNG на втория байт; така стар нешифрован файл не се бърка)
 *   8   1  версия     1
 *   9   1  алгоритъм  1 = AES-256-GCM на сегменти
 *  10   4  размер на сегмента в байтове
 *  14   8  размер на открития текст
 *  22   7  префикс на nonce (случаен)
 *  29   8  id на KEK (HMAC-SHA256(KEK, константа)[0..8] — отпечатък, не тайна)
 *  37  12  IV на опаковката
 *  49  32  опакованият DEK
 *  81  16  tag на опаковката
 *  97  …   сегменти: шифротекст + 16 байта tag
 *
 * Байтовете 0…28 („ядрото“) са AAD на всеки сегмент; опаковката е удостоверена с ядрото, id на
 * KEK и ключа на обекта — файл, преместен под чужд ключ (друг клиент), не се отваря. Nonce на
 * сегмент i = префикс ‖ i (4 байта) ‖ 1 за последния, иначе 0 — отрязване, размяна или
 * удължаване на сегментите се открива.
 */

export const MAGIC = Buffer.from([0x89, 0x43, 0x43, 0x45, 0x4e, 0x43, 0x0d, 0x0a]);
const VERSION = 1;
const ALG_AES256GCM_SEGMENTS = 1;
export const SEGMENT_BYTES = 64 * 1024;
const MIN_SEGMENT = 4 * 1024;
const MAX_SEGMENT = 8 * 1024 * 1024;
/** Таван на открития текст: далеч над най-големия приеман файл (50 MB), пази от абсурдна заглавка. */
export const MAX_PLAIN_BYTES = 1024 * 1024 * 1024;

const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ID_BYTES = 8;
const PREFIX_BYTES = 7;
const CORE_BYTES = 29;
export const HEADER_BYTES = CORE_BYTES + ID_BYTES + IV_BYTES + KEY_BYTES + TAG_BYTES;

export type FileCryptoFailure =
  /** Обектът е шифрован с KEK, който не е в ключодържателя (липсва в FILES_KEK_PREVIOUS?). */
  | 'unknown_key'
  /** Заглавка, размер или tag не съвпадат — повреден, отрязан или подправен обект. */
  | 'corrupt'
  /** Шифрован обект, а криптирането е изключено (FILES_ENCRYPTION=off) — няма с какво. */
  | 'no_keyring'
  /** Нешифрован обект, а FILES_PLAINTEXT=deny (преходът е завършен). */
  | 'plaintext_refused';

/** Без ключ на обекта и без съдържание в съобщението — само причината (за лога и CLI-то). */
export class FileCryptoError extends Error {
  constructor(readonly reason: FileCryptoFailure) {
    super(`файлът не може да се прочете: ${reason}`);
    this.name = 'FileCryptoError';
  }
}

export { Keyring, kekId } from './keyring.js';

export function isSealed(head: Uint8Array): boolean {
  return head.byteLength >= MAGIC.length && MAGIC.equals(head.subarray(0, MAGIC.length));
}

export function segmentCount(plainBytes: number, segmentBytes: number): number {
  return plainBytes === 0 ? 1 : Math.ceil(plainBytes / segmentBytes);
}

/** Точният размер на шифрования обект — по-къс или по-дълъг файл е повреден. */
export function sealedBytes(plainBytes: number, segmentBytes = SEGMENT_BYTES): number {
  return HEADER_BYTES + plainBytes + segmentCount(plainBytes, segmentBytes) * TAG_BYTES;
}

function nonce(prefix: Buffer, index: number, last: boolean): Buffer {
  const n = Buffer.alloc(IV_BYTES);
  prefix.copy(n, 0);
  n.writeUInt32BE(index, PREFIX_BYTES);
  n[IV_BYTES - 1] = last ? 1 : 0;
  return n;
}

function wrapAad(core: Buffer, id: Buffer, objectKey: string): Buffer {
  return Buffer.concat([core, id, Buffer.from(objectKey, 'utf8')]);
}

/** id ‖ IV ‖ опакован DEK ‖ tag — опаковка с текущия KEK. */
function wrapDek(dek: Buffer, keyring: Keyring, core: Buffer, objectKey: string): Buffer {
  const { id, key } = keyring.writer();
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv('aes-256-gcm', key, iv);
  c.setAAD(wrapAad(core, id, objectKey));
  const wrapped = Buffer.concat([c.update(dek), c.final()]);
  return Buffer.concat([id, iv, wrapped, c.getAuthTag()]);
}

export interface SealedHeader {
  core: Buffer;
  segmentBytes: number;
  plainBytes: number;
  prefix: Buffer;
  kekId: string;
  raw: Buffer;
}

/** Разчита заглавката. Числата още не са удостоверени — вярват се едва след `unwrap`. */
export function parseHeader(raw: Buffer): SealedHeader {
  if (raw.length < HEADER_BYTES || !isSealed(raw)) throw new FileCryptoError('corrupt');
  if (raw[8] !== VERSION || raw[9] !== ALG_AES256GCM_SEGMENTS) throw new FileCryptoError('corrupt');
  const segmentBytes = raw.readUInt32BE(10);
  const plain = raw.readBigUInt64BE(14);
  if (segmentBytes < MIN_SEGMENT || segmentBytes > MAX_SEGMENT || plain > BigInt(MAX_PLAIN_BYTES)) {
    throw new FileCryptoError('corrupt');
  }
  return {
    core: Buffer.from(raw.subarray(0, CORE_BYTES)),
    segmentBytes,
    plainBytes: Number(plain),
    prefix: Buffer.from(raw.subarray(22, CORE_BYTES)),
    kekId: raw.subarray(CORE_BYTES, CORE_BYTES + ID_BYTES).toString('hex'),
    raw: Buffer.from(raw.subarray(0, HEADER_BYTES)),
  };
}

/** DEK от заглавката; грешен KEK, чужд ключ на обекта или подправено ядро → грешка. */
export function unwrapDek(h: SealedHeader, keyring: Keyring, objectKey: string): Buffer {
  const kek = keyring.find(h.kekId);
  if (!kek) throw new FileCryptoError('unknown_key');
  let at = CORE_BYTES;
  const id = h.raw.subarray(at, (at += ID_BYTES));
  const iv = h.raw.subarray(at, (at += IV_BYTES));
  const wrapped = h.raw.subarray(at, (at += KEY_BYTES));
  const tag = h.raw.subarray(at, (at += TAG_BYTES));
  try {
    const d = createDecipheriv('aes-256-gcm', kek, iv);
    d.setAAD(wrapAad(h.core, id, objectKey));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(wrapped), d.final()]);
  } catch {
    throw new FileCryptoError('corrupt');
  }
}

/** Нова заглавка със същото ядро и DEK, опакован с текущия KEK (ротация — тялото не се сменя). */
export function rewrapHeader(h: SealedHeader, keyring: Keyring, objectKey: string): Buffer {
  const dek = unwrapDek(h, keyring, objectKey);
  try {
    return Buffer.concat([h.core, wrapDek(dek, keyring, h.core, objectKey)]);
  } finally {
    dek.fill(0);
  }
}

/**
 * Шифрова открития текст: първо заглавката, после сегментите един по един (консуматорът ги
 * пише направо във файла — шифротекстът никога не е цял в паметта).
 */
export function* seal(
  objectKey: string,
  plain: Uint8Array,
  keyring: Keyring,
  segmentBytes = SEGMENT_BYTES,
): Generator<Buffer> {
  if (plain.byteLength > MAX_PLAIN_BYTES) throw new Error('Файлът е над тавана за шифроване.');
  if (segmentBytes < MIN_SEGMENT || segmentBytes > MAX_SEGMENT)
    throw new Error('Сегмент извън рамките.');
  const dek = randomBytes(KEY_BYTES);
  try {
    const prefix = randomBytes(PREFIX_BYTES);
    const core = Buffer.alloc(CORE_BYTES);
    MAGIC.copy(core, 0);
    core[8] = VERSION;
    core[9] = ALG_AES256GCM_SEGMENTS;
    core.writeUInt32BE(segmentBytes, 10);
    core.writeBigUInt64BE(BigInt(plain.byteLength), 14);
    prefix.copy(core, 22);
    yield Buffer.concat([core, wrapDek(dek, keyring, core, objectKey)]);
    const n = segmentCount(plain.byteLength, segmentBytes);
    for (let i = 0; i < n; i++) {
      const c = createCipheriv('aes-256-gcm', dek, nonce(prefix, i, i === n - 1));
      c.setAAD(core);
      const part = plain.subarray(
        i * segmentBytes,
        Math.min((i + 1) * segmentBytes, plain.byteLength),
      );
      yield Buffer.concat([c.update(part), c.final(), c.getAuthTag()]);
    }
  } finally {
    dek.fill(0);
  }
}

/** Четене с отместване — файл (FileHandle) или буфер в паметта. */
export interface SealedSource {
  size: number;
  read(position: number, length: number): Promise<Buffer>;
}

/** Копие при всяко четене: извикващият не може да промени „съхраненото“. */
export function bufferSource(buf: Buffer): SealedSource {
  return { size: buf.length, read: async (pos, len) => Buffer.from(buf.subarray(pos, pos + len)) };
}

export interface PlainSink {
  /** Удостоверената заглавка — преди първия сегмент (тук размерът вече е проверен). */
  header?(h: SealedHeader): void;
  /** Всеки проверен (по tag) къс открит текст, по ред. */
  part(part: Buffer, offset: number): void;
}

/**
 * Разшифрова сегмент по сегмент към `sink`. Повреда навсякъде → FileCryptoError('corrupt');
 * извикващият изхвърля частичния резултат — нищо не се връща наполовина като успех.
 */
export async function openSealed(
  objectKey: string,
  source: SealedSource,
  keyring: Keyring,
  sink: PlainSink,
): Promise<SealedHeader> {
  if (source.size < HEADER_BYTES) throw new FileCryptoError('corrupt');
  const h = parseHeader(await source.read(0, HEADER_BYTES));
  const dek = unwrapDek(h, keyring, objectKey);
  try {
    if (source.size !== sealedBytes(h.plainBytes, h.segmentBytes))
      throw new FileCryptoError('corrupt');
    sink.header?.(h);
    const n = segmentCount(h.plainBytes, h.segmentBytes);
    let pos = HEADER_BYTES;
    for (let i = 0; i < n; i++) {
      const len = Math.min(h.segmentBytes, h.plainBytes - i * h.segmentBytes);
      const blob = await source.read(pos, len + TAG_BYTES);
      if (blob.length !== len + TAG_BYTES) throw new FileCryptoError('corrupt');
      pos += blob.length;
      let part: Buffer;
      try {
        const d = createDecipheriv('aes-256-gcm', dek, nonce(h.prefix, i, i === n - 1));
        d.setAAD(h.core);
        d.setAuthTag(blob.subarray(len));
        part = Buffer.concat([d.update(blob.subarray(0, len)), d.final()]);
      } catch {
        throw new FileCryptoError('corrupt');
      }
      sink.part(part, i * h.segmentBytes);
    }
    return h;
  } finally {
    dek.fill(0);
  }
}

/**
 * Целият открит текст в един буфер. Заделя се чак след удостоверената заглавка и проверения
 * размер; сегментите се пишат направо в него — в паметта стои само откритият текст + 1 сегмент.
 */
export async function unseal(
  objectKey: string,
  source: SealedSource,
  keyring: Keyring,
): Promise<Buffer> {
  let out = Buffer.alloc(0);
  await openSealed(objectKey, source, keyring, {
    header: (h) => {
      out = Buffer.alloc(h.plainBytes);
    },
    part: (part, offset) => {
      part.copy(out, offset);
    },
  });
  return out;
}
