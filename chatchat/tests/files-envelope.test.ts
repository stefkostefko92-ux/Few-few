import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';
import {
  bufferSource,
  FileCryptoError,
  HEADER_BYTES,
  isSealed,
  kekId,
  Keyring,
  MAGIC,
  parseHeader,
  rewrapHeader,
  seal,
  sealedBytes,
  SEGMENT_BYTES,
  unseal,
} from '../src/storage/envelope.js';
import { EICAR, MAGIC as TYPES, makePdf } from './file-fixtures.js';

/**
 * Форматът на шифрованите файлове (NFR-03, src/storage/envelope.ts): AES-256-GCM на сегменти с
 * отделен ключ на файла (DEK), опакован с главния ключ (KEK). Всяка повреда — грешка, никога
 * „почти верен“ открит текст.
 */

const KEY = 'ckt1/2026/10/0123456789abcdef0123456789abcdef';
const OTHER_KEY = 'ckt2/2026/10/0123456789abcdef0123456789abcdef';
const kek = (fill: number) => Buffer.alloc(32, fill);
const ring = new Keyring(kek(1));

const sealAll = (plain: Uint8Array, r = ring, key = KEY, segment = SEGMENT_BYTES) =>
  Buffer.concat([...seal(key, plain, r, segment)]);
const open = (sealed: Buffer, r = ring, key = KEY) => unseal(key, bufferSource(sealed), r);

async function rejectsWith(p: Promise<unknown>, reason: string): Promise<void> {
  await assert.rejects(
    p,
    (err: unknown) => err instanceof FileCryptoError && err.reason === reason,
  );
}

describe('envelope: обратимост и размер', () => {
  test('празен, 1 байт, точно сегмент, сегмент + 1, много сегменти — същите байтове', async () => {
    const segment = 4096;
    for (const n of [0, 1, segment - 1, segment, segment + 1, 5 * segment + 17]) {
      const plain = randomBytes(n);
      const sealed = sealAll(plain, ring, KEY, segment);
      assert.equal(sealed.length, sealedBytes(n, segment), `размер при ${n}`);
      assert.ok(isSealed(sealed));
      assert.deepEqual(await open(sealed), plain, `съдържание при ${n}`);
    }
  });

  test('файл от 3 MB на 64 KiB сегменти; шифротекстът не съдържа открития текст', async () => {
    const marker = Buffer.from('E37 encoder quadro Rossi');
    const plain = Buffer.concat([randomBytes(3 * 1024 * 1024), marker]);
    const sealed = sealAll(plain);
    assert.equal(sealed.length, HEADER_BYTES + plain.length + 49 * 16);
    assert.equal(sealed.includes(marker), false);
    assert.deepEqual(await open(sealed), plain);
  });

  test('два записа на същото съдържание са различни (случаен DEK и nonce)', () => {
    const plain = Buffer.from('stesso contenuto');
    assert.notDeepEqual(sealAll(plain), sealAll(plain));
  });

  test('приеманите типове файлове не се бъркат с шифрован обект', () => {
    for (const bytes of [TYPES.jpeg, TYPES.png, TYPES.webp, TYPES.heic, makePdf([['x']])]) {
      assert.equal(isSealed(bytes), false);
    }
    assert.equal(isSealed(Buffer.from(EICAR)), false);
    assert.equal(isSealed(Buffer.from('{"log":1}')), false);
    assert.equal(isSealed(MAGIC.subarray(0, 4)), false, 'по-къс от магията');
  });
});

describe('envelope: целост (подправка, отрязване, чужд ключ)', () => {
  const plain = randomBytes(3 * 4096 + 100);
  const sealed = sealAll(plain, ring, KEY, 4096);
  const flip = (at: number) => {
    const copy = Buffer.from(sealed);
    copy[at] = (copy[at] ?? 0) ^ 0x01;
    return copy;
  };

  test('обърнат бит в ядрото, в опаковката, в тялото и в tag-а → corrupt', async () => {
    for (const at of [12, 20, 50, 85, HEADER_BYTES + 3, sealed.length - 1]) {
      await rejectsWith(open(flip(at)), 'corrupt');
    }
  });

  test('отрязан (без последния сегмент), удължен и с разменени сегменти → corrupt', async () => {
    const seg = 4096 + 16;
    await rejectsWith(open(sealed.subarray(0, sealed.length - 116)), 'corrupt');
    await rejectsWith(open(Buffer.concat([sealed, Buffer.alloc(16)])), 'corrupt');
    const a = sealed.subarray(HEADER_BYTES, HEADER_BYTES + seg);
    const b = sealed.subarray(HEADER_BYTES + seg, HEADER_BYTES + 2 * seg);
    const swapped = Buffer.concat([
      sealed.subarray(0, HEADER_BYTES),
      b,
      a,
      sealed.subarray(HEADER_BYTES + 2 * seg),
    ]);
    await rejectsWith(open(swapped), 'corrupt');
    await rejectsWith(open(sealed.subarray(0, 40)), 'corrupt');
  });

  test('преместен под ключа на друг обект (друг клиент) → не се отваря', async () => {
    await rejectsWith(open(sealed, ring, OTHER_KEY), 'corrupt');
  });

  test('непознат KEK → unknown_key; стар KEK в ключодържателя → чете се', async () => {
    await rejectsWith(open(sealed, new Keyring(kek(2))), 'unknown_key');
    assert.deepEqual(await open(sealed, new Keyring(kek(2), [kek(1)])), plain);
  });

  test('непозната версия/алгоритъм или абсурден размер на сегмента → corrupt', () => {
    for (const [at, value] of [
      [8, 2],
      [9, 7],
      [10, 0xff],
    ] as const) {
      const copy = Buffer.from(sealed);
      copy[at] = value;
      assert.throws(() => parseHeader(copy), FileCryptoError);
    }
  });
});

describe('envelope: KEK и ротация', () => {
  test('id на KEK — 8 байта, стабилен, различен за различни ключове, без байтовете на ключа', () => {
    assert.equal(kekId(kek(1)).length, 8);
    assert.deepEqual(kekId(kek(1)), kekId(kek(1)));
    assert.notDeepEqual(kekId(kek(1)), kekId(kek(2)));
    assert.equal(ring.currentId.includes('01010101'), false);
  });

  test('ключодържателят приема само 32-байтови ключове', () => {
    assert.throws(() => new Keyring(Buffer.alloc(16)));
    assert.throws(() => new Keyring(kek(1), [Buffer.alloc(31)]));
    assert.equal(new Keyring(kek(1), [kek(2), kek(1)]).size, 2);
  });

  test('преопаковката сменя само заглавката: тялото е същото, чете се само с новия KEK', async () => {
    const plain = randomBytes(10_000);
    const sealed = sealAll(plain, new Keyring(kek(1)));
    const next = new Keyring(kek(2), [kek(1)]);
    const header = rewrapHeader(parseHeader(sealed.subarray(0, HEADER_BYTES)), next, KEY);
    assert.equal(header.length, HEADER_BYTES);
    assert.equal(parseHeader(header).kekId, next.currentId);
    const rewrapped = Buffer.concat([header, sealed.subarray(HEADER_BYTES)]);
    assert.deepEqual(rewrapped.subarray(HEADER_BYTES), sealed.subarray(HEADER_BYTES));
    assert.deepEqual(await open(rewrapped, new Keyring(kek(2))), plain);
    await rejectsWith(open(rewrapped, new Keyring(kek(1))), 'unknown_key');
  });
});
